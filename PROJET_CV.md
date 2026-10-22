# AfrikaBnB Platform
## Plateforme de réservation de logements avec recherche multicritère et cartographie

**01/2026 - En cours** · Projet personnel / portfolio, Lomé

Application web full-stack de réservation de logements en Afrique (type Airbnb) : recherche, réservation, avis, favoris, espace hôte, carte et interface en 5 langues.

• **Développé une application full-stack JavaScript** (React 19 / Node.js-Express / PostgreSQL-Supabase) couvrant le parcours complet : recherche, fiche logement, réservation, annulation et avis après séjour, côté voyageur comme côté hôte.

• **Conçu un moteur de recherche multicritère** (destination, dates disponibles, nombre de voyageurs, animaux, 9 catégories, prix) synchronisé dans l’URL, et une carte Google Maps avec marqueurs de prix et repli en liste.

• **Sécurisé la réservation** contre la double-réservation concurrente grâce à une transaction Prisma avec verrouillage de ligne (`SELECT … FOR UPDATE`) ; notes moyennes recalculées à chaque avis dans la même transaction.

• **Structuré l’API en monolithe modulaire** découpé en 7 domaines (auth, users, listings, bookings, reviews, favorites, maps), avec validation zod stricte de toutes les entrées.

• **Renforcé la sécurité** : JWT HS256 à secret obligatoire validé au démarrage, bcrypt (12 rounds), helmet, rate limiting, CORS restreint, erreurs 5xx masquées ; `npm audit` backend à 0 vulnérabilité.

• **Écrit 236 tests automatisés** : 214 tests frontend (Jest + Testing Library) et 22 tests backend (`node --test`).

• **Internationalisé l’interface en 5 langues** (FR, EN, ES, DE, PT) et mis en place un bandeau de consentement cookies conditionnant Google Fonts / Google Maps, avec pages légales.

• **Allégé le frontend** : retrait d’une scène 3D three.js au profit d’un bandeau CSS (-279 kB gzip de JavaScript, -16 Mo d’assets) ; bundle ≈ 123 kB gzip.

**Technologies utilisées :**
• **Frontend** : React 19, React Router 7, Context API, Google Maps JavaScript API / Places, Jest + Testing Library.
• **Backend** : Node.js, Express 4, Prisma 5, zod, JWT, bcrypt, helmet, express-rate-limit, OpenStreetMap Nominatim.
• **Données** : PostgreSQL hébergé sur Supabase, 5 tables relationnelles, migrations Prisma versionnées, Row Level Security, seed de démo reproductible (20 annonces).
• **DevOps** : Docker et Docker Compose (API + PostgreSQL local, health check, migrations au démarrage, conteneur non-root) ; base managée Supabase en production.
