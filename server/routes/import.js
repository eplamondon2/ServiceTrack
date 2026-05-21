const router    = require('express').Router();
const multer    = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../db/pool');
const { auth, requireRole } = require('../middleware/auth');

const upload    = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT_RDV = `Tu es un assistant specialise dans l extraction de donnees de rendez-vous depuis des rapports Serti Keyloop de Hyundai St-Raymond.

Analyse ce document et extrais TOUS les rendez-vous trouves.

MAPPING DES AVISEURS:
- NL = nancy.langevin@hyundaistraymond.ca
- FB1 ou FB = francois.boulet@hyundaistraymond.ca
- SP1 ou SP = sonia.perusse@hyundaistraymond.ca
- JD = jdube@hyundaistraymond.ca

Reponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou apres, sans balises markdown.

Format exact:
[
  {
    "numero": "RDV-001",
    "client_nom": "JEAN SIMARD",
    "client_tel": "581 419-1063",
    "annee": 2022,
    "marque": "HYUNDAI",
    "modele": "SANTA FE",
    "vehicule": "2022 HYUNDAI SANTA FE",
    "kilometrage": 66000,
    "vin": "KM8S7DA25NU017299",
    "description": "Service d entretien 1",
    "montant": "132.17$",
    "date_promesse": "2026-05-19 07:30",
    "advisor_email": "nancy.langevin@hyundaistraymond.ca",
    "courtoisie": false
  }
]

Numérote sequentiellement: RDV-001, RDV-002, etc.
Si un champ est absent, utilise null. Extrais TOUS les rendez-vous sans exception.`;

const PROMPT_WP = `Tu es un assistant specialise dans l extraction de bons de travail depuis des rapports Serti Keyloop de Hyundai St-Raymond.

Ce rapport contient des bons de travail WP avec statuts OUVERT, FERME, REOUVERT.
Extrais SEULEMENT les bons avec statut OUVERT ou REOUVERT. Ignore les FERME.

MAPPING DES AVISEURS:
- NL = nancy.langevin@hyundaistraymond.ca
- FB1 ou FB = francois.boulet@hyundaistraymond.ca
- SP1 ou SP = sonia.perusse@hyundaistraymond.ca
- JD = jdube@hyundaistraymond.ca

Reponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou apres, sans balises markdown.

Format exact:
[
  {
    "numero_wp": "WP43003",
    "client_nom": "FREDERIC BOUCHER",
    "client_tel": "418 208-3197",
    "annee": 2024,
    "marque": "HYUNDAI",
    "modele": "IONIQ 5",
    "vehicule": "2024 HYUNDAI IONIQ 5",
    "vin": "KM8KRDDF7RU321832",
    "description": "Resume des travaux",
    "montant": "2669.39$",
    "date_entree": "2026-03-18",
    "advisor_email": "nancy.langevin@hyundaistraymond.ca",
    "statut_serti": "OUVERT",
    "courtoisie": false
  }
]

Si un champ est absent, utilise null. Extrais TOUS les bons OUVERT et REOUVERT sans exception.`;

router.post('/rdv', auth, requireRole('admin','directeur','preposee','conseiller'), upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

  try {
    const contenu = req.file.buffer.toString('utf-8');
    const content = [{ type: 'text', text: PROMPT_RDV + '\n\nContenu du fichier:\n' + contenu }];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content }]
    });

    const raw = response.content[0].text;
    let jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    if (!jsonStr.endsWith(']')) {
      const last = jsonStr.lastIndexOf('},');
      if (last > 0) jsonStr = jsonStr.substring(0, last + 1) + ']';
    }

    const bons = JSON.parse(jsonStr);
    if (!Array.isArray(bons)) throw new Error('Format inattendu');

    const { rows: users } = await pool.query('SELECT id, email FROM users');
    const byEmail = {};
    users.forEach(function(u) { byEmail[u.email] = u.id; });

    await pool.query('DELETE FROM suivis WHERE work_order_id IN (SELECT id FROM work_orders WHERE type_bon = $1)', ['rdv']);
    await pool.query('DELETE FROM imports WHERE user_id IN (SELECT id FROM users) AND source = $1 AND fichier_nom NOT LIKE $2', ['pdf', '%WP%']);
    await pool.query('DELETE FROM work_orders WHERE type_bon = $1', ['rdv']);

    let importes = 0, erreurs = 0, details = [];

    for (let idx = 0; idx < bons.length; idx++) {
      const bon = bons[idx];
      try {
        const advisorId = bon.advisor_email ? byEmail[bon.advisor_email] || null : null;
        const vehicule = bon.vehicule || [bon.annee, bon.marque, bon.modele].filter(Boolean).join(' ');
        const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const num = bon.numero || ('RDV-' + date + '-' + String(idx+1).padStart(3,'0'));

        await pool.query(
          'INSERT INTO work_orders (numero, client_nom, client_tel, vehicule, vehicule_annee, vehicule_marque, vehicule_modele, vin, description, montant, date_promesse, advisor_id, source, type_bon, courtoisie, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (numero) DO NOTHING',
          [num, bon.client_nom, bon.client_tel || null, vehicule, bon.annee || null, bon.marque || null, bon.modele || null, bon.vin || null, bon.description || null, bon.montant || 'A estimer', bon.date_promesse || null, advisorId, 'pdf', 'rdv', bon.courtoisie || false, 'open']
        );
        importes++;
        details.push({ numero: num, status: 'ok' });
      } catch (err) {
        erreurs++;
        details.push({ status: 'erreur', message: err.message });
      }
    }

    await pool.query(
      'INSERT INTO imports (user_id, source, fichier_nom, bons_importes, bons_erreur, details) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, 'pdf', req.file.originalname, importes, erreurs, JSON.stringify(details)]
    );

    res.json({ success: true, importes: importes, erreurs: erreurs, total: bons.length, type: 'rdv' });
  } catch (err) {
    console.error('Erreur import RDV:', err);
    res.status(500).json({ error: 'Erreur lors du traitement', details: err.message });
  }
});

