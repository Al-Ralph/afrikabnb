# AfrikaBnB Platform
## Plateforme de réservation de logements avec recherche multicritère et cartographie

**01/2026 – en cours**

Projet étudiant / portfolio (Lomé) : plateforme de réservation de logements en Afrique, sur le modèle d’Airbnb, avec recherche multicritère, réservation, avis, espace hôte et carte interactive.

---

## Description du projet

Développement d’une application web full-stack de réservation de logements (type Airbnb) centrée sur les destinations africaines : recherche par destination, dates, voyageurs et catégories, réservation sans double-réservation, avis après séjour, favoris, espace hôte, carte des annonces et interface en 5 langues.

---

## Fonctionnalités principales

### Frontend (React)
• **Interface responsive** avec header, grille d’annonces et bandeau d’accueil statique léger (CSS seul)
• **Recherche multicritère** :
  - Destination : texte recherché dans la ville et le titre des annonces, avec autocomplétion Google Places si une clé API est configurée et les cookies acceptés
  - Sélecteur de dates (calendrier double mois) : les logements déjà réservés sur la période sont exclus
  - Voyageurs (adultes, enfants, bébés, animaux) : capacité de l’annonce respectée, filtre « animaux acceptés »
  - Filtres par catégories (Piscines, Bord de mer, Safari, Cabanes, Tendance, OMG!, Parcs nationaux, Îles, Luxe)
  - Critères synchronisés dans l’URL (recherche partageable)
• **Fiche logement** avec widget de réservation : dates déjà réservées bloquées dans le calendrier, total calculé, liste des avis
• **Avis** déposables depuis le profil après la fin du séjour
• **Favoris** persistés en base pour l’utilisateur connecté
• **Profil** : nom, avatar, changement de mot de passe (ancien mot de passe exigé), mes réservations, annulation
• **Espace hôte** : création, modification et suppression d’annonces (devise XOF, EUR, USD…, capacité, chambres, catégorie, coordonnées GPS) et réservations reçues
• **Carte** (`/carte`) : Google Maps avec marqueurs de prix ; repli en liste sans clé API ou sans consentement
• **Système multilingue** (français, anglais, espagnol, allemand, portugais) avec persistance du choix
• **Bandeau de consentement cookies** conditionnant le chargement de Google Fonts et Google Maps, et pages légales (mentions légales, confidentialité, cookies, CGU)

### Backend (Node.js / Express)
• **API REST segmentée** par domaine métier (Auth, Users, Listings, Bookings, Reviews, Favorites, Maps) dans un **monolithe modulaire**
• **Authentification JWT** (HS256) avec middleware de protection des routes
• **Moteur de recherche** :
  - Filtrage par texte (ville/titre), catégorie, prix (min/max), animaux, nombre de voyageurs et disponibilité sur des dates
  - Annonces contenues dans la zone visible de la carte (bounds)
  - Géocodage et géocodage inverse via OpenStreetMap Nominatim
• **Gestion des annonces** : CRUD complet avec contrôle du propriétaire ; un voyageur qui publie une annonce devient hôte
• **Réservations** : contrôle des dates, de la capacité et du chevauchement dans une transaction qui verrouille l’annonce (`SELECT … FOR UPDATE`), annulation par le voyageur ou l’hôte avant le début du séjour
• **Avis** : un avis par séjour terminé ; note moyenne et nombre d’avis recalculés dans la même transaction
• **Validation stricte** de toutes les entrées avec zod (champs inconnus refusés)

### Base de données (PostgreSQL / Supabase)
• **Modélisation relationnelle** avec Prisma ORM et migrations versionnées
• **Tables** :
  - `User` : utilisateurs (email, mot de passe haché bcrypt, nom, avatar, rôle `GUEST` / `HOST` / `ADMIN`)
  - `Listing` : annonces (latitude/longitude, prix, devise, capacité, chambres, catégorie, animaux, note calculée)
  - `Booking` : réservations (dates, voyageurs, prix total, statut)
  - `Review` : avis liés à une réservation
  - `Favorite` : favoris utilisateur / annonce
• **Index** sur les colonnes filtrées : index B-tree composite `(latitude, longitude)` pour les requêtes par zone (pas d’index `SPATIAL`), `hostId`, `categoryId`, `(listingId, checkIn, checkOut)` pour la disponibilité
• **Contraintes d’intégrité** avec suppression en cascade (réservations, avis et favoris d’une annonce supprimée)

---

## Technologies utilisées

### Frontend
• **React 19** (Create React App / react-scripts 5) avec hooks et **React Router 7**
• **Context API** pour l’état global (authentification, langue, recherche, favoris, consentement)
• **Google Maps JavaScript API / Places** pour l’autocomplétion et la carte (après consentement)
• **CSS** (variables, Flexbox, Grid, animations)
• **Jest + Testing Library** : 214 tests

### Backend
• **Node.js** avec **Express 4** (modules ESM)
• **Prisma 5** pour PostgreSQL
• **zod** pour la validation des entrées
• **jsonwebtoken** (HS256) et **bcryptjs** (12 rounds)
• **helmet** et **express-rate-limit**
• **Axios** pour le géocodage OpenStreetMap Nominatim
• **node --test** : 22 tests sur la logique métier, la recherche et la gestion des erreurs

Projet 100 % JavaScript (pas de TypeScript).

### Base de données
• **PostgreSQL** hébergé sur **Supabase** (sauvegardes gérées, connexions SSL, tableau de bord / Table Editor), pooler en mode transaction pour l’API et connexion directe pour les migrations
• **Prisma** avec migrations versionnées (`20261022000000_init`, `20261022120000_unaccent`), Row Level Security activée contre l’API REST publique de Supabase, et seed de démo idempotent

