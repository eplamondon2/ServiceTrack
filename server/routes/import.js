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

function nettoierJson(raw) {
  var jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  if (!jsonStr.endsWith(']')) {
    var last = jsonStr.lastIndexOf('},');
    if (last > 0) {
      jsonStr = jsonStr.substring(0, last + 1) + ']';
    }
  }
  return jsonStr;
}

async function chercherNomClient(vin) {
  if (!vin) return null;
  var result = await pool.query(
    'SELECT client_nom FROM work_orders WHERE vin = $1 AND client_nom NOT ILIKE $2 AND client_nom NOT ILIKE $3 ORDER BY created_at DESC LIMIT 1',
    [vin, '%GARANTIE%', '%GARANT%']
  );
  if (result.rows.length > 0) return result.rows[0].client_nom;
  return null;
}

function estGarantie(nom) {
  if (!nom) return false;
  var upper = nom.toUpperCase();
  return upper.includes('GARANTIE') || upper.includes('GARANT');
}

router.post('/rdv', auth, requireRole('admin','directeur','preposee','conseiller'), upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

  try {
    var contenu = req.file.buffer.toString('utf-8');
    var content = [{ type: 'text', text: PROMPT_RDV + '\n\nContenu du fichier:\n' + contenu }];

    var response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: content }]
    });

    var raw = response.content[0].text;
    var jsonStr = nettoierJson(raw);
    var bons = JSON.parse(jsonStr);
    if (!Array.isArray(bons)) throw new Error('Format inattendu');

    var usersResult = await pool.query('SELECT id, email FROM users');
    var byEmail = {};
    usersResult.rows.forEach(function(u) { byEmail[u.email] = u.id; });

    // Archiver les anciens RDV au lieu de les supprimer
    // On les passe en statut archive pour conserver les NIV
    await pool.query('UPDATE work_orders SET status = $1 WHERE type_bon = $2 AND status != $3', ['annule', 'rdv', 'annule']);

    var importes = 0;
    var erreurs = 0;
    var details = [];

    for (var idx = 0; idx < bons.length; idx++) {
      var bon = bons[idx];
      try {
        var advisorId = bon.advisor_email ? byEmail[bon.advisor_email] || null : null;
        var vehicule = bon.vehicule || [bon.annee, bon.marque, bon.modele].filter(Boolean).join(' ');
        var dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
        var num = bon.numero || ('RDV-' + dateStr + '-' + String(idx+1).padStart(3,'0'));

        await pool.query(
          'INSERT INTO work_orders (numero, client_nom, client_tel, vehicule, vehicule_annee, vehicule_marque, vehicule_modele, vin, description, montant, date_promesse, advisor_id, source, type_bon, courtoisie, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (numero) DO UPDATE SET status = $16, updated_at = NOW()',
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
    var contenu = req.file.buffer.toString('utf-8');
    var MAX_CHARS = 80000;
    var chunks = [];
    for (var ci = 0; ci < contenu.length; ci += MAX_CHARS) {
      chunks.push(contenu.slice(ci, ci + MAX_CHARS));
    }

    var tousLesBons = [];

    for (var ci2 = 0; ci2 < chunks.length; ci2++) {
      var content = [{ type: 'text', text: PROMPT_WP + '\n\nContenu du fichier:\n' + chunks[ci2] }];
      var response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: content }]
      });

      var raw = response.content[0].text;
      var jsonStr = nettoierJson(raw);

      try {
        var bons = JSON.parse(jsonStr);
        if (Array.isArray(bons)) {
          tousLesBons = tousLesBons.concat(bons);
        }
      } catch (e) {
        console.error('Erreur parsing chunk:', e.message);
      }
    }

    var usersResult = await pool.query('SELECT id, email FROM users');
    var byEmail = {};
    usersResult.rows.forEach(function(u) { byEmail[u.email] = u.id; });

    var importes = 0;
    var fermes = 0;
    var erreurs = 0;
    var details = [];
    var wpNumerosActifs = [];

    for (var idx = 0; idx < tousLesBons.length; idx++) {
      var bon = tousLesBons[idx];
      if (!bon.numero_wp) continue;

      try {
        var advisorId = bon.advisor_email ? byEmail[bon.advisor_email] || null : null;
        var vehicule = bon.vehicule || [bon.annee, bon.marque, bon.modele].filter(Boolean).join(' ');
        var numero = 'WP-' + bon.numero_wp;
        wpNumerosActifs.push(numero);

        // Résoudre le nom du client pour les garanties
        var clientNom = bon.client_nom;
        if (estGarantie(clientNom) && bon.vin) {
          var nomTrouve = await chercherNomClient(bon.vin);
          if (nomTrouve) {
            clientNom = nomTrouve + ' (garantie)';
          }
        }

        var existing = await pool.query('SELECT id FROM work_orders WHERE numero = $1', [numero]);

        if (existing.rows.length > 0) {
          await pool.query(
            'UPDATE work_orders SET client_nom=$1, vehicule=$2, description=$3, montant=$4, advisor_id=$5, updated_at=NOW() WHERE numero=$6',
            [clientNom, vehicule, bon.description || null, bon.montant || 'A estimer', advisorId, numero]
          );
        } else {
          await pool.query(
            'INSERT INTO work_orders (numero, numero_wp, client_nom, client_tel, vehicule, vehicule_annee, vehicule_marque, vehicule_modele, vin, description, montant, date_entree, advisor_id, source, type_bon, courtoisie, status, statut_detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',
            [numero, bon.numero_wp, clientNom, bon.client_tel || null, vehicule, bon.annee || null, bon.marque || null, bon.modele || null, bon.vin || null, bon.description || null, bon.montant || 'A estimer', bon.date_entree || new Date().toISOString().slice(0,10), advisorId, 'pdf', 'wp', bon.courtoisie || false, 'open', 'vehicule_sur_place']
          );
          importes++;
        }
        details.push({ numero: numero, status: 'ok' });
      } catch (err) {
        erreurs++;
        details.push({ numero: bon.numero_wp, status: 'erreur', message: err.message });
      }
    }

    // Fermer automatiquement les WP qui ne sont plus dans le rapport
    if (wpNumerosActifs.length > 0) {
      var placeholders = wpNumerosActifs.map(function(_, i) { return '$' + (i + 1); }).join(',');
      var fermeParams = wpNumerosActifs.concat(['livre', 'wp', 'livre']);
      var fermeResult = await pool.query(
        'UPDATE work_orders SET status = $' + (wpNumerosActifs.length + 1) + ' WHERE type_bon = $' + (wpNumerosActifs.length + 2) + ' AND status != $' + (wpNumerosActifs.length + 3) + ' AND numero NOT IN (' + placeholders + ') RETURNING numero',
        fermeParams
      );
      fermes = fermeResult.rowCount;
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
