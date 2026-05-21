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

Le numero_adresse est le code court apres le nom du client sur la meme ligne, exemple:
  07:30 PIERRE MORISSETTE  PIER04  418 329-2241  --> numero_adresse = PIER04
  07:30 GERARD DESCHENES   059A    418 875-2832  --> numero_adresse = 059A
  07:30 PATRICK MASSON     5635    418 111-2222  --> numero_adresse = 5635
Si le client n a pas de numero_adresse, utilise null.

Le numero_br est le Numero B.R. dans la section Aviseur, exemple:
  Numero B.R. .........: WP44189  --> numero_br = WP44189
Si absent, utilise null.

Pour la courtoisie, cherche la colonne V dans le tableau (4eme colonne apres NIV): O = Oui, N = Non.

Reponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou apres, sans balises markdown.

Format exact:
[
  {
    "numero_adresse": "PIER04",
    "numero_br": null,
    "date_rdv": "2026-05-21",
    "heure_rdv": "07:30",
    "client_nom": "PIERRE MORISSETTE",
    "client_tel": "418 329-2241",
    "annee": 2022,
    "marque": "HYUNDAI",
    "modele": "KONA",
    "vehicule": "2022 HYUNDAI KONA",
    "kilometrage": 70000,
    "vin": "KM8K1CAB8NU764049",
    "description": "Service d entretien 1",
    "montant": "132.17$",
    "advisor_email": "sonia.perusse@hyundaistraymond.ca",
    "courtoisie": false
  }
]

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
    if (last > 0) jsonStr = jsonStr.substring(0, last + 1) + ']';
  }
  return jsonStr;
}

async function chercherNomClient(vin) {
  if (!vin) return null;
  try {
    var result = await pool.query(
      'SELECT client_nom FROM work_orders WHERE vin = $1 AND client_nom NOT ILIKE $2 AND client_nom NOT ILIKE $3 ORDER BY created_at DESC LIMIT 1',
      [vin, '%GARANTIE%', '%GARANT%']
    );
    if (result.rows.length > 0) return result.rows[0].client_nom;
  } catch (e) {}
  return null;
}

function estGarantie(nom) {
  if (!nom) return false;
  var upper = nom.toUpperCase();
  return upper.includes('GARANTIE') || upper.includes('GARANT');
}

async function logImport(userId, fichierNom, importes, erreurs, details) {
  try {
    await pool.query(
      'INSERT INTO imports (user_id, source, fichier_nom, bons_importes, bons_erreur, details) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, 'pdf', fichierNom, importes, erreurs, JSON.stringify(details)]
    );
  } catch (e) {
    console.log('Log import ignore:', e.message);
  }
}

