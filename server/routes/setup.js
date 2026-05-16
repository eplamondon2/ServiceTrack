const router = require('express').Router();
const pool   = require('../db/pool');

router.get('/', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  try {
    await pool.query(`DELETE FROM users`);

    await pool.query(`
      INSERT INTO users (nom, prenom, email, password, role, initiales) VALUES
        ('Langevin',  'Nancy',    'nancy.langevin@hyundaistraymond.ca',  '$2a$12$se2KZDZOdfOl3gW2tXJZF.Y3TtovxwgyMfLsrv8rAe3DALSryfqOW', 'conseiller', 'NL'),
        ('Boulet',    'Francois', 'francois.boulet@hyundaistraymond.ca', '$2a$12$se2KZDZOdfOl3gW2tXJZF.Y3TtovxwgyMfLsrv8rAe3DALSryfqOW', 'conseiller', 'FB'),
        ('Perusse',   'Sonia',    'sonia.perusse@hyundaistraymond.ca',   '$2a$12$se2KZDZOdfOl3gW2tXJZF.Y3TtovxwgyMfLsrv8rAe3DALSryfqOW', 'directeur',  'SP'),
        ('Dube',      'Johanne',  'jdube@hyundaistraymond.ca',           '$2a$12$se2KZDZOdfOl3gW2tXJZF.Y3TtovxwgyMfLsrv8rAe3DALSryfqOW', 'preposee',   'JD'),
        ('Plamondon', 'Etienne',  'eplamondon@hyundaistraymond.ca',       '$2a$12$se2KZDZOdfOl3gW2tXJZF.Y3TtovxwgyMfLsrv8rAe3DALSryfqOW', 'admin',      'EP')
      ON
