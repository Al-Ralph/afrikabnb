# AfrikaBnB

Plateforme de réservation de logements en Afrique, sur le modèle d’Airbnb. Projet étudiant / portfolio réalisé à Lomé (Togo).

- **Frontend** : React 19 (Vite), à la racine du dépôt.
- **Backend** : API REST Node.js / Express + Prisma + PostgreSQL (hébergé sur Supabase), dans `backend/` (documentation détaillée des endpoints : [`backend/README.md`](backend/README.md)).

> Captures d’écran : non disponibles pour l’instant.

---

## Stack

| Couche | Technologies |
|---|---|
| Frontend | React 19, Vite 8, react-router 7, Context API, CSS |
| Backend | Node.js, Express 4 (modules ESM), Prisma 5, zod, jsonwebtoken, bcryptjs, helmet, express-rate-limit |
| Base de données | PostgreSQL (Supabase en production ; PostgreSQL 16 en local via Docker, facultatif) |
| Services externes | Google Maps JavaScript API / Places (optionnel, après consentement), OpenStreetMap Nominatim (géocodage côté serveur), images Unsplash |
| Conteneurs | Image Docker de l’API ; Docker Compose : API + PostgreSQL local (le frontend n’est pas conteneurisé) |

100 % JavaScript (pas de TypeScript). Le backend est un **monolithe modulaire** : une seule application Express découpée par domaine (`backend/src/api/{auth,users,listings,bookings,reviews,favorites,maps}`).

---

## Fonctionnalités

- **Recherche** : destination (texte recherché dans la ville et le titre, insensible à la casse et aux accents), dates (exclut les logements déjà réservés), nombre de voyageurs (≤ capacité), animaux acceptés, catégories (Piscines, Bord de mer, Safari, Cabanes, Tendance, OMG!, Parcs nationaux, Îles, Luxe). Les critères sont synchronisés dans l’URL.
- **Fiche logement** avec widget de réservation : dates déjà réservées bloquées, total calculé (nuits × prix), contrôle anti double-réservation dans une transaction côté serveur.
- **Avis** : possibles après le séjour, un par réservation ; la note moyenne de l’annonce est calculée à partir des avis.
- **Favoris** persistés en base.
- **Profil** (`/profil`) : nom, avatar, changement de mot de passe (ancien mot de passe exigé), mes réservations, annulation, dépôt d’avis.
- **Espace hôte** (`/host`) : création / modification / suppression d’annonces (devise XOF, EUR, USD…, capacité, chambres, catégorie, coordonnées), réservations reçues.
- **Carte** (`/carte`) : Google Maps avec marqueurs de prix ; repli en liste sans clé API ou sans consentement.
- **Multilingue** : français, anglais, espagnol, allemand, portugais.
- **Bandeau de consentement cookies** : Google Fonts et Google Maps ne sont chargés qu’après acceptation.
- **Pages légales** : mentions légales, confidentialité, cookies, CGU.
- **Bandeau d’accueil statique** (CSS seul, aucune image ni bibliothèque 3D) : affichage immédiat, aucune requête tierce.

---

## Prérequis

