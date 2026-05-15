-- ServiceTrack — Schéma PostgreSQL
-- À exécuter une seule fois sur votre base Railway

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── UTILISATEURS ────────────────────────────────────────────────────────────
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  prenom      TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,            -- bcrypt hash
  role        TEXT NOT NULL CHECK (role IN ('admin','directeur','conseiller','preposee')),
  initiales   TEXT NOT NULL,
  actif       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BONS DE TRAVAIL ─────────────────────────────────────────────────────────
CREATE TABLE work_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          TEXT UNIQUE NOT NULL,              -- ex: WO-24891
  client_nom      TEXT NOT NULL,
  client_tel      TEXT,
  vehicule        TEXT NOT NULL,                     -- "2021 Toyota RAV4 • KM 48 221"
  vehicule_annee  INT,
  vehicule_marque TEXT,
  vehicule_modele TEXT,
  kilometrage     INT,
  vin             TEXT,
  description     TEXT,
  montant         TEXT DEFAULT 'À estimer',
  date_promesse   TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','suivi','attente','livre','annule')),
  advisor_id      UUID REFERENCES users(id),
  source          TEXT DEFAULT 'manuel'             -- 'manuel', 'pdf', 'api'
                    CHECK (source IN ('manuel','pdf','api')),
  serti_id        TEXT,                             -- ID dans Serti si disponible
  date_entree     DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SUIVIS ──────────────────────────────────────────────────────────────────
CREATE TABLE suivis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  note          TEXT NOT NULL,
  type          TEXT DEFAULT 'note'
                  CHECK (type IN ('note','appel','texto','courriel','livraison','statut')),
  ancien_status TEXT,
  nouveau_status TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── IMPORTS ─────────────────────────────────────────────────────────────────
CREATE TABLE imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  source        TEXT NOT NULL CHECK (source IN ('pdf','csv','api')),
  fichier_nom   TEXT,
  bons_importes INT DEFAULT 0,
  bons_erreur   INT DEFAULT 0,
  details       JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEX ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_wo_status      ON work_orders(status);
CREATE INDEX idx_wo_advisor     ON work_orders(advisor_id);
CREATE INDEX idx_wo_date        ON work_orders(date_entree DESC);
CREATE INDEX idx_suivis_wo      ON suivis(work_order_id);
CREATE INDEX idx_suivis_date    ON suivis(created_at DESC);

-- ─── AUTO-UPDATE updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wo_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── DONNÉES INITIALES ───────────────────────────────────────────────────────
-- Mot de passe par défaut: "ServiceTrack2024!" (à changer au 1er login)
-- Hash bcrypt généré avec rounds=12
INSERT INTO users (nom, prenom, email, password, role, initiales) VALUES
  ('Bouchard', 'Marc',    'marc.bouchard@votre-concessionnaire.com',    '$2b$12$placeholder_hash_marc',    'directeur',  'MB'),
  ('Dion',     'Julie',   'julie.dion@votre-concessionnaire.com',       '$2b$12$placeholder_hash_julie',   'conseiller', 'JD'),
  ('Tremblay', 'Patrick', 'patrick.tremblay@votre-concessionnaire.com', '$2b$12$placeholder_hash_patrick', 'conseiller', 'PT'),
  ('Lavoie',   'Sophie',  'sophie.lavoie@votre-concessionnaire.com',    '$2b$12$placeholder_hash_sophie',  'preposee',   'SL'),
  ('Admin',    'Service', 'admin@votre-concessionnaire.com',            '$2b$12$placeholder_hash_admin',   'admin',      'AD');

-- Note: Remplacez les placeholder_hash par de vrais hashes bcrypt
-- ou utilisez le script: node server/scripts/hash-passwords.js
