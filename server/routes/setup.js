const router = require('express').Router();
const pool   = require('../db/pool');

router.get('/', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  try {
    // Ajouter les nouvelles colonnes si elles n'existent pas
    await pool.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS type_bon TEXT DEFAULT 'rdv' CHECK (type_bon IN ('rdv','wp'))`);
    await pool.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS statut_detail TEXT CHECK (statut_detail IN ('rdv_avenir','piece_commande','vehicule_sur_place','hytac','livre'))`);
    await pool.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS date_rdv_avenir TEXT`);
    await pool.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS date_piece_prevue TEXT`);
    await pool.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS courtoisie BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS numero_wp TEXT`);

    res.json({ success: true, message: 'Base de données mise à jour!' });
  } catch (err) {
    console.error('Erreur setup:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
