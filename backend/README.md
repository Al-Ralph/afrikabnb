# AfrikaBnB – Backend API

API Node.js (Express) avec base PostgreSQL hébergée sur **Supabase** (Prisma 5), authentification JWT, annonces et API Maps.
Une pile locale Docker (API + PostgreSQL 16) reste disponible pour le développement hors ligne.

## Variables d’environnement

Copier `.env.example` vers `.env` et remplacer toutes les valeurs. La config est validée au démarrage (`src/config/env.js`).

| Variable | Rôle | Défaut / contrainte |
|---|---|---|
| `NODE_ENV` | `development` ou `production` | `development` |
| `PORT` | Port HTTP | `4000` |
| `DATABASE_URL` | URL PostgreSQL utilisée par l’API. Supabase : **Transaction pooler** (port `6543`) avec `?pgbouncer=true&connection_limit=1&sslmode=require` | **obligatoire**, `postgresql://…` |
| `DIRECT_URL` | URL utilisée par `prisma migrate`. Supabase : **Session pooler** ou **Direct connection** (port `5432`) avec `?sslmode=require`. Base locale : même valeur que `DATABASE_URL` | **obligatoire en production** (avertissement en dev) |
| `JWT_SECRET` | Secret HS256 des tokens | **obligatoire en production**, ≥ 32 caractères, sans `change-me`. Générer : `openssl rand -base64 48`. En dev, un secret aléatoire temporaire est utilisé (avertissement au démarrage). |
| `JWT_EXPIRES_IN` | Validité des tokens | `1d` |
| `CORS_ORIGIN` | Origines autorisées, séparées par des virgules | **obligatoire en production**, `*` interdit ; dev : `http://localhost:3000` |
| `TRUST_PROXY` | Nombre de reverse proxys devant l’API (rate limiting par IP) | `0` |
| `LOG_LEVEL` | Niveau de logs pino (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) | `debug` en développement, `info` sinon |
| `LOG_SQL` | `1` : journalise toutes les requêtes SQL de Prisma (très verbeux) | désactivé |
| `POSTGRES_PASSWORD` | Mot de passe de la base locale Docker Compose | obligatoire pour `docker compose`, sans `@ : / ? #` |
| `POSTGRES_USER`, `POSTGRES_DB` | Utilisateur / base locale (Compose) | `afrikabnb` |
| `APP_URL` | URL publique du **frontend** (liens des emails : `${APP_URL}/reinitialiser-mot-de-passe?token=…`, `/profil`, `/host`) | **obligatoire en production** ; dev : `http://localhost:3000` |
| `PUBLIC_API_URL` | URL publique de l’API, préfixe des URL d’images en stockage `local` | `http://localhost:$PORT` |
| `STORAGE_DRIVER` | Stockage des photos : `local` (dossier `backend/uploads/`, servi sous `/uploads`) ou `supabase` (Supabase Storage) | `local` en dev, `supabase` en production |
| `STORAGE_ALLOW_LOCAL` | `1` : autorise `STORAGE_DRIVER=local` en production (volume persistant obligatoire ; utilisé par `docker compose`) | refusé par défaut en production |
| `SUPABASE_URL` | URL du projet Supabase (`https://<ref>.supabase.co`) | obligatoire si `STORAGE_DRIVER=supabase` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé `service_role` (ou clé secrète `sb_secret_…`) : **serveur uniquement**, jamais dans une variable `VITE_*` | obligatoire si `STORAGE_DRIVER=supabase` |
| `SUPABASE_STORAGE_BUCKET` | Bucket **public** des photos | `listing-images` |
| `EMAIL_DRIVER` | `console` (journalise le contenu et le lien, n’envoie rien) ou `resend` | `console` en dev, `resend` en production |
| `RESEND_API_KEY` | Clé API Resend | sans clé : l’API démarre, chaque envoi est journalisé en erreur |
| `EMAIL_FROM` | Expéditeur (domaine vérifié dans Resend) | `AfrikaBnB <onboarding@resend.dev>` (adresse de test Resend : n’envoie qu’à l’adresse du compte Resend) |

En production, l’API refuse de démarrer si `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CORS_ORIGIN` ou `APP_URL` est absent ou invalide, si `STORAGE_DRIVER=local` sans `STORAGE_ALLOW_LOCAL=1`, ou si `STORAGE_DRIVER=supabase` sans `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` ; elle avertit si une URL de base distante n’impose pas `sslmode=require`, si le pooler Supabase (port `6543`) est utilisé sans `pgbouncer=true`, ou si `RESEND_API_KEY` manque.

### Stockage des photos (Supabase Storage)