function genNumeroRdv(bon, idx, dateStr) {
  if (bon.numero_br) return 'RDV-' + bon.numero_br;
  if (bon.numero_adresse) return 'RDV-' + dateStr + '-' + bon.numero_adresse;
  return 'RDV-' + dateStr + '-' + String(idx + 1).padStart(3, '0');
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

    // Archiver les anciens RDV actifs
    await pool.query(
      'UPDATE work_orders SET status = $1 WHERE type_bon = $2 AND status = $3',
      ['annule', 'rdv', 'open']
    );

    var importes = 0;
    var erreurs = 0;
    var details = [];

    // Déterminer la date du rapport
    var dateRapport = bons.length > 0 && bons[0].date_rdv
      ? bons[0].date_rdv.replace(/-/g, '')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (var idx = 0; idx < bons.length; idx++) {
      var bon = bons[idx];
      try {
        var advisorId = bon.advisor_email ? byEmail[bon.advisor_email] || null : null;
        var vehicule = bon.vehicule || [bon.annee, bon.marque, bon.modele].filter(Boolean).join(' ');
        var num = genNumeroRdv(bon, idx, dateRapport);
        var datePromesse = bon.date_rdv && bon.heure_rdv ? bon.date_rdv + ' ' + bon.heure_rdv : bon.date_rdv || null;

        await pool.query(
          'INSERT INTO work_orders (numero, client_nom, client_tel, vehicule, vehicule_annee, vehicule_marque, vehicule_modele, vin, description, montant, date_promesse, advisor_id, source, type_bon, courtoisie, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (numero) DO UPDATE SET client_nom=EXCLUDED.client_nom, vehicule=EXCLUDED.vehicule, date_promesse=EXCLUDED.date_promesse, advisor_id=EXCLUDED.advisor_id, status=$16, updated_at=NOW()',
          [num, bon.client_nom, bon.client_tel || null, vehicule,
           bon.annee || null, bon.marque || null, bon.modele || null,
           bon.vin || null, bon.description || null, bon.montant || 'A estimer',
           datePromesse, advisorId, 'pdf', 'rdv', bon.courtoisie || false, 'open']
        );
        importes++;
        details.push({ numero: num, client: bon.client_nom, status: 'ok' });
      } catch (err) {
        erreurs++;
        details.push({ status: 'erreur', message: err.message });
      }
    }

    await logImport(req.user.id, req.file.originalname, importes, erreurs, details);
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
      var content2 = [{ type: 'text', text: PROMPT_WP + '\n\nContenu du fichier:\n' + chunks[ci2] }];
      try {
        var response2 = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 8000,
          messages: [{ role: 'user', content: content2 }]
        });
        var raw2 = response2.content[0].text;
        var jsonStr2 = nettoierJson(raw2);
        var bons2 = JSON.parse(jsonStr2);
        if (Array.isArray(bons2)) tousLesBons = tousLesBons.concat(bons2);
      } catch (e) {
        console.error('Erreur chunk:', e.message);
      }
    }

    var usersResult2 = await pool.query('SELECT id, email FROM users');
    var byEmail2 = {};
    usersResult2.rows.forEach(function(u) { byEmail2[u.email] = u.id; });

    var importes2 = 0;
    var fermes = 0;
    var erreurs2 = 0;
    var details2 = [];
    var wpNumerosActifs = [];

    for (var idx2 = 0; idx2 < tousLesBons.length; idx2++) {
      var bon2 = tousLesBons[idx2];
      if (!bon2.numero_wp) continue;

      try {
        var advisorId2 = bon2.advisor_email ? byEmail2[bon2.advisor_email] || null : null;
        var vehicule2 = bon2.vehicule || [bon2.annee, bon2.marque, bon2.modele].filter(Boolean).join(' ');
        var numero2 = 'WP-' + bon2.numero_wp;
        wpNumerosActifs.push(numero2);

        var clientNom = bon2.client_nom;
        if (estGarantie(clientNom) && bon2.vin) {
          var nomTrouve = await chercherNomClient(bon2.vin);
          if (nomTrouve) clientNom = nomTrouve + ' (garantie)';
        }

        var existing = await pool.query('SELECT id FROM work_orders WHERE numero = $1', [numero2]);

        if (existing.rows.length > 0) {
          await pool.query(
            'UPDATE work_orders SET client_nom=$1, vehicule=$2, description=$3, montant=$4, advisor_id=$5, updated_at=NOW() WHERE numero=$6',
            [clientNom, vehicule2, bon2.description || null, bon2.montant || 'A estimer', advisorId2, numero2]
          );
        } else {
          await pool.query(
            'INSERT INTO work_orders (numero, numero_wp, client_nom, client_tel, vehicule, vehicule_annee, vehicule_marque, vehicule_modele, vin, description, montant, date_entree, advisor_id, source, type_bon, courtoisie, status, statut_detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',
            [numero2, bon2.numero_wp, clientNom, bon2.client_tel || null, vehicule2,
             bon2.annee || null, bon2.marque || null, bon2.modele || null,
             bon2.vin || null, bon2.description || null, bon2.montant || 'A estimer',
             bon2.date_entree || new Date().toISOString().slice(0, 10),
             advisorId2, 'pdf', 'wp', bon2.courtoisie || false, 'open', 'vehicule_sur_place']
          );
          importes2++;
        }
        details2.push({ numero: numero2, status: 'ok' });
      } catch (err) {
        erreurs2++;
        details2.push({ numero: bon2.numero_wp, status: 'erreur', message: err.message });
      }
    }

    if (wpNumerosActifs.length > 0) {
      var placeholders = wpNumerosActifs.map(function(_, i) { return '$' + (i + 1); }).join(',');
      var pLen = wpNumerosActifs.length;
      var fermeParams = wpNumerosActifs.concat(['livre', 'wp', 'livre']);
      try {
        var fermeResult = await pool.query(
          'UPDATE work_orders SET status = $' + (pLen+1) + ' WHERE type_bon = $' + (pLen+2) + ' AND status != $' + (pLen+3) + ' AND numero NOT IN (' + placeholders + ') RETURNING numero',
          fermeParams
        );
        fermes = fermeResult.rowCount;
      } catch (e) {
        console.error('Erreur fermeture auto:', e.message);
      }
    }

    await logImport(req.user.id, req.file.originalname, importes2, erreurs2, details2);
    res.json({ success: true, importes: importes2, fermes: fermes, erreurs: erreurs2, total: tousLesBons.length, type: 'wp' });

  } catch (err) {
    console.error('Erreur import WP:', err);
    res.status(500).json({ error: 'Erreur lors du traitement', details: err.message });
  }
});

router.post('/pdf', auth, requireRole('admin','directeur','preposee','conseiller'), upload.single('fichier'), async (req, res) => {
  res.redirect(307, '/api/import/rdv');
});

module.exports = router;
