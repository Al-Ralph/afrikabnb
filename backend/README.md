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
| `POSTGRES_PASSWORD` | Mot de passe de la base locale Docker Compose | obligatoire pour `docker compose`, sans `@ : / ? #` |
| `POSTGRES_USER`, `POSTGRES_DB` | Utilisateur / base locale (Compose) | `afrikabnb` |

En production, l’API refuse de démarrer si `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` ou `CORS_ORIGIN` est absent ou invalide, et avertit si une URL de base distante n’impose pas `sslmode=require` ou si le pooler Supabase (port `6543`) est utilisé sans `pgbouncer=true`.

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

- L’API accède à la base **uniquement via Prisma**, avec le rôle `postgres` et les URL de connexion. Les clés Supabase (`anon`, `service_role`) et le client `supabase-js` ne sont **pas utilisés**.
- Supabase expose aussi le schéma `public` via son API REST (Data API) avec la clé `anon`. La migration initiale active donc **Row Level Security sans aucune policy** sur `User`, `Listing`, `Favorite`, `Booking` et `Review` : ces tables sont inaccessibles par cette API, tandis que Prisma (propriétaire des tables) n’est pas concerné. Pour la table technique `_prisma_migrations`, exécuter une fois dans le SQL Editor : `alter table "_prisma_migrations" enable row level security;` (ou désactiver la Data API dans les paramètres du projet si elle ne sert pas).
- **Ne jamais exposer `DATABASE_URL` / `DIRECT_URL` côté frontend** (aucune variable `REACT_APP_*` ne doit les contenir) : elles donnent un accès complet à la base. Le frontend ne parle qu’à l’API Express.
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

- Appliquer : `npx prisma migrate deploy` (script `npm run db:migrate`), puis `npx prisma generate`.
- Créer une nouvelle migration après modification du schéma (dev, base locale de préférence) : `npx prisma migrate dev --name <nom>`.
- Longueurs des colonnes texte (`VARCHAR`) identiques aux limites des schémas `zod` : email 254, nom 100, titre et lieu 200, adresse 300, description 5000, URL d’image / avatar 2048, catégorie 50, commentaire d’avis 1000.
- Recherche texte (`where` / `q`) : insensible à la casse **et aux accents** (« Lome » trouve « Lomé ») via `unaccent(lower(...)) LIKE` dans une requête paramétrée (`findListingIdsByText`), les jokers `%`/`_` saisis étant échappés.
- Verrouillage des réservations et des avis : `SELECT … FROM "Listing" WHERE "id" = … FOR UPDATE` dans une transaction interactive Prisma (compatible avec le pooler en mode transaction).

## Tests

```bash
npm test   # node --test : logique pure (nuits, prix, chevauchement, moyenne des notes, filtres de recherche, codes d’erreur)
```

## Sécurité