1. Tableau de bord Supabase → **Storage** → **New bucket** : nom `listing-images`, **Public bucket** activé (lecture publique des URL ; aucune écriture publique). Facultatif : limite de taille 5 Mo et types `image/webp`.
2. *Project Settings → API* : copier **Project URL** → `SUPABASE_URL`, et la clé **service_role** (ou une clé secrète `sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY`.
3. `STORAGE_DRIVER=supabase`.

Les fichiers sont envoyés par l’API (REST `POST /storage/v1/object/<bucket>/<clé>`) et servis par `…/storage/v1/object/public/<bucket>/<clé>`. La clé ne quitte jamais le serveur ; le frontend n’envoie ses images qu’à l’API Express. Clés de stockage : `listings/<listingId>/<uuid>.webp`.

En `local` (développement), les fichiers vont dans `backend/uploads/` (ignoré par git et Docker), servis sous `/uploads` sans listing de dossier, sans fichiers cachés, avec `X-Content-Type-Options: nosniff`, une CSP `default-src 'none'; sandbox` et `Cross-Origin-Resource-Policy: cross-origin` (le front de dev est sur une autre origine). Les URL enregistrées sont absolues (`PUBLIC_API_URL/uploads/…`) : changer de port impose de re-téléverser.

### Emails (Resend)

Créer un compte [Resend](https://resend.com), vérifier un domaine d’envoi, créer une clé API → `RESEND_API_KEY`, `EMAIL_FROM="AfrikaBnB <no-reply@votre-domaine>"`, `EMAIL_DRIVER=resend`. Les emails partent **après** le commit de la transaction, sans bloquer la réponse HTTP : un échec est journalisé (`[email] échec d'envoi`), jamais renvoyé au client. Gabarits FR (texte + HTML, tout contenu utilisateur échappé) dans `src/services/email/templates.js`.

## Base de données Supabase

### 1. Créer le projet

1. Créer un compte sur [supabase.com](https://supabase.com), puis **New project**.
2. Choisir une région proche des utilisateurs : pour Lomé, une région européenne (ex. *West EU (Paris)*, *West EU (London)* ou *Central EU (Frankfurt)*) ; à défaut, la plus proche proposée.
3. Définir un **mot de passe de base de données** fort et le conserver (gestionnaire de mots de passe). S’il contient des caractères spéciaux, il faut l’encoder dans les URL (`@` → `%40`, `:` → `%3A`, `/` → `%2F`, `?` → `%3F`, `#` → `%23`, `%` → `%25`) ; le plus simple est un mot de passe alphanumérique long.

### 2. Récupérer les deux URL de connexion

Tableau de bord du projet → bouton **Connect** (ou *Project Settings → Database*) → **Connection string**, format **URI** :

- **Transaction pooler** (hôte `…pooler.supabase.com`, port `6543`) → `DATABASE_URL`, en ajoutant `?pgbouncer=true&connection_limit=1&sslmode=require` ;
- **Session pooler** (même hôte, port `5432`) → `DIRECT_URL`, en ajoutant `?sslmode=require`. La **Direct connection** (`db.<ref>.supabase.co:5432`) convient aussi si votre réseau dispose d’IPv6 (en IPv4, elle nécessite l’add-on payant).

Remplacer `[YOUR-PASSWORD]` par le mot de passe (encodé si besoin).

### 3. Renseigner `backend/.env`

```dotenv
DATABASE_URL="postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
DIRECT_URL="postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
```

Copier les hôtes exacts affichés par Supabase ; pour les autres variables, voir `.env.example`.

### 4. Créer les tables, peupler, lancer

```bash
cd backend
npm install
npx prisma migrate deploy   # crée les tables via DIRECT_URL
npx prisma generate         # client Prisma (PostgreSQL)
npm run db:seed             # données de démo (refusé si NODE_ENV=production)
npm run dev                 # API sur http://localhost:4000
```

### 5. Consulter et gérer les données

- **Table Editor** du tableau de bord Supabase (lecture, édition, filtres, export CSV) et **SQL Editor** pour des requêtes ;
- ou `npm run db:studio` (Prisma Studio, en local).

Le seed Prisma (`prisma/seed.js`) est la source de vérité des données de démo.

### Sauvegardes

Supabase sauvegarde automatiquement les bases des projets, mais la rétention, la restauration à un instant donné (PITR) et le téléchargement des sauvegardes depuis le tableau de bord dépendent de l’offre : les fonctions de sauvegarde complètes sont réservées aux offres payantes. Vérifier la page *Database → Backups* du projet et la [documentation Supabase](https://supabase.com/docs/guides/platform/backups). Sur l’offre gratuite, prévoir en complément un export régulier, par exemple :

```bash
pg_dump "postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require" --no-owner --format=custom -f afrikabnb.dump
```

Un projet gratuit inactif peut être mis en pause par Supabase (il se relance depuis le tableau de bord).

### Sécurité (RLS, clés Supabase)

- L’API accède à la base **uniquement via Prisma**, avec le rôle `postgres` et les URL de connexion. Le client `supabase-js` et la clé `anon` ne sont pas utilisés ; la clé `service_role` sert **uniquement** à écrire dans Supabase Storage (photos), côté serveur.
- Supabase expose aussi le schéma `public` via son API REST (Data API) avec la clé `anon`. Les migrations activent donc **Row Level Security sans aucune policy** sur `User`, `Listing`, `Favorite`, `Booking`, `Review`, `ListingImage`, `BlockedPeriod` et `PasswordResetToken` : ces tables sont inaccessibles par cette API, tandis que Prisma (propriétaire des tables) n’est pas concerné. Pour la table technique `_prisma_migrations`, exécuter une fois dans le SQL Editor : `alter table "_prisma_migrations" enable row level security;` (ou désactiver la Data API dans les paramètres du projet si elle ne sert pas).
- **Ne jamais exposer `DATABASE_URL` / `DIRECT_URL` côté frontend** (aucune variable `VITE_*` ne doit les contenir : elles sont incluses dans le bundle public) : elles donnent un accès complet à la base. Le frontend ne parle qu’à l’API Express.
- Les URL imposent `sslmode=require` : connexions chiffrées.

## Lancer l’API avec Docker

**API seule, base Supabase** (cas de production) :

```bash
cd backend
docker build -t afrikabnb-api .
docker run --rm -p 4000:4000 --env-file .env -e NODE_ENV=production afrikabnb-api
```

`--env-file` ne retire pas les guillemets : dans le fichier passé à Docker, écrire les valeurs sans guillemets.

**Pile locale complète** (API + PostgreSQL 16, sans Supabase) :

```bash
cd backend
cp .env.example .env   # puis renseigner JWT_SECRET et POSTGRES_PASSWORD
docker compose up --build
```

- **API** : http://localhost:4000
- **PostgreSQL** : exposé uniquement sur `127.0.0.1:5432` (volume nommé `postgres_data`) ; Compose construit lui-même `DATABASE_URL` et `DIRECT_URL` vers le service `db`.

Au démarrage, le conteneur API exécute `prisma migrate deploy` (migrations versionnées uniquement, via `DIRECT_URL`, aucun `db push`), puis lance l’API sous l’utilisateur non-root `node`. L’image installe `openssl` (requis par les moteurs Prisma sur Alpine).

Pour peupler la base en développement (refusé si `NODE_ENV=production`, donc pas dans le conteneur API) :

```bash
npm run db:seed
```

Arrêter : `docker compose down`

## Lancer en local avec PostgreSQL (sans Supabase)

1. Démarrer uniquement la base : `docker compose up -d db` (ou un PostgreSQL ≥ 14 installé localement).
2. Dans `.env`, `DATABASE_URL` et `DIRECT_URL` identiques : `postgresql://afrikabnb:<POSTGRES_PASSWORD>@localhost:5432/afrikabnb?schema=public`.
3. `npx prisma migrate deploy`, `npm run db:seed`, `npm run dev`.

## Migrations

Les migrations sont versionnées dans `prisma/migrations/` (`migration_lock.toml` : `provider = "postgresql"`) :

| Migration | Contenu |
|---|---|
| `20261022000000_init` | enums `Role`, `BookingStatus` ; tables `User`, `Listing`, `Favorite`, `Booking`, `Review` avec index et clés étrangères ; Row Level Security activée (sans policy) sur ces tables |
| `20261022120000_unaccent` | extension PostgreSQL `unaccent` (recherche insensible aux accents) |
| `20261022180000_vague3` | enums `ListingStatus`, `Amenity` ; `BookingStatus` + `DECLINED`, `EXPIRED` (`ALTER TYPE … ADD VALUE`, compatible avec une base non vide) ; `User.passwordChangedAt` ; `Listing.amenities` (défaut `{}`), `instantBook` (défaut `true`), `status` (défaut `ACTIVE`) ; tables `ListingImage`, `BlockedPeriod`, `PasswordResetToken` (cascade, index, RLS activée) ; **reprise** de chaque `Listing.imageUrl` existant en `ListingImage` position 0 |

Application de la migration vague 3 (à faire une fois, avec `DIRECT_URL`) :

```bash
cd backend
npx prisma migrate deploy
npx prisma generate      # arrêter `npm run dev` avant sous Windows (DLL du moteur verrouillée)
npm run db:seed          # facultatif (dev) : photos, équipements, compte admin, périodes bloquées
```

Les lignes existantes ne sont pas modifiées (hors ajout des colonnes avec leurs valeurs par défaut) : toutes les annonces restent `ACTIVE` et en réservation instantanée.

- Appliquer : `npx prisma migrate deploy` (script `npm run db:migrate`), puis `npx prisma generate`.
- Créer une nouvelle migration après modification du schéma (dev, base locale de préférence) : `npx prisma migrate dev --name <nom>`.
- Longueurs des colonnes texte (`VARCHAR`) identiques aux limites des schémas `zod` : email 254, nom 100, titre et lieu 200, adresse 300, description 5000, URL d’image / avatar 2048, catégorie 50, commentaire d’avis 1000.
- Recherche texte (`where` / `q`) : insensible à la casse **et aux accents** (« Lome » trouve « Lomé ») via `unaccent(lower(...)) LIKE` dans une requête paramétrée (`findListingIdsByText`), les jokers `%`/`_` saisis étant échappés.
- Verrouillage des réservations et des avis : `SELECT … FROM "Listing" WHERE "id" = … FOR UPDATE` dans une transaction interactive Prisma (compatible avec le pooler en mode transaction).

## Logs

Logs structurés avec **pino** / **pino-http** (`src/config/logger.js`) : sortie lisible via `pino-pretty` en `NODE_ENV=development` (si la devDependency est installée), JSON sur une ligne en production.

- Chaque requête reçoit un identifiant : l'en-tête `X-Request-Id` est repris s'il est valide (`[A-Za-z0-9._-]`, 8 à 128 caractères), sinon un UUID est généré. Il est renvoyé dans l'en-tête de réponse `X-Request-Id`, présent dans chaque log (`req.id`) et dans le corps des réponses 5xx (`{ "error": "Erreur serveur", "requestId": "…" }`) pour retrouver l'erreur complète dans les logs.
- Niveau selon le statut : 2xx/3xx `info`, 4xx `warn`, 5xx `error`.
- Les en-têtes `Authorization`, `Cookie`, `X-Api-Key` et `Set-Cookie` sont masqués (`redact`) ; les corps de requête ne sont jamais journalisés.
- Les requêtes SQL de Prisma ne sont plus journalisées par défaut : `LOG_SQL=1` pour les afficher.
- `src/config/env.js` et `prisma/seed.js` gardent `console` : le premier s'exécute avant le logger (validation de la config, arrêt du processus), le second est un script en ligne de commande.

## Tests

```bash
npm test   # node --test, sans base de données
```

Logique pure (nuits, prix, chevauchement, moyenne des notes, filtres / tri / équipements, codes d’erreur), statuts de réservation (PENDING, expiration 48 h, transitions, chevauchement avec les périodes bloquées), signatures d’images (magic bytes), jetons de réinitialisation (hash, expiration, usage unique, comparaison à temps constant), révocation des JWT par `passwordChangedAt` (middleware `authenticateToken`), gabarits d’emails (échappement HTML), `requireRole`, occupation et statistiques hôte.

## Sécurité

- `helmet`, `x-powered-by` désactivé, corps JSON limité à 100 ko.
- Rate limiting : 300 req / 15 min sur `/api`, 10 req / 15 min (compteur partagé) sur `/api/auth/login` + `/api/auth/register`, 30 req / min sur `/api/maps/geocode` + `/api/maps/reverse` (proxy Nominatim ; `listings-in-bounds` n’interroge que la base et reste soumis à la limite générale). Réponse `429`.
- Rate limiting supplémentaire : 5 req / 15 min sur `/api/auth/forgot-password`, 10 req / 15 min sur `/api/auth/reset-password`, 30 téléversements / 15 min sur `POST /api/listings/:id/images`.
- Mots de passe : bcrypt 12 rounds. Tokens JWT HS256. Un JWT émis avant `User.passwordChangedAt` (renseigné par la réinitialisation du mot de passe) est refusé (`401`) : la réinitialisation révoque toutes les sessions. Le changement de mot de passe depuis le profil (`PATCH /api/users/me`) ne révoque pas encore les sessions (vague 4).
- Téléversement : token vérifié (signature, sans base) → réception multipart en mémoire (5 Mo / fichier, 10 fichiers, champs limités) → type réel vérifié par signature binaire (JPEG, PNG, WebP ; extension et mimetype ignorés) → utilisateur en base → `sharp` (rotation EXIF, **métadonnées supprimées** dont GPS, 1600 px max, WebP qualité 80, 40 Mpx max en entrée).
- Validation `zod` de toutes les entrées (champs inconnus refusés) : `400 { error, details: [{ path, message }] }`.
- Erreurs : `404` JSON pour les routes inconnues, message générique pour les `5xx`, Prisma `P2002` → `409`, `P2025` → `404`, `P2034` (conflit de transaction) et échec de sérialisation / interblocage PostgreSQL (`40001`, `40P01`) → `409`.
- Les erreurs métier ont la forme `{ "error": "message" }`.

## Endpoints (segmentés par domaine)

Conventions : dates de séjour au format `YYYY-MM-DD` (jours calendaires, nuits `[checkIn, checkOut[` : le jour du départ est libre pour une nouvelle arrivée) ; « aujourd’hui » = date UTC du serveur ; montants en nombres (devise de l’annonce, `XOF` par défaut). Routes « auth » : header `Authorization: Bearer <token>`, sinon `401` (token absent/expiré) ou `403` (token invalide).

### Santé
- `GET /health` – état de l’API

### Auth (`/api/auth`)
- `POST /api/auth/register` – inscription (rôle `GUEST`)
  Body: `{ "email", "password" (8–72 caractères), "name?" }`
- `POST /api/auth/login` – connexion
  Body: `{ "email", "password" }`
  Réponse: `{ "user": { id, email, name, avatar, role }, "token" }`
- `GET /api/auth/me` – utilisateur courant (auth)
- `POST /api/auth/forgot-password` – Body `{ "email" }` → **toujours** `200 { "message": "Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé." }` (réponse envoyée avant tout accès à la base : ni contenu ni délai ne révèlent l’existence du compte). Crée un jeton aléatoire de 32 octets (seul son SHA-256 est stocké), valable 1 h, invalide les jetons précédents, envoie le lien `${APP_URL}/reinitialiser-mot-de-passe?token=…`. `429` au-delà de 5 demandes / 15 min.
- `POST /api/auth/reset-password` – Body `{ "token" (43 caractères base64url), "newPassword" (8–72) }` → `200 { "message" }`. Jeton inconnu, expiré ou déjà utilisé → `400 { "error": "Lien de réinitialisation invalide ou expiré" }`. Met à jour le mot de passe (bcrypt 12), renseigne `passwordChangedAt` (anciennes sessions révoquées), consomme le jeton et invalide les autres.

### Users (`/api/users`) – authentification requise
- `GET /api/users/me` – profil `{ id, email, name, avatar, role, createdAt }`
- `PATCH /api/users/me` – mise à jour, réponse `{ id, email, name, avatar, role }`
  Body: `{ "name?", "avatar?" (URL https), "currentPassword?", "newPassword?" (8–72) }`
  Changer de mot de passe exige `currentPassword` (sinon `400`, incorrect → `401`).
- `GET /api/users/me/favorites` – annonces favorites complètes : `{ "data": [Listing (isFavorite: true)] }`
- `GET /api/users/me/bookings` – mes réservations (voyageur) : `{ "data": [Booking] }` avec `listing` complète, `hasReview`, `canReview`

### Listings (`/api/listings`)

Objet **Listing** renvoyé :

```json
{
  "id": "seed-lome-beach-house", "title": "Maison de plage à Lomé", "description": "…",
  "location": "Lomé, Togo", "address": null, "latitude": 6.1228, "longitude": 1.2311,
  "pricePerNight": 45000, "currency": "XOF", "maxGuests": 4, "bedrooms": 2,
  "rating": 4, "reviewCount": 1, "imageUrl": "https://…", "categoryId": "bord-mer",
  "acceptsPets": true, "hostId": "…", "host": { "id": "…", "name": "Awa Diop", "avatar": null },
  "amenities": ["WIFI", "SEA_VIEW", "GENERATOR"], "instantBook": true, "status": "ACTIVE",
  "images": [{ "id": "…", "url": "https://…", "alt": "…", "position": 0 }],
  "createdAt": "…", "updatedAt": "…",
  "isFavorite": false
}
```

`images` est trié par `position` ; `imageUrl` (compatibilité) est toujours l’URL de la première image (synchronisé automatiquement), `null` sans photo. `amenities` ⊂ `WIFI, AIR_CONDITIONING, FAN, POOL, PARKING, KITCHEN, WASHER, TV, WORKSPACE, GENERATOR, SOLAR_POWER, WATER_TANK, WATER_HEATER, SECURITY, CCTV, BREAKFAST, SEA_VIEW, BEACH_ACCESS, GARDEN, TERRACE, BBQ, MOSQUITO_NETS, AIRPORT_SHUTTLE, HOUSEKEEPING` (groupe électrogène, solaire, citerne, gardien, moustiquaires…). Les annonces `HIDDEN` (modération) disparaissent de la recherche, de la carte, des favoris, des réservations et de `GET /:id` (`404`), sauf pour leur hôte et les administrateurs.

`isFavorite` n’est présent que si la requête porte un token valide (token invalide ou expiré : réponse anonyme, pas d’erreur). `rating` (moyenne des avis, 2 décimales, `null` sans avis) et `reviewCount` sont calculés, jamais saisis.

- `GET /api/listings` – liste. Réponse : `{ data: [Listing], total, limit, offset, priceRange: { min, max } }` (`priceRange` : prix min / max de toutes les annonces publiques, indépendant des filtres, pour les curseurs ; `null` sans annonce)
  Query (tous facultatifs) :
  - `where` (ou `q`) : texte recherché dans `location` ou `title` (insensible à la casse et aux accents)
  - `categoryId`, `pets` (`1`/`true` = animaux acceptés), `minPrice`, `maxPrice`
  - `guests` : annonces avec `maxGuests >= guests`
  - `checkIn`, `checkOut` (`YYYY-MM-DD`) : exclut les annonces ayant une réservation bloquante (`CONFIRMED`, ou `PENDING` non expirée) ou une période bloquée par l’hôte qui chevauche le séjour. `checkOut` doit être > `checkIn` (sinon `400`). Une seule date : la nuit correspondante est vérifiée.
  - `amenities=WIFI,POOL` : annonces possédant **tous** ces équipements (code inconnu → `400`)
  - `sort` : `recommended` (défaut : plus récentes d’abord), `price_asc`, `price_desc`, `rating_desc` (sans note en dernier)
  - `limit` (1–100, défaut 50), `offset` (≥ 0)
- `GET /api/listings/price-range` – `{ min, max }` (mêmes valeurs que `priceRange`)
  Exemple : `/api/listings?where=lome&categoryId=bord-mer&pets=1&guests=2&checkIn=2026-11-01&checkOut=2026-11-04`
- `GET /api/listings/:id` – détail (`404` si absente)
- `GET /api/listings/mine` – (auth) mes annonces : `{ data: [Listing + "upcomingBookings"] }` (réservations non annulées en cours ou à venir)
- `GET /api/listings/mine/bookings` – (auth) réservations reçues sur mes annonces : `{ data: [Booking] }` avec `guest { id, name, avatar }` et `listing { id, title, location, imageUrl, currency, instantBook }`
- `GET /api/listings/mine/stats` – (auth) tableau de bord hôte :
  ```json
  {
    "revenue": { "XOF": { "past": 135000, "upcoming": 180000, "total": 315000 } },
    "nightsBooked": { "past": 3, "upcoming": 4, "total": 7 },
    "occupancy": [{ "listingId": "…", "title": "…", "last30": 0.1, "last90": 0.0333, "next30": 0.1333, "next90": 0.0444 }],
    "averageRating": 4.5, "reviewCount": 2, "listingsCount": 2, "pendingRequests": 1,
    "upcomingArrivals": [Booking (vue hôte, 10 max, 90 prochains jours, CONFIRMED + PENDING non expirées)]
  }
  ```
  Revenus des réservations `CONFIRMED` par devise (`past` : départ atteint ; `upcoming` : en cours ou à venir). Occupation (0–1) = nuits `CONFIRMED` dans la fenêtre / nombre de nuits : `last30` / `last90` = `[aujourd’hui − N, aujourd’hui[`, `next30` / `next90` = `[aujourd’hui, aujourd’hui + N[`. `averageRating` : moyenne pondérée par le nombre d’avis.
- `POST /api/listings` – (auth) créer → `201 Listing`. Un utilisateur `GUEST` devient `HOST`.
  Body : `title`, `location`, `pricePerNight` (> 0), `description?`, `address?`, `latitude?` [-90, 90], `longitude?` [-180, 180], `imageUrl?` (URL https : devient la première photo), `categoryId?`, `acceptsPets?`, `currency?` (code ISO 4217, défaut `XOF`), `maxGuests?` (1–50, défaut 4), `bedrooms?` (0–50, défaut 1), `amenities?` (tableau de codes, défaut `[]`), `instantBook?` (défaut `true`). `status`, `rating`, `reviewCount` ne sont pas acceptés.
  ```json
  { "title": "Case au bord du lac", "location": "Ganvié, Bénin", "pricePerNight": 30000, "maxGuests": 3, "bedrooms": 1, "categoryId": "omg" }
  ```
- `PATCH /api/listings/:id` – (auth, propriétaire, sinon `403`) mêmes champs, tous optionnels → `Listing`. `imageUrl` (URL) : ajoutée comme photo de couverture (ou remontée en tête si déjà présente ; `400` si 10 photos) ; `imageUrl: null` est ignoré (supprimer les photos via `DELETE …/images/:imageId`).
- `DELETE /api/listings/:id` – (auth, propriétaire) → `204` (réservations, avis, favoris, photos et périodes bloquées supprimés en cascade ; fichiers téléversés supprimés du stockage)

#### Photos (propriétaire)
- `POST /api/listings/:id/images` – `multipart/form-data`, champ `images` (1 à 10 fichiers JPEG / PNG / WebP, 5 Mo max chacun ; 10 photos max par annonce) → `201 { "data": [{ id, url, alt, position }] }` (toutes les photos, triées ; les nouvelles à la fin).
  Erreurs : `401`/`403` token ; `415` pas multipart, type réel non supporté ou image illisible ; `413` fichier > 5 Mo ; `400` aucun fichier, mauvais champ, > 10 fichiers ou limite de 10 photos par annonce ; `403` pas propriétaire ; `404` annonce ; `409` limite atteinte par un envoi concurrent.
- `DELETE /api/listings/:id/images/:imageId` → `{ "data": [images restantes] }` (positions renumérotées, fichier supprimé du stockage ; `imageUrl` resynchronisé)
- `PATCH /api/listings/:id/images/order` – Body `{ "imageIds": ["…", "…"] }` (permutation complète, sans doublon ; sinon `400`) → `{ "data": [images] }`. La première devient la couverture.

#### Dates bloquées (propriétaire)
- `GET /api/listings/:id/blocked-periods?from=YYYY-MM-DD` → `{ "data": [{ id, listingId, startDate, endDate, reason, createdAt }] }` (`from` : périodes finissant après cette date)
- `POST /api/listings/:id/blocked-periods` – Body `{ "startDate", "endDate", "reason?" (≤ 200) }` (nuits `[startDate, endDate[`, `startDate ≥ aujourd’hui`, ≤ 365 jours) → `201`. `409` si une réservation `CONFIRMED` ou `PENDING` non expirée chevauche.
- `DELETE /api/listings/:id/blocked-periods/:periodId` → `204`

Les périodes bloquées sont exclues des réservations (`409`) et de la recherche par dates, et renvoyées (sans la raison) par `/availability`.

#### Favoris
- `POST /api/listings/:id/favorite` – (auth) idempotent → `{ "listingId", "isFavorite": true }` (`404` si l’annonce n’existe pas)
- `DELETE /api/listings/:id/favorite` – (auth) idempotent → `{ "listingId", "isFavorite": false }`

#### Réservations
Objet **Booking** :

```json
{
  "id": "…", "listingId": "…", "guestId": "…",
  "checkIn": "2026-11-01", "checkOut": "2026-11-04", "nights": 3, "guests": 2,
  "totalPrice": 135000, "currency": "XOF", "status": "CONFIRMED", "createdAt": "…",
  "listing": { "…": "Listing" }, "hasReview": false, "canReview": false
}
```

`canReview` = réservation `CONFIRMED`, date de départ atteinte et pas encore d’avis. `expiresAt` : fin du délai de réponse de l’hôte (`PENDING` uniquement, sinon `null`).

Statuts : `CONFIRMED` (réservation instantanée ou acceptée), `PENDING` (demande en attente : annonce `instantBook: false`), `DECLINED` (refusée par l’hôte), `EXPIRED` (sans réponse), `CANCELLED`. `PENDING` et `CONFIRMED` bloquent les dates ; `CANCELLED`, `DECLINED`, `EXPIRED` les libèrent.

**Expiration (choix : statut calculé + persistance paresseuse)** : une demande `PENDING` est expirée 48 h après sa création, ou dès que son jour d’arrivée est passé. Le statut renvoyé par l’API et les filtres de disponibilité appliquent cette règle à la lecture (`src/utils/bookingStatus.js`) : le résultat est exact sans tâche planifiée. La valeur `EXPIRED` est ensuite écrite en base quand la demande est touchée (accepter / refuser / annuler → `409` « Cette demande a expiré ») et par un `updateMany` lors de la lecture des listes de réservations (voyageur ou hôte). Pas de cron à exploiter ; la base peut contenir des `PENDING` périmées entre deux lectures, sans effet sur l’API.

- `POST /api/listings/:id/bookings` – (auth) réserver → `201 Booking`
  Body : `{ "checkIn": "2026-11-01", "checkOut": "2026-11-04", "guests": 2 }`
  Contrôles : dates `YYYY-MM-DD` valides, `checkOut > checkIn`, `checkIn ≥ aujourd’hui`, ≤ 365 nuits, `guests` 1–50 (`400`) ; `guests ≤ maxGuests` (`400`) ; pas sa propre annonce (`403`) ; annonce inexistante ou masquée (`404`) ; chevauchement avec une réservation bloquante ou une période bloquée → `409 { "error": "Ces dates ne sont pas disponibles" }`.
  Annonce `instantBook: true` → `status: "CONFIRMED"` (emails : voyageur + hôte) ; `false` → `status: "PENDING"` (email : demande à l’hôte).
  `totalPrice = nuits × pricePerNight`. Le contrôle et l’insertion sont faits dans une transaction qui verrouille la ligne de l’annonce (`SELECT … FOR UPDATE`) : pas de double réservation concurrente.
- `GET /api/listings/:id/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` – nuits indisponibles (sans info personnelle). Défaut : `from` = aujourd’hui, `to` = `from` + 365 j (période ≤ 730 j). `404` si l’annonce est masquée.
  Réponse : `{ "listingId", "from", "to", "booked": [{ "checkIn", "checkOut" }], "blocked": [{ "startDate", "endDate" }] }` — `booked` contient les réservations bloquantes **et** les périodes bloquées (un calendrier qui ne lit que `booked` reste correct) ; `blocked` : périodes bloquées seules, sans la raison.
- `PATCH /api/bookings/:id/cancel` – (auth, voyageur ou hôte de l’annonce, sinon `403`) → `Booking` avec `status: "CANCELLED"` (`CONFIRMED` ou `PENDING`). Idempotent ; `409` si le séjour a déjà commencé (`checkIn ≤ aujourd’hui`), si la demande a expiré ou a été refusée. Emails : voyageur + hôte.
- `PATCH /api/bookings/:id/confirm` – (auth, hôte de l’annonce, sinon `403`) demande `PENDING` → `CONFIRMED` (email au voyageur et à l’hôte). `409` si expirée (persistée `EXPIRED`), déjà traitée ou dates devenues indisponibles.
- `PATCH /api/bookings/:id/decline` – (auth, hôte) `PENDING` → `DECLINED` (email au voyageur). Mêmes `409`.

#### Avis
- `GET /api/listings/:id/reviews?limit=10&offset=0` – (limit 1–50, défaut 10) plus récents d’abord :
  `{ "data": [{ "id", "rating", "comment", "createdAt", "author": { "id", "name", "avatar" } }], "total", "limit", "offset", "rating", "reviewCount" }`
- `POST /api/bookings/:id/review` – (auth) Body `{ "rating": 1–5 (entier), "comment": "1–1000 caractères" }` → `201 { id, rating, comment, createdAt, author, "listing": { id, rating, reviewCount } }`
  Seul le voyageur de la réservation (`403`), réservation `CONFIRMED` et `checkOut ≤ aujourd’hui` (`400`), un seul avis par séjour (`409`). La note moyenne et `reviewCount` de l’annonce sont recalculés dans la même transaction.

### Administration (`/api/admin`) – rôle `ADMIN` (`401` sans token, `403` autre rôle)

Chaque action d’écriture est journalisée : `req.log.info({ adminId, action, target, … }, "[admin] …")`.

- `GET /api/admin/stats` → `{ users: { total, byRole }, listings: { total, byStatus }, bookings: { total, byStatus }, confirmedRevenue: [{ currency, total, bookings }] }`
- `GET /api/admin/users?q=&role=&limit=20&offset=0` (`q` : email ou nom, insensible à la casse ; `limit` 1–100) → `{ data: [{ id, email, name, avatar, role, createdAt, listingsCount, bookingsCount }], total, limit, offset }`
- `PATCH /api/admin/users/:id/role` – Body `{ "role": "GUEST" | "HOST" | "ADMIN" }` → utilisateur. `409` : se retirer soi-même le rôle ADMIN, ou rétrograder le dernier administrateur (transaction sérialisable) ; `404` inconnu.
- `GET /api/admin/listings?q=&status=ACTIVE|HIDDEN&limit&offset` → `{ data: [Listing + host.email, bookingsCount, reviewsCount], total, limit, offset }` (annonces masquées comprises)
- `PATCH /api/admin/listings/:id/status` – Body `{ "status": "ACTIVE" | "HIDDEN" }` → `Listing`
- `GET /api/admin/reviews?limit&offset` → `{ data: [{ id, rating, comment, createdAt, author { id, name, email, avatar }, listing { id, title } }], total, limit, offset }` (plus récents d’abord)
- `DELETE /api/admin/reviews/:id` → `{ "listing": { id, rating, reviewCount } }` (note recalculée dans la même transaction)

### Maps (`/api/maps`)
- `GET /api/maps/geocode?address=...&limit=5` – adresse (≤ 200 caractères) → coordonnées (OpenStreetMap Nominatim, timeout 5 s, `502` si indisponible)
- `GET /api/maps/reverse?lat=...&lon=...` – coordonnées → adresse
- `GET /api/maps/listings-in-bounds?neLat=&neLng=&swLat=&swLng=` – annonces publiques (`ACTIVE`) dans la zone visible (200 max). Accepte les mêmes filtres facultatifs que `GET /api/listings` (`where`, `categoryId`, `pets`, `guests`, `checkIn`, `checkOut`, `minPrice`, `maxPrice`, `amenities`, `sort`).
  Réponse : `{ "data": [{ id, title, location, latitude, longitude, pricePerNight, currency, rating, reviewCount, imageUrl, categoryId, maxGuests, amenities, instantBook }] }`

## Seed

`npm run db:seed` (refusé si `NODE_ENV=production`) est idempotent : identifiants fixes et `upsert`, il peut être relancé sans doublon. Il crée :

- 4 comptes (mot de passe `demo1234`) : `host@afrikabnb.com` (HOST, compte de démo historique), `awa@afrikabnb.com` (HOST), `kofi@afrikabnb.com` (GUEST), `admin@afrikabnb.com` (**ADMIN**) ;
- 20 annonces avec coordonnées réelles, au moins 2 par catégorie du front (`piscines`, `bord-mer`, `safari`, `cabanes`, `tendance`, `omg`, `parcs`, `iles`, `luxe`), prix en XOF, équipements, 2 à 4 photos Unsplash chacune (position 0 = `imageUrl`) ; 3 annonces sur demande (`instantBook: false` : Gorée, Palmeraie, Ikoyi) ;
- 26 réservations (passées, à venir, une annulée, une demande `PENDING` à Gorée — expirée 48 h après le seed —, une refusée) dont 19 avec avis ; `rating` et `reviewCount` sont recalculés depuis les avis ;
- 2 périodes bloquées (Lomé, Kpalimé).

Les photos externes non issues du seed (ex. reprises de `imageUrl` par la migration vague 3) sont remplacées par celles du seed ; les photos téléversées sont conservées.

Les dates des réservations sont relatives au jour du premier seed.
