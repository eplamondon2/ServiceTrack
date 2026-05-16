const router = require('express').Router();
const pool   = require('../db/pool');

router.get('/', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nom         TEXT NOT NULL,
        prenom      TEXT NOT NULL,
        email       TEXT UNIQUE NOT NULL,
        password    TEXT NOT NULL,
        role        TEXT NOT NULL CHECK (role IN ('admin','directeur','conseiller','preposee')),
        initiales   TEXT NOT NULL,
        actif       BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_orders (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        numero          TEXT UNIQUE NOT NULL,
        client_nom      TEXT NOT NULL,
        client_tel      TEXT,
        vehicule        TEXT NOT NULL,
        vehicule_annee  INT,
        vehicule_marque TEXT,
        vehicule_modele TEXT,
        kilometrage     INT,
        vin             TEXT,
        description     TEXT,
        montant         TEXT DEFAULT 'À estimer',
        date_promesse   TEXT,
        status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','suivi','attente','livre','annule')),
        advisor_id      UUID REFERENCES users(id),
        source          TEXT DEFAULT 'manuel' CHECK (source IN ('manuel','pdf','api')),
        serti_id        TEXT,
        date_entree     DATE DEFAULT CURRENT_DATE,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS suivis (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        user_id       UUID NOT NULL REFERENCES users(id),
        note          TEXT NOT NULL,
        type          TEXT DEFAULT 'note' CHECK (type IN ('note','appel','texto','courriel','livraison','statut')),
        ancien_status TEXT,
        nouveau_status TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS imports (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID REFERENCES users(id),
        source        TEXT NOT NULL CHECK (source IN ('pdf','csv','api')),
        fichier_nom   TEXT,
        bons_importes INT DEFAULT 0,
        bons_erreur   INT DEFAULT 0,
        details       JSONB,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wo_status   ON work_orders(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wo_advisor  ON work_orders(advisor_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wo_date     ON work_orders(date_entree DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_suivis_wo   ON suivis(work_order_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_suivis_date ON suivis(created_at DESC)`);

    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS wo_updated_at ON work_orders;
      CREATE TRIGGER wo_updated_at
        BEFORE UPDATE ON work_orders
        FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `);

    await pool.query(`
      INSERT INTO users (nom, prenom, email, password, role, initiales) VALUES
        ('Bouchard', 'Marc',    'marc.bouchard@votre-concessionnaire.com',    '$2a$12$Xs87fiTgb5kuV5hAjRhdQOVaEOIbn0Jf8zfojhi5bZZj0vWywd4Xm', 'directeur',  'MB'),
        ('Dion',     'Julie',   'julie.dion@votre-concessionnaire.com',       '$2a$12$41WWyvGl2.BWSG7mUzzdseASjvNmy5Sf4nfG453Ra/DpbfV5wWb66', 'conseiller', 'JD'),
        ('Tremblay', 'Patrick', 'patrick.tremblay@votre-concessionnaire.com', '$2a$12$RskqZh4rnMZAQGKWcY/fguohWhF6IF.vFSA7NNK.GTWV4EjK/QZre', 'conseiller', 'PT'),
        ('Lavoie',   'Sophie',  'sophie.lavoie@votre-concessionnaire.com',    '$2a$12$uZRTJiyjIo5LNcg0lorD4.QBnkzvN/lVfOY/qBJt8PsqzHULTPSKi', 'preposee',   'SL'),
        ('Admin',    'Service', 'admin@votre-concessionnaire.com',            '$2a$12$r0vSTKNNabIarG89xUqjNuqckCH7HJpJqNSVBt.m0qsgU6klVBWpS', 'admin',      'AD')
      ON CONFLICT (email) DO NOTHING
    `);

    res.json({
      success: true,
      message: 'Base de données initialisée avec succès!',
      tables: ['users', 'work_orders', 'suivis', 'imports'],
      utilisateurs: [
        'marc.bouchard@votre-concessionnaire.com',
        'julie.dion@votre-concessionnaire.com',
        'patrick.tremblay@votre-concessionnaire.com',
        'sophie.lavoie@votre-concessionnaire.com',
        'admin@votre-concessionnaire.com'
      ]
    });
  } catch (err) {
    console.error('Erreur setup:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
