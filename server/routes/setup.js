const router = require('express').Router();
const pool   = require('../db/pool');

router.get('/', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  try {
    // Supprimer les anciens utilisateurs placeholder
    await pool.query(`DELETE FROM users`);

    // Insérer les vrais utilisateurs
    await pool.query(`
      INSERT INTO users (nom, prenom, email, password, role, initiales) VALUES
        ('Langevin',  'Nancy',    'nancy.langevin@hyundaistraymond.ca',  '$2a$12$rPvaJpwww.0V625oMrQiweuUs.cIfJ9zdjtqf8WBAmNuIBf5Yd3bS', 'conseiller',  'NL'),
        ('Boulet',    'Francois', 'francois.boulet@hyundaistraymond.ca', '$2a$12$dfNtEJmwMLNycvi69G6geOn4xSmBtkRKGHlv3emuT1oRKWDRiqnx.', 'conseiller', 'FB'),
       ('Plamondon', 'Etienne',  'eplamondon@hyundaistraymond.ca', '$2a$12$yVr6R6QZaBtFk1TwnZf2MuPvkYYwXnHE64fTJTjnOFM7fRj7fZUMa', 'admin', 'EP'),
        ('Dube',      'Johanne',  'jdube@hyundaistraymond.ca',           '$2a$12$/P0nqO9amn6N5O08BbPLZeAG2OkEb8HPWmZFAHuC.yPCPa934ERrS', 'preposee',   'JD'),
        ('Admin',     'Service',  'admin@hyundaistraymond.ca',           '$2a$12$r0vSTKNNabIarG89xUqjNuqckCH7HJpJqNSVBt.m0qsgU6klVBWpS', 'admin',      'AD')
      ON CONFLICT (email) DO NOTHING
    `);

    res.json({ success: true, message: 'Utilisateurs mis à jour!', utilisateurs: [
      'nancy.langevin@hyundaistraymond.ca',
      'francois.boulet@hyundaistraymond.ca',
      'eplamondon@hyundaistraymond.ca',
      'jdube@hyundaistraymond.ca',
      'admin@hyundaistraymond.ca'
    ]});
  } catch (err) {
    console.error('Erreur setup:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
