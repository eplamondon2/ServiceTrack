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