router.post('/wp', auth, requireRole('admin','directeur','preposee','conseiller'), upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

  try {
    const contenu = req.file.buffer.toString('utf-8');
    const MAX_CHARS = 80000;
    const chunks = [];
    for (let i = 0; i < contenu.length; i += MAX_CHARS) {
      chunks.push(contenu.slice(i, i + MAX_CHARS));
    }

    let tousLesBons = [];

    for (let c = 0; c < chunks.length; c++) {
      const content = [{ type: 'text', text: PROMPT_WP + '\n\nContenu du fichier:\n' + chunks[c] }];
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content }]
      });

      const raw = response.content[0].text;
      let jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      if (!jsonStr.endsWith(']')) {
        const last = jsonStr.lastIndexOf('},');
        if (last > 0) jsonStr = jsonStr.substring(0, last + 1) + ']';
      }

      try {
        const bons = JSON.parse(jsonStr);
        if (Array.isArray(bons)) tousLesBons = tousLesBons.concat(bons);
      } catch (e) {}
    }

    const { rows: users } = await pool.query('SELECT id, email FROM users');
    const byEmail = {};
    users.forEach(function(u) { byEmail[u.email] = u.id; });

    let importes = 0, fermes = 0, erreurs = 0, details = [];
    const wpNumerosActifs = [];

    for (let idx = 0; idx < tousLesBons.length; idx++) {
      const bon = tousLesBons[idx];
      if (!bon.numero_wp) continue;

      try {
        const advisorId = bon.advisor_email ? byEmail[bon.advisor_email] || null : null;
        const vehicule = bon.vehicule || [bon.annee, bon.marque, bon.modele].filter(Boolean).join(' ');
        const numero = 'WP-' + bon.numero_wp;
        wpNumerosActifs.push(numero);

        const existing = await pool.query('SELECT id FROM work_orders WHERE numero = $1', [numero]);

        if (existing.rows.length > 0) {
          await pool.query(
            'UPDATE work_orders SET client_nom=$1, vehicule=$2, description=$3, montant=$4, advisor_id=$5, updated_at=NOW() WHERE numero=$6',
            [bon.client_nom, vehicule, bon.description || null, bon.montant || 'A estimer', advisorId, numero]
          );
        } else {
          await pool.query(
            'INSERT INTO work_orders (numero, numero_wp, client_nom, client_tel, vehicule, vehicule_annee, vehicule_marque, vehicule_modele, vin, description, montant, date_entree, advisor_id, source, type_bon, courtoisie, status, statut_detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',
            [numero, bon.numero_wp, bon.client_nom, bon.client_tel || null, vehicule, bon.annee || null, bon.marque || null, bon.modele || null, bon.vin || null, bon.description || null, bon.montant || 'A estimer', bon.date_entree || new Date().toISOString().slice(0,10), advisorId, 'pdf', 'wp', bon.courtoisie || false, 'open', 'vehicule_sur_place']
          );
          importes++;
        }
        details.push({ numero: numero, status: 'ok' });
      } catch (err) {
        erreurs++;
        details.push({ numero: bon.numero_wp, status: 'erreur', message: err.message });
      }
    }

    if (wpNumerosActifs.length > 0) {
      const placeholders = wpNumerosActifs.map(function(_, i) { return '$' + (i+1); }).join(',');
      const result = await pool.query(
        'UPDATE work_orders SET status = $' + (wpNumerosActifs.length+1) + ' WHERE type_bon = $' + (wpNumerosActifs.length+2) + ' AND status != $' + (wpNumerosActifs.length+3) + ' AND numero NOT IN (' + placeholders + ') RETURNING numero',
        wpNumerosActifs.concat(['livre', 'wp', 'livre'])
      );
      fermes = result.rowCount;
    }

    await pool.query(
      'INSERT INTO imports (user_id, source, fichier_nom, bons_importes, bons_erreur, details) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, 'pdf', req.file.originalname, importes, erreurs, JSON.stringify(details)]
    );

    res.json({ success: true, importes: importes, fermes: fermes, erreurs: erreurs, total: tousLesBons.length, type: 'wp' });
  } catch (err) {
    console.error('Erreur import WP:', err);
    res.status(500).json({ error: 'Erreur lors du traitement', details: err.message });
  }
});

router.post('/pdf', auth, requireRole('admin','directeur','preposee','conseiller'), upload.single('fichier'), async (req, res) => {
  res.redirect(307, '/api/import/rdv');
});

module.exports = router;
