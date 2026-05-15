const router = require('express').Router();
const pool   = require('../db/pool');
const { auth } = require('../middleware/auth');

// POST /api/suivis  — ajouter un suivi à un bon
router.post('/', auth, async (req, res) => {
  const { work_order_id, note, type, nouveau_status } = req.body;

  if (!work_order_id || !note)
    return res.status(400).json({ error: 'work_order_id et note requis' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Récupérer le statut actuel
    const wo = await client.query(
      'SELECT status FROM work_orders WHERE id = $1', [work_order_id]
    );
    if (!wo.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bon non trouvé' }); }

    const ancien_status = wo.rows[0].status;

    // Insérer le suivi
    const { rows } = await client.query(`
      INSERT INTO suivis (work_order_id, user_id, note, type, ancien_status, nouveau_status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [work_order_id, req.user.id, note, type || 'note',
        ancien_status, nouveau_status || null]);

    // Mettre à jour le statut si changé
    if (nouveau_status && nouveau_status !== ancien_status) {
      await client.query(
        'UPDATE work_orders SET status = $1 WHERE id = $2',
        [nouveau_status, work_order_id]
      );
    }

    await client.query('COMMIT');

    // Retourner le suivi avec infos user
    const full = await pool.query(`
      SELECT s.*, u.nom, u.prenom, u.initiales, u.role
      FROM suivis s JOIN users u ON s.user_id = u.id
      WHERE s.id = $1
    `, [rows[0].id]);

    res.status(201).json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// GET /api/suivis?work_order_id=...
router.get('/', auth, async (req, res) => {
  const { work_order_id } = req.query;
  if (!work_order_id) return res.status(400).json({ error: 'work_order_id requis' });

  try {
    const { rows } = await pool.query(`
      SELECT s.*, u.nom, u.prenom, u.initiales, u.role
      FROM suivis s JOIN users u ON s.user_id = u.id
      WHERE s.work_order_id = $1
      ORDER BY s.created_at DESC
    `, [work_order_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
