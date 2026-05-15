# ServiceTrack — Portail de suivi des bons de travail

Portail web pour le département de service automobile.
Intégration Serti Keyloop via import PDF/CSV ou API.

---

## 🚀 Déploiement sur Railway (étape par étape)

### 1. Préparer le dépôt GitHub

```bash
# Cloner / initialiser le projet
git init
git add .
git commit -m "Initial commit — ServiceTrack"

# Créer un repo sur github.com puis:
git remote add origin https://github.com/VOTRE-USER/servicetrack.git
git push -u origin main
```

### 2. Créer le projet sur Railway

1. Aller sur [railway.app](https://railway.app) → **New Project**
2. Choisir **Deploy from GitHub repo** → sélectionner `servicetrack`
3. Railway détecte automatiquement Node.js

### 3. Ajouter PostgreSQL

Dans Railway → votre projet → **+ New** → **Database** → **PostgreSQL**

Railway génère automatiquement `DATABASE_URL` et la connecte à votre service.

### 4. Configurer les variables d'environnement

Dans Railway → votre service → **Variables** → **+ New Variable** :

| Variable            | Valeur                                      |
|---------------------|---------------------------------------------|
| `NODE_ENV`          | `production`                                |
| `JWT_SECRET`        | (générer: voir ci-dessous)                  |
| `ANTHROPIC_API_KEY` | `sk-ant-...` (votre clé Anthropic)          |
| `CLIENT_URL`        | `https://servicetrack-xxx.railway.app`      |

**Générer JWT_SECRET** (exécuter en local) :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Initialiser la base de données

Dans Railway → PostgreSQL → **Query** :

1. D'abord générer les vrais hashes de mots de passe :
```bash
# En local (vous devez avoir node + bcryptjs installé)
cd servicetrack
npm install
node server/scripts/hash-passwords.js
```

2. Copier les hashes dans `server/db/schema.sql` (remplacer les `placeholder_hash`)

3. Coller et exécuter tout le contenu de `server/db/schema.sql` dans l'éditeur Railway

### 6. Déployer

Railway déploie automatiquement à chaque push sur `main`.

Pour déployer manuellement :
```bash
git push origin main
```

Ou déclencher un redéploiement depuis le dashboard Railway.

---

## 💻 Développement local

```bash
# Cloner le projet
git clone https://github.com/VOTRE-USER/servicetrack.git
cd servicetrack

# Variables d'environnement
cp .env.example .env
# Remplir les valeurs dans .env

# Installer les dépendances serveur
npm install

# Installer les dépendances client
cd client && npm install && cd ..

# Démarrer en développement (deux terminaux)
# Terminal 1 — API
npm run dev

# Terminal 2 — Frontend
cd client && npm run dev
```

Frontend : http://localhost:5173
API      : http://localhost:3001

---

## 👥 Utilisateurs par défaut

Mot de passe initial pour tous : **ServiceTrack2024!**
*(à changer au premier login — page Profil)*

| Courriel                                      | Rôle       |
|-----------------------------------------------|------------|
| marc.bouchard@votre-concessionnaire.com        | Directeur  |
| julie.dion@votre-concessionnaire.com           | Conseiller |
| patrick.tremblay@votre-concessionnaire.com     | Conseiller |
| sophie.lavoie@votre-concessionnaire.com        | Préposée   |
| admin@votre-concessionnaire.com                | Admin      |

> ⚠️ Remplacez les adresses courriel par les vraies dans `schema.sql` avant l'initialisation.

---

## 📋 Fonctionnalités

- **Bons de travail** — liste, détail, statuts (ouvert/suivi requis/en attente/livré)
- **Suivis** — notes horodatées avec type (appel, texto, courriel, livraison)
- **Import Serti** — upload PDF ou texte analysé par Claude AI
- **Saisie manuelle** — formulaire de création rapide
- **Lien SDSweb** — accès direct à sdsweb.serti.com pour les textos
- **Tableau de bord** — stats par conseiller, alertes bons sans suivi
- **Rôles** — admin, directeur (vue globale), conseiller (ses bons), préposée

---

## 🔌 Intégration API Serti (Phase 2)

Si Serti expose une API REST :

1. Ajouter dans `.env` : `SERTI_API_URL` et `SERTI_API_KEY`
2. Créer `server/routes/serti-sync.js` avec un endpoint `/api/sync/serti`
3. Appeler toutes les 15 min via un cron Railway ou un service dédié

---

## 📁 Structure du projet

```
servicetrack/
├── server/
│   ├── index.js              # Point d'entrée Express
│   ├── routes/
│   │   ├── auth.js           # Login, me, change-password
│   │   ├── workorders.js     # CRUD bons de travail
│   │   ├── suivis.js         # Ajout de suivis
│   │   ├── import.js         # Import PDF → Claude AI
│   │   └── users.js          # Gestion utilisateurs
│   ├── middleware/auth.js    # JWT + rôles
│   ├── db/
│   │   ├── pool.js           # Connexion PostgreSQL
│   │   └── schema.sql        # Schéma initial
│   └── scripts/
│       └── hash-passwords.js # Génération des hashes
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js            # Client API centralisé
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   └── Dashboard.jsx
│   │   ├── components/
│   │   │   ├── WorkOrderList.jsx
│   │   │   ├── WorkOrderDetail.jsx
│   │   │   ├── ImportPage.jsx
│   │   │   └── StatsPage.jsx
│   │   └── hooks/useAuth.jsx
│   └── index.html
├── railway.json
├── package.json
└── .env.example
```
