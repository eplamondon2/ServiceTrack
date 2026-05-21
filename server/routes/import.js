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
Si le client n a pas de numero_adresse, utilise null.

Le numero_br est le Numero B.R. dans la section Aviseur, exemple:
  Numero B.R. .........: WP44189  --> numero_br = WP44189
Si absent, utilise null.

Pour la courtoisie, cherche la colonne V dans le tableau: O = Oui, N = Non.

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

function convertirDate(dateRaw) {
  if (!dateRaw) return new Date().toISOString().slice(0, 10);
  var d = dateRaw.split('T')[0];
  if (d.match(/^\d{4}-\d{2}-\d{2}$/)) return d;
  var parts = dateRaw.split('/');
  if (parts.length === 3) {
    var yy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    return yy + '-' + parts[0].padStart(2,'0') + '-' + parts[1].padStart(2,'0');
  }
  return new Date().toISOString().slice(0, 10);
}

function parseWP(contenu) {
  var bons = [];
  var lignes = contenu.split('\n');

  var AVISEURS = {
    'NL':  'nancy.langevin@hyundaistraymond.ca',
    'FB1': 'francois.boulet@hyundaistraymond.ca',
    'FB':  'francois.boulet@hyundaistraymond.ca',
    'SP1': 'sonia.perusse@hyundaistraymond.ca',
    'SP':  'sonia.perusse@hyundaistraymond.ca',
    'JD':  'jdube@hyundaistraymond.ca'
  };

  var bonCourant = null;

  for (var i = 0; i < lignes.length; i++) {
    var ligne = lignes[i];

    // Détecter une nouvelle ligne de bon WP
    var matchBon = ligne.match(/^(WP\d+)\s+(\d+\/\d+\/\d+)\s+(.+?)\s{2,}/);
    if (matchBon) {
      if (bonCourant && bonCourant.statut !== 'FERME') {
        bons.push(bonCourant);
      }

      var numeroWP    = matchBon[1].replace('WP', '');
      var dateRaw     = matchBon[2];
      var clientRaw   = matchBon[3].trim();

      var dateParts   = dateRaw.split('/');
      var yy          = dateParts[2].length === 2 ? '20' + dateParts[2] : dateParts[2];
      var dateEntree  = yy + '-' + dateParts[0].padStart(2,'0') + '-' + dateParts[1].padStart(2,'0');

      var telMatch    = ligne.match(/(\d{3}[\s]\d{3}-\d{4})/);
      var tel         = telMatch ? telMatch[0] : null;

      bonCourant = {
        numero_wp:    numeroWP,
        date_entree:  dateEntree,
        client_nom:   clientRaw,
        client_tel:   tel,
        marque:       null,
        modele:       null,
        annee:        null,
        vin:          null,
        vehicule:     null,
        statut:       null,
        advisor_email:null,
        montant:      null,
        description:  [],
        courtoisie:   false
      };

      // Chercher véhicule sur la même ligne
      var vMatch = ligne.match(/V(?:é|e)hicule\s*:\s*(\w+)\s+([\w\s5]+?)\s+(\d{4})\s+([A-HJ-NPR-Z0-9]{17})/i);
      if (vMatch) {
        bonCourant.marque   = vMatch[1].trim();
        bonCourant.modele   = vMatch[2].trim();
        bonCourant.annee    = parseInt(vMatch[3]);
        bonCourant.vin      = vMatch[4].trim();
        bonCourant.vehicule = vMatch[3] + ' ' + vMatch[1] + ' ' + vMatch[2].trim();
      }
      continue;
    }

    if (!bonCourant) continue;

    // Statut
    var matchStatut = ligne.match(/Statut\s*:\s*(OUVERT|FERME|REOUVERT)/i);
    if (matchStatut) {
      bonCourant.statut = matchStatut[1].toUpperCase();
      continue;
    }

    // Véhicule sur ligne séparée
    if (!bonCourant.vin) {
      var vMatch2 = ligne.match(/V(?:é|e)hicule\s*:\s*(\w+)\s+([\w\s5]+?)\s+(\d{4})\s+([A-HJ-NPR-Z0-9]{17})/i);
      if (vMatch2) {
        bonCourant.marque   = vMatch2[1].trim();
        bonCourant.modele   = vMatch2[2].trim();
        bonCourant.annee    = parseInt(vMatch2[3]);
        bonCourant.vin      = vMatch2[4].trim();
        bonCourant.vehicule = vMatch2[3] + ' ' + vMatch2[1] + ' ' + vMatch2[2].trim();
      }
    }

    // Aviseur
    var matchAviseur = ligne.match(/Aviseur\s*[.:]+\s*([A-Z0-9]+)/i);
    if (matchAviseur) {
      var code = matchAviseur[1].trim().toUpperCase();
      bonCourant.advisor_email = AVISEURS[code] || null;
      continue;
    }

    // Montant total
    var matchTotal = ligne.match(/Total\s+Document\s+([\d\s]+\.[\d]+)/i);
    if (matchTotal) {
      bonCourant.montant = matchTotal[1].trim() + '$';
      continue;
    }

    // Description (max 3 lignes)
    var matchDesc = ligne.match(/[A-Z]-\s+\w+\s+(.{10,})/);
    if (matchDesc && bonCourant.description.length < 3) {
      var desc = matchDesc[1].trim();
      if (desc.length > 5 && !desc.match(/^\d/)) {
        bonCourant.description.push(desc);
      }
    }
  }

  // Ajouter le dernier bon
  if (bonCourant && bonCourant.statut !== 'FERME') {
    bons.push(bonCourant);
  }

  return bons
    .filter(function(b) { return b.statut === 'OUVERT' || b.statut === 'REOUVERT'; })
    .map(function(b) {
      b.description = b.description.join(' | ');
      return b;
    });
}

