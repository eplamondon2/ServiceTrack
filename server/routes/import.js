const router    = require('express').Router();
const multer    = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../db/pool');
const { auth, requireRole } = require('../middleware/auth');

const upload    = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── PROMPT RDV (rapport journalier) ─────────────────────────────────────────
const PROMPT_RDV = `Tu es un assistant spécialisé dans l'extraction de données de rendez-vous depuis des rapports Serti Keyloop de Hyundai St-Raymond.

Analyse ce document et extrais TOUS les rendez-vous trouvés.

MAPPING DES AVISEURS:
- NL = nancy.langevin@hyundaistraymond.ca
- FB1 ou FB = francois.boulet@hyundaistraymond.ca
- SP1 ou SP = sonia.perusse@hyundaistraymond.ca
- JD = jdube@hyundaistraymond.ca

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans balises markdown.

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
    "description": "Service d entretien #1",
    "montant": "132.17$",
    "date_promesse": "2026-05-19 07:30",
    "advisor_email": "nancy.langevin@hyundaistraymond.ca",
    "courtoisie": false
  }
]

Numérote séquentiellement: RDV-001, RDV-002, etc.
Si un champ est absent, utilise null. Extrais TOUS les rendez-vous sans exception.`;

// ─── PROMPT WP (bons de travail ouverts) ─────────────────────────────────────
const PROMPT_WP = `Tu es un assistant spécialisé dans l'extraction de bons de travail depuis des rapports Serti Keyloop de Hyundai St-Raymond.

Ce rapport contient des bons de travail (WP) avec statuts OUVERT, FERME, REOUVERT.
Extrais SEULEMENT les bons avec statut OUVERT ou REOUVERT — ignore les FERME.

M