- Node.js et npm
- Un projet [Supabase](https://supabase.com) (offre gratuite suffisante), **ou** Docker (Docker Compose) pour lancer PostgreSQL et l’API en local
- `openssl` (pour générer le secret JWT)
- Optionnel : une clé Google Maps (Maps JavaScript API + Places API)

---

## Installation

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Éditer `backend/.env` :

- `DATABASE_URL` : URL **Transaction pooler** Supabase (port `6543`) suivie de `?pgbouncer=true&connection_limit=1&sslmode=require` ;
- `DIRECT_URL` : URL **Session pooler** (ou **Direct connection**) Supabase (port `5432`) suivie de `?sslmode=require` (utilisée par les migrations) ;
- `JWT_SECRET` : coller la sortie de `openssl rand -base64 48` (32 caractères minimum ; l’API refuse de démarrer en production si le secret est absent ou faible).

Créer le schéma, générer le client Prisma, charger les données de démo et lancer l’API :

```bash
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run dev
```

L’API écoute sur **http://localhost:4000** (`GET /health` pour vérifier). Procédure Supabase détaillée (création du projet, où trouver les URL, sauvegardes, sécurité) : [`backend/README.md`](backend/README.md#base-de-données-supabase).

**Avec Docker** (API + PostgreSQL local) : voir [`backend/README.md`](backend/README.md) (`docker compose up --build` depuis `backend/`, après avoir renseigné `JWT_SECRET` et `POSTGRES_PASSWORD` dans `backend/.env`).

### 2. Frontend

Dans un second terminal, à la racine du dépôt :

```bash
npm install
npm run dev
```

L’application tourne sur **http://localhost:3000**. En développement, le proxy de `vite.config.js` redirige `/api/*` (et `/health`) vers `http://localhost:4000` : aucune variable n’est obligatoire.

Variables optionnelles (fichier `.env` à la racine, modèle : `.env.example`) :

| Variable | Rôle |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | Active l’autocomplétion des destinations et la carte Google. Sans clé, la page `/carte` affiche une liste. |
| `VITE_API_URL` | URL de l’API à utiliser à la place du proxy (backend sur une autre machine / un autre port). |

Si l’API est injoignable, l’accueil affiche des annonces de démonstration statiques (`src/data/listings.js`).

---

## Comptes de démo

Créés par `npm run db:seed` (refusé si `NODE_ENV=production`). Mot de passe commun : `demo1234`.

| E-mail | Rôle |
|---|---|
| `host@afrikabnb.com` | Hôte |
| `awa@afrikabnb.com` | Hôte |
| `kofi@afrikabnb.com` | Voyageur |

Le seed est idempotent (relançable sans doublon) : 20 annonces réparties sur les 9 catégories, des réservations passées et à venir, et des avis.

> Ces comptes et ce mot de passe sont réservés à la démo locale : ne jamais les utiliser en production.

---

## Tests et qualité

| Commande | Où | Contenu |
|---|---|---|
| `npm test` | racine | Vitest + Testing Library, exécution unique (`npm run test:watch` pour le mode watch) : 214 tests |
| `npm test` | `backend/` | `node --test` : 22 tests sur la logique métier (nuits, prix, chevauchement de dates, moyenne des notes, filtres de recherche) |
| `npm run build` | racine | Build de production dans `build/` |
| `npm run lint` | racine | ESLint (config plate `eslint.config.js` : règles react-app, hooks, accessibilité JSX) |
| `npm audit` | `backend/` | 0 vulnérabilité au 21/10/2026 |

Taille du build (gzip) : bundle principal ≈ 119 kB (Vite 8), sans autre chunk significatif (la scène 3D three.js a été retirée le 22/10/2026).

---

## Structure du dépôt

```
afrikabnb/
├── index.html              # point d’entrée Vite (meta SEO, manifest)
├── vite.config.js          # Vite : proxy /api, build, config Vitest
├── public/                 # favicon, manifest, robots.txt, llms.txt
├── src/
│   ├── api/client.js       # appels à l’API
│   ├── components/         # UI : recherche, cartes, booking/, host/, profile/, map/, Hero (bandeau d’accueil)
│   ├── context/            # Auth, Consent, Favorites, Language (+ translations.js), Search
│   ├── data/listings.js    # annonces de repli (API injoignable)
│   ├── hooks/              # useGoogleMapsScript (chargement conditionné au consentement)
│   ├── pages/              # Home, PropertyDetails, Host, Profile, Favorites, MapPage, legal/
│   └── utils/
└── backend/
    ├── src/
    │   ├── api/            # un dossier par domaine (auth, users, listings, bookings, reviews, favorites, maps)
    │   ├── config/         # env.js (validation de l’environnement), jwt.js, db.js
    │   ├── middleware/     # auth, validation zod, gestion des erreurs
    │   └── utils/
    ├── prisma/             # schema.prisma, migrations/, seed.js
    ├── test/               # tests node --test
    ├── Dockerfile
    └── docker-compose.yml
```

---

## Limites connues et pistes

| Limite | Piste |
|---|---|
| Pas de paiement en ligne | Intégrer un prestataire (mobile money, carte) |
| Pas de messagerie hôte / voyageur | Ajouter un domaine `messages` |
| Une seule image par annonce (URL) | Galerie et upload d’images |
| Token JWT stocké en `localStorage` (exposé en cas de XSS) | Cookie `httpOnly` + refresh token |
| Modes de calendrier « Mois » / « Flexibles » non implémentés (affichent « à venir ») ; l’option de flexibilité ±jours n’est pas prise en compte par la recherche | Implémenter côté API et UI |
| Déploiement du frontend non décrit (pas de conteneur) | Hébergement statique du `build/` + `VITE_API_URL` |
| Index géographique : index B-tree composite `(latitude, longitude)`, pas un index `SPATIAL` | Extension PostGIS (disponible sur Supabase) si le volume l’exige |