### Déploiement et DevOps
• **Docker** pour le backend : image de l’API (connectée à Supabase) ; **Docker Compose** pour une pile locale facultative API + PostgreSQL 16 avec volume persistant
• **Health check** PostgreSQL (`pg_isready`) en local : l’API attend que la base soit prête ; migrations appliquées au démarrage du conteneur (`prisma migrate deploy`), API exécutée en utilisateur non-root
• **Variables d’environnement validées au démarrage** (refus de démarrer en production si `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` ou `CORS_ORIGIN` est absent ou invalide ; avertissement si la connexion à la base n’impose pas SSL)
• **Proxy de développement** React vers l’API
• Le frontend n’est pas conteneurisé

---

## Architecture technique

### Monolithe modulaire
Une seule application Express, découpée en modules par domaine (`backend/src/api/…`), partageant une base PostgreSQL :
• **Auth** : inscription, connexion, utilisateur courant
• **Users** : profil, mot de passe, mes favoris, mes réservations
• **Listings** : CRUD des annonces, recherche filtrée, disponibilités
• **Bookings** : réservation, annulation
• **Reviews** : avis et calcul de la note moyenne
• **Favorites** : ajout / retrait idempotents
• **Maps** : géocodage, géocodage inverse, annonces dans une zone géographique

### Sécurité
• **JWT HS256** avec secret obligatoire validé au démarrage ; durée de validité configurable (1 jour par défaut)
• **Hachage bcrypt** des mots de passe (12 rounds)
• **helmet**, CORS restreint aux origines configurées, corps JSON limité à 100 ko
• **Rate limiting** : général sur l’API, renforcé sur connexion/inscription et sur le géocodage
• **Validation zod** stricte de toutes les entrées
• **Erreurs 5xx masquées** (message générique), email des hôtes jamais exposé dans les réponses publiques
• **Contrôle du propriétaire** avant modification/suppression d’annonce
• `npm audit` backend : 0 vulnérabilité
• Limite connue : le token est stocké en `localStorage` (piste : cookie `httpOnly` + refresh token)

### Performance
• **Pagination** des résultats (limit/offset)
• **Index de base de données** sur les colonnes filtrées (voir ci-dessus)
• **Sélection de champs** ciblée dans les requêtes Prisma
• **Lazy loading** des images et **bundle léger** : ≈ 123 kB gzip ; l’ancienne scène 3D (three.js, ~279 kB gzip et ~16 Mo de modèles/textures) a été remplacée par un bandeau CSS

---

## Déploiement

### Docker Compose (backend)
• **Service API** : conteneur Node.js construit depuis le `Dockerfile`, démarré après le health check PostgreSQL
• **Service PostgreSQL 16** (local, facultatif) : volume persistant, port exposé uniquement sur `127.0.0.1`
• **Production** : la même image se lance seule avec les URL Supabase (`docker run --env-file .env`)
• **Configuration par variables d’environnement** (`backend/.env`)

### Commandes
```bash
# Lancer l'API et PostgreSQL en local
cd backend
cp .env.example .env   # renseigner JWT_SECRET, POSTGRES_PASSWORD
docker compose up --build

# Peupler la base avec les données de démo (depuis la machine hôte, NODE_ENV=development)
npm run db:seed

# Arrêter les services
docker compose down
```

Le seed est refusé si `NODE_ENV=production`, il ne s’exécute donc pas dans le conteneur API.

### Variables d’environnement
• **Backend** : `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `PORT`, `TRUST_PROXY`, `DIRECT_URL`, `POSTGRES_*` (Compose local)
• **Frontend** : `REACT_APP_API_URL` (optionnelle), `REACT_APP_GOOGLE_MAPS_API_KEY` (optionnelle)

---

## Résultats et impact

• **Parcours complet fonctionnel** : recherche → fiche logement → réservation → annulation ou avis après séjour, côté voyageur comme côté hôte
• **Fiabilité** : 214 tests frontend et 22 tests backend, réservation protégée contre la double-réservation concurrente
• **Interface multilingue** (5 langues) avec consentement cookies et pages légales
• **Base saine pour évoluer** : domaines séparés, migrations versionnées, seed reproductible (20 annonces, 9 catégories, 3 comptes de démo)
• **Limites actuelles** : pas de paiement en ligne, pas de messagerie hôte/voyageur, une seule image par annonce, modes de calendrier « Mois » / « Flexibles » non implémentés, déploiement du frontend non décrit, Create React App déprécié (migration Vite envisagée)

---

## Compétences techniques démontrées

• **Développement full-stack JavaScript** : React pour le frontend, Node.js/Express pour le backend
• **Base de données** : PostgreSQL (Supabase) avec Prisma, modélisation relationnelle (5 tables), migrations, transactions et verrouillage, Row Level Security
• **Intégration d’APIs externes** : Google Maps JavaScript API / Places, OpenStreetMap Nominatim
• **Architecture** : monolithe modulaire découpé par domaine, API REST
• **Sécurité** : JWT, bcrypt, validation zod, rate limiting, helmet, configuration validée au démarrage
• **Tests** : Jest + Testing Library, `node --test`
• **DevOps** : Docker, Docker Compose, variables d’environnement
• **Internationalisation** : 5 langues
• **Conformité** : consentement cookies, pages légales
• **UX/UI** : design responsive (testé à 390 px), icônes SVG homogènes, accessibilité (focus visibles, ARIA)
