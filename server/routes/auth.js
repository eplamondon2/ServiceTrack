const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../db/pool');
const { auth } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND actif = TRUE',
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role,
        nom: user.nom, prenom: user.prenom, initiales: user.initiales },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: user.id, nom: user.nom, prenom: user.prenom,
        email: user.email, role: user.role, initiales: user.initiales
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nom, prenom, email, role, initiales FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res) => {
  const { ancien, nouveau } = req.body;
  if (!ancien || !nouveau || nouveau.length < 8)
    return res.status(400).json({ error: 'Mot de passe trop court (min 8 caractères)' });

  try {
    const { rows } = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const ok = await bcrypt.compare(ancien, rows[0].password);
    if (!ok) return res.status(401).json({ error: 'Ancien mot de passe incorrect' });

    const hash = await bcrypt.hash(nouveau, 12);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