router.post('/rdv', auth, requireRole('admin','directeur','preposee','conseiller'), upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

  try {
    var contenu = req.file.buffer.toString('utf-8');
    var content = [{ type: 'text', text: PROMPT_RDV + '\n\nContenu du fichier:\n' + contenu }];

    var response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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

    await pool.query(
      'UPDATE work_orders SET status = $1 WHERE type_bon = $2 AND status = $3',
      ['annule', 'rdv', 'open']
    );

    var importes = 0, erreurs = 0, details = [];
    var dateRapport = bons.length > 0 && bons[0].date_rdv
      ? bons[0].date_rdv.replace(/-/g, '')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (var idx = 0; idx < bons.length; idx++) {
      var bon = bons[idx];
      try {
        var advisorId   = bon.advisor_email ? byEmail[bon.advisor_email] || null : null;
        var vehicule    = bon.vehicule || [bon.annee, bon.marque, bon.modele].filter(Boolean).join(' ');
        var num         = genNumeroRdv(bon, idx, dateRapport);
        var datePromesse = bon.date_rdv && bon.heure_rdv
          ? bon.date_rdv + ' ' + bon.heure_rdv
          : bon.date_rdv || null;

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
    var contenu     = req.file.buffer.toString('latin1');
    var tousLesBons = parseWP(contenu);
    console.log('WP parser: bons trouves:', tousLesBons.length);

    var usersResult = await pool.query('SELECT id, email FROM users');
    var byEmail     = {};
    usersResult.rows.forEach(function(u) { byEmail[u.email] = u.id; });

    var importes = 0, fermes = 0, erreurs = 0, details = [];
    var wpNumerosActifs = [];

    for (var idx = 0; idx < tousLesBons.length; idx++) {
      var bon = tousLesBons[idx];
      if (!bon.numero_wp) continue;

      try {
        var advisorId = bon.advisor_email ? byEmail[bon.advisor_email] || null : null;
        var vehicule  = bon.vehicule || [bon.annee, bon.marque, bon.modele].filter(Boolean).join(' ');
        var numero    = 'WP-' + bon.numero_wp;
        var dateEntree = convertirDate(bon.date_entree);
        wpNumerosActifs.push(numero);

        var clientNom = bon.client_nom;
        if (estGarantie(clientNom) && bon.vin) {
          var nomTrouve = await chercherNomClient(bon.vin);
          if (nomTrouve) clientNom = nomTrouve + ' (garantie)';
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
            [numero, bon.numero_wp, clientNom, bon.client_tel || null, vehicule,
             bon.annee || null, bon.marque || null, bon.modele || null,
             bon.vin || null, bon.description || null, bon.montant || 'A estimer',
             dateEntree, advisorId, 'pdf', 'wp', bon.courtoisie || false, 'open', 'vehicule_sur_place']
          );
          importes++;
        }
        details.push({ numero: numero, client: clientNom, status: 'ok' });
      } catch (err) {
        erreurs++;
        details.push({ numero: bon.numero_wp, status: 'erreur', message: err.message });
      }
    }

    if (wpNumerosActifs.length > 0) {
      var placeholders = wpNumerosActifs.map(function(_, i) { return '$' + (i + 1); }).join(',');
      var pLen         = wpNumerosActifs.length;
      var fermeParams  = wpNumerosActifs.concat(['livre', 'wp', 'livre']);
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

    await logImport(req.user.id, req.file.originalname, importes, erreurs, details);
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