- `helmet`, `x-powered-by` désactivé, corps JSON limité à 100 ko.
- Rate limiting : 300 req / 15 min sur `/api`, 10 req / 15 min (compteur partagé) sur `/api/auth/login` + `/api/auth/register`, 30 req / min sur `/api/maps/geocode` + `/api/maps/reverse` (proxy Nominatim ; `listings-in-bounds` n’interroge que la base et reste soumis à la limite générale). Réponse `429`.
- Mots de passe : bcrypt 12 rounds. Tokens JWT HS256.
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
  "createdAt": "…", "updatedAt": "…",
  "isFavorite": false
}
```

`isFavorite` n’est présent que si la requête porte un token valide (token invalide ou expiré : réponse anonyme, pas d’erreur). `rating` (moyenne des avis, 2 décimales, `null` sans avis) et `reviewCount` sont calculés, jamais saisis.

- `GET /api/listings` – liste. Réponse : `{ data: [Listing], total, limit, offset }`
  Query (tous facultatifs) :
  - `where` (ou `q`) : texte recherché dans `location` ou `title` (insensible à la casse et aux accents)
  - `categoryId`, `pets` (`1`/`true` = animaux acceptés), `minPrice`, `maxPrice`
  - `guests` : annonces avec `maxGuests >= guests`
  - `checkIn`, `checkOut` (`YYYY-MM-DD`) : exclut les annonces ayant une réservation non annulée qui chevauche le séjour. `checkOut` doit être > `checkIn` (sinon `400`). Une seule date : la nuit correspondante est vérifiée.
  - `limit` (1–100, défaut 50), `offset` (≥ 0)
  Exemple : `/api/listings?where=lome&categoryId=bord-mer&pets=1&guests=2&checkIn=2026-11-01&checkOut=2026-11-04`
- `GET /api/listings/:id` – détail (`404` si absente)
- `GET /api/listings/mine` – (auth) mes annonces : `{ data: [Listing + "upcomingBookings"] }` (réservations non annulées en cours ou à venir)
- `GET /api/listings/mine/bookings` – (auth) réservations reçues sur mes annonces : `{ data: [Booking] }` avec `guest { id, name, avatar }` et `listing { id, title, location, imageUrl, currency }`
- `POST /api/listings` – (auth) créer → `201 Listing`. Un utilisateur `GUEST` devient `HOST`.
  Body : `title`, `location`, `pricePerNight` (> 0), `description?`, `address?`, `latitude?` [-90, 90], `longitude?` [-180, 180], `imageUrl?` (URL https), `categoryId?`, `acceptsPets?`, `currency?` (code ISO 4217, défaut `XOF`), `maxGuests?` (1–50, défaut 4), `bedrooms?` (0–50, défaut 1).
  ```json
  { "title": "Case au bord du lac", "location": "Ganvié, Bénin", "pricePerNight": 30000, "maxGuests": 3, "bedrooms": 1, "categoryId": "omg" }
  ```
- `PATCH /api/listings/:id` – (auth, propriétaire, sinon `403`) mêmes champs, tous optionnels → `Listing`
- `DELETE /api/listings/:id` – (auth, propriétaire) → `204` (réservations, avis et favoris supprimés en cascade)

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

`canReview` = réservation `CONFIRMED`, date de départ atteinte et pas encore d’avis.

- `POST /api/listings/:id/bookings` – (auth) réserver → `201 Booking`
  Body : `{ "checkIn": "2026-11-01", "checkOut": "2026-11-04", "guests": 2 }`
  Contrôles : dates `YYYY-MM-DD` valides, `checkOut > checkIn`, `checkIn ≥ aujourd’hui`, ≤ 365 nuits, `guests` 1–50 (`400`) ; `guests ≤ maxGuests` (`400`) ; pas sa propre annonce (`403`) ; annonce inexistante (`404`) ; chevauchement avec une réservation non annulée → `409 { "error": "Ces dates ne sont pas disponibles" }`.
  `totalPrice = nuits × pricePerNight`. Le contrôle et l’insertion sont faits dans une transaction qui verrouille la ligne de l’annonce (`SELECT … FOR UPDATE`) : pas de double réservation concurrente.
- `GET /api/listings/:id/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` – plages occupées (sans info personnelle). Défaut : `from` = aujourd’hui, `to` = `from` + 365 j (période ≤ 730 j).
  Réponse : `{ "listingId", "from", "to", "booked": [{ "checkIn": "2026-11-01", "checkOut": "2026-11-04" }] }`
- `PATCH /api/bookings/:id/cancel` – (auth, voyageur ou hôte de l’annonce, sinon `403`) → `Booking` avec `status: "CANCELLED"`. Idempotent ; `409` si le séjour a déjà commencé (`checkIn ≤ aujourd’hui`).

#### Avis
- `GET /api/listings/:id/reviews?limit=10&offset=0` – (limit 1–50, défaut 10) plus récents d’abord :
  `{ "data": [{ "id", "rating", "comment", "createdAt", "author": { "id", "name", "avatar" } }], "total", "limit", "offset", "rating", "reviewCount" }`
- `POST /api/bookings/:id/review` – (auth) Body `{ "rating": 1–5 (entier), "comment": "1–1000 caractères" }` → `201 { id, rating, comment, createdAt, author, "listing": { id, rating, reviewCount } }`
  Seul le voyageur de la réservation (`403`), réservation `CONFIRMED` et `checkOut ≤ aujourd’hui` (`400`), un seul avis par séjour (`409`). La note moyenne et `reviewCount` de l’annonce sont recalculés dans la même transaction.

### Maps (`/api/maps`)
- `GET /api/maps/geocode?address=...&limit=5` – adresse (≤ 200 caractères) → coordonnées (OpenStreetMap Nominatim, timeout 5 s, `502` si indisponible)
- `GET /api/maps/reverse?lat=...&lon=...` – coordonnées → adresse
- `GET /api/maps/listings-in-bounds?neLat=&neLng=&swLat=&swLng=` – annonces dans la zone visible (200 max). Accepte les mêmes filtres facultatifs que `GET /api/listings` (`where`, `categoryId`, `pets`, `guests`, `checkIn`, `checkOut`, `minPrice`, `maxPrice`).
  Réponse : `{ "data": [{ id, title, location, latitude, longitude, pricePerNight, currency, rating, reviewCount, imageUrl, categoryId, maxGuests }] }`

## Seed

`npm run db:seed` (refusé si `NODE_ENV=production`) est idempotent : identifiants fixes et `upsert`, il peut être relancé sans doublon. Il crée :

- 3 comptes (mot de passe `demo1234`) : `host@afrikabnb.com` (HOST, compte de démo historique), `awa@afrikabnb.com` (HOST), `kofi@afrikabnb.com` (GUEST) ;
- 20 annonces avec coordonnées réelles, au moins 2 par catégorie du front (`piscines`, `bord-mer`, `safari`, `cabanes`, `tendance`, `omg`, `parcs`, `iles`, `luxe`), prix en XOF ;
- 24 réservations (passées, à venir, une annulée) dont 19 avec avis ; `rating` et `reviewCount` sont recalculés depuis les avis.

Les dates des réservations sont relatives au jour du premier seed.
