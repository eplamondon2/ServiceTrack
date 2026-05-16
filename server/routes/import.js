const router   = require('express').Router();
const multer   = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const pool     = require('../db/pool');
const { auth, requireRole } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/import/pdf — parser un rapport Serti en PDF ou texte
router.post('/pdf', auth, requireRole('admin','directeur','preposee'), upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

  const isPdf  = req.file.mimetype === 'application/pdf';
  const isTxt  = req.file.mimetype === 'text/plain' || req.file.originalname.endsWith('.txt');
  const isCsv  = req.file.mimetype === 'text/csv'   || req.file.originalname.endsWith('.csv');

  if (!isPdf && !isTxt && !isCsv)
    return res.status(400).json({ error: 'Format accepté: PDF, TXT, CSV' });

  try {
    let content;

    if (isPdf) {
      // Envoyer le PDF directement à Claude
      content = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: req.file.buffer.toString('base64')
          }
        },
        { type: 'text', text: PROMPT_EXTRACTION }
      ];
    } else {
      // TXT ou CSV
      content = [{ type: 'text', text: `${PROMPT_EXTRACTION}\n\nContenu du fichier:\n${req.file.buffer.toString('utf-8')}` }];
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content }]
    });

    const raw = response.content[0].text;
    // Nettoyer le JSON (enlever les balises markdown si présentes)
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const bons = JSON.parse(jsonStr);

    if (!Array.isArray(bons)) throw new Error('Format de réponse inattendu');

    // Insérer les bons en base
    let importes = 0, erreurs = 0, details = [];

    for (const bon of bons) {
      try {
        await pool.query(`
          INSERT INTO work_orders
            (numero, client_nom, client_tel, vehicule, vehicule_annee,
             vehicule_marque, vehicule_modele, kilometrage,
             description, montant, date_promesse, advisor_id, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pdf')
          ON CONFLICT (numero) DO NOTHING
        `, [
          bon.numero, bon.client_nom, bon.client_tel || null,
          bon.vehicule || `${bon.annee || ''} ${bon.marque || ''} ${bon.modele || ''}`.trim(),
          bon.annee || null, bon.marque || null, bon.modele || null,
          bon.kilometrage || null, bon.description || null,
          bon.montant || 'À estimer', bon.date_promesse || null,
          req.user.id
        ]);
        importes++;
        details.push({ numero: bon.numero, status: 'ok' });
      } catch (err) {
        erreurs++;
        details.push({ numero: bon.numero, status: 'erreur', message: err.message });
      }
    }

    // Logger l'import
    await pool.query(
      'INSERT INTO imports (user_id, source, fichier_nom, bons_importes, bons_erreur, details) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, isPdf ? 'pdf' : 'csv', req.file.originalname, importes, erreurs, JSON.stringify(details)]
    );

    res.json({ success: true, importes, erreurs, details, total: bons.length });
  } catch (err) {
    console.error('Erreur import PDF:', err);
    res.status(500).json({ error: 'Erreur lors du traitement du fichier', details: err.message });
  }
});

const PROMPT_EXTRACTION = `Tu es un assistant spécialisé dans l'extraction de données de bons de travail automobile depuis des rapports Serti Keyloop.

Analyse ce document et extrais TOUS les bons de travail/rendez-vous trouvés.
Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans balises markdown.

Format exact pour chaque bon:
[
  {
    "numero": "WO-XXXXX ou numéro du bon tel qu'affiché",
    "client_nom": "Nom complet du client",
    "client_tel": "Numéro de téléphone ou null",
    "annee": 2021,
    "marque": "Toyota",
    "modele": "RAV4",
    "vehicule": "2021 Toyota RAV4",
    "kilometrage": 48221,
    "description": "Description des travaux",
    "montant": "189,95$",
    "date_promesse": "2026-05-15 17:00"
  }
]

Si un champ est absent ou illisible, utilise null. Extrais tous les bons sans exception.`;

module.exports = router;
