const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');
const { auth, requireRole } = require('../middleware/auth');

// GET /api/users — liste des utilisateurs (admin/directeur)
router.get('/', auth, requireRole('admin','directeur'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nom, prenom, email, role, initiales, actif, created_at FROM users ORDER BY nom'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/users — créer un utilisateur
router.post('/', auth, requireRole('admin'), async (req, res) => {
  const { nom, prenom, email, password, role, initiales } = req.body;
  if (!nom || !prenom || !email || !password || !role)
    return res.status(400).json({ error: 'Tous les champs sont requis' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(`
      INSERT INTO users (nom, prenom, email, password, role, initiales)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, nom, prenom, email, role, initiales
    `, [nom, prenom, email.toLowerCase(), hash, role, initiales || (prenom[0]+nom[0]).toUpperCase()]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/users/:id/actif — activer/désactiver
router.patch('/:id/actif', auth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE users SET actif = $1 WHERE id = $2', [req.body.actif, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
