const router   = require('express').Router();
const pool     = require('../db/pool');
const { auth, requireRole } = require('../middleware/auth');

// ─── GET /api/workorders ──────────────────────────────────────────────────────
// Query params: status, advisor_id, search, limit, offset
router.get('/', auth, async (req, res) => {
  const { status, advisor_id, search, limit = 50, offset = 0 } = req.query;

  let where = ['1=1'];
  let params = [];
  let i = 1;

  if (status)     { where.push(`wo.status = $${i++}`);       params.push(status); }
  if (advisor_id) { where.push(`wo.advisor_id = $${i++}`);   params.push(advisor_id); }
  if (search) {
    where.push(`(wo.numero ILIKE $${i} OR wo.client_nom ILIKE $${i} OR wo.vehicule ILIKE $${i})`);
    params.push(`%${search}%`); i++;
  }

  // Conseillers ne voient que leurs propres bons (sauf directeur et admin)
  if (req.user.role === 'conseiller') {
    where.push(`wo.advisor_id = $${i++}`);
    params.push(req.user.id);
  }

  try {
    const sql = `
      SELECT
        wo.*,
        u.nom AS advisor_nom, u.prenom AS advisor_prenom,
        u.initiales AS advisor_initiales, u.role AS advisor_role,
        COUNT(s.id)::int AS suivi_count,
        MAX(s.created_at) AS dernier_suivi
      FROM work_orders wo
      LEFT JOIN users u ON wo.advisor_id = u.id
      LEFT JOIN suivis s ON s.work_order_id = wo.id
      WHERE ${where.join(' AND ')}
      GROUP BY wo.id, u.id
      ORDER BY
        CASE wo.status WHEN 'suivi' THEN 0 WHEN 'open' THEN 1 WHEN 'attente' THEN 2 ELSE 3 END,
        wo.date_entree DESC
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(sql, params);
    const total = await pool.query(
      `SELECT COUNT(*) FROM work_orders wo WHERE ${where.join(' AND ')}`,
      params.slice(0, -2)
    );
    res.json({ data: rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/workorders/stats ────────────────────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        status,
        COUNT(*)::int AS count,
        advisor_id,
        u.nom AS advisor_nom, u.prenom AS advisor_prenom, u.initiales
      FROM work_orders wo
      LEFT JOIN users u ON wo.advisor_id = u.id
      GROUP BY status, advisor_id, u.nom, u.prenom, u.initiales
    `);

    const sans_suivi = await pool.query(`
      SELECT wo.id, wo.numero, wo.client_nom, wo.status,
             u.initiales AS advisor_initiales, u.nom AS advisor_nom
      FROM work_orders wo
      LEFT JOIN users u ON wo.advisor_id = u.id
      LEFT JOIN suivis s ON s.work_order_id = wo.id
      WHERE wo.status != 'livre' AND wo.status != 'annule'
      GROUP BY wo.id, u.id
      HAVING COUNT(s.id) = 0
      ORDER BY wo.date_entree ASC
    `);

    res.json({ par_status: rows, sans_suivi: sans_suivi.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/workorders/:id ──────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT wo.*, u.nom AS advisor_nom, u.prenom AS advisor_prenom,
             u.initiales AS advisor_initiales, u.role AS advisor_role
      FROM work_orders wo
      LEFT JOIN users u ON wo.advisor_id = u.id
      WHERE wo.id = $1
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Bon non trouvé' });

    const suivis = await pool.query(`
      SELECT s.*, u.nom, u.prenom, u.initiales, u.role
      FROM suivis s
      JOIN users u ON s.user_id = u.id
      WHERE s.work_order_id = $1
      ORDER BY s.created_at DESC
    `, [req.params.id]);

    res.json({ ...rows[0], suivis: suivis.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/workorders ─────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const {
    numero, client_nom, client_tel, vehicule, vehicule_annee,
    vehicule_marque, vehicule_modele, kilometrage, vin,
    description, montant, date_promesse, status, advisor_id, source, serti_id
  } = req.body;

  if (!numero || !client_nom || !vehicule)
    return res.status(400).json({ error: 'Champs requis: numero, client_nom, vehicule' });

  try {
    const { rows } = await pool.query(`
      INSERT INTO work_orders
        (numero, client_nom, client_tel, vehicule, vehicule_annee,
         vehicule_marque, vehicule_modele, kilometrage, vin,
         description, montant, date_promesse, status, advisor_id, source, serti_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [numero, client_nom, client_tel, vehicule, vehicule_annee,
        vehicule_marque, vehicule_modele, kilometrage, vin,
        description, montant || 'À estimer', date_promesse,
        status || 'open', advisor_id || req.user.id,
        source || 'manuel', serti_id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Numéro de bon déjà existant' });
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PATCH /api/workorders/:id ────────────────────────────────────────────────
router.patch('/:id', auth, async (req, res) => {
  const allowed = ['client_nom','client_tel','vehicule','description','montant',
                   'date_promesse','status','advisor_id','kilometrage'];
  const updates = Object.keys(req.body)
    .filter(k => allowed.includes(k))
    .map((k, i) => `${k} = $${i + 2}`);

  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });

  try {
    const { rows } = await pool.query(
      `UPDATE work_orders SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      [req.params.id, ...Object.values(req.body).filter((_, i) =>
        allowed.includes(Object.keys(req.body)[i]))]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Bon non trouvé' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── DELETE /api/workorders/:id ───────────────────────────────────────────────
router.delete('/:id', auth, requireRole('admin', 'directeur'), async (req, res) => {
  try {
    await pool.query('DELETE FROM work_orders WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
