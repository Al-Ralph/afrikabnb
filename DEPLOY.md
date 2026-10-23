# Mise en ligne d'AfrikaBnB

Guide pas à pas, à suivre **dans l'ordre**. Architecture visée :

```
Navigateur ──► Vercel (frontend React, https://<projet>.vercel.app)
                 │  /api/* et /health réécrits (même origine pour le navigateur)
                 ▼
               Render (API Express, Docker, région Francfort, offre gratuite)
                 │
                 ├──► Supabase UE (PostgreSQL + Storage « listing-images »)
                 └──► Resend (e-mails)
```

Pourquoi la réécriture : le cookie de session `afrikabnb_rt` est `SameSite=Strict` et limité à
`/api/auth`. Le navigateur ne l'envoie que si le frontend appelle l'API **sur sa propre origine**.
Vercel relaie donc `/api/*` vers Render ; le frontend n'a **pas** de `VITE_API_URL` en production.

## Règles de sécurité (à lire avant de commencer)

- Ne jamais coller un mot de passe, une URL de base de données ou une clé dans un chat, un ticket,
  une capture d'écran ou un fichier commité. Les valeurs se saisissent uniquement dans les
  interfaces Supabase / Render / Vercel / Resend, ou dans un terminal avec `read -rs` (saisie masquée).
- La clé `service_role` (ou clé secrète `sb_secret_…`) de Supabase et la clé Resend vont **uniquement
  dans Render**. Jamais dans Vercel, jamais dans une variable `VITE_*` (elles seraient publiées dans
  le JavaScript du site).
- `backend/.env` reste sur votre poste (il est ignoré par Git) et pointe vers l'ancienne base de
  démonstration : les scripts de migration ne le lisent pas.

## 0. Prérequis

| Élément | Détail |
| --- | --- |
| Dépôt GitHub | Le code à jour sur la branche suivie par les plateformes (ex. `master` après fusion de `vague-5-mise-en-ligne`). |
| Comptes | [Supabase](https://supabase.com), [Render](https://render.com), [Vercel](https://vercel.com), [Resend](https://resend.com) ; se connecter à Render et Vercel **avec GitHub**. Facultatif : Google Cloud (clé Maps). |
| Poste | Node.js 22, Git Bash, `npm ci` déjà fait dans `backend/`. |
| Outils PostgreSQL (copie des données uniquement) | **Soit** les outils clients PostgreSQL 17 : installeur Windows EDB (<https://www.postgresql.org/download/windows/>), cocher seulement « Command Line Tools », puis ajouter `C:\Program Files\PostgreSQL\17\bin` au `PATH` et vérifier `pg_dump --version`. **Soit** Docker Desktop : les scripts utilisent alors l'image `postgres:17` avec `PG_TOOLS=docker` (rien à installer d'autre). La version de `pg_dump` doit être supérieure ou égale à celle du serveur Supabase (17 couvre les projets actuels). |

### Valeurs à remplacer dans le dépôt

| Fichier | Valeur | Remplacer par |
| --- | --- | --- |
| `vercel.json` (2 occurrences) | `https://afrikabnb-api.onrender.com` | L'URL réelle du service Render (étape 3), si elle diffère (Render ajoute un suffixe quand le nom est déjà pris). |
| `src/pages/legal/*.jsx` | `[À COMPLÉTER]` | Vos coordonnées d'éditeur et les téléphones des hébergeurs. |
| `src/pages/legal/Confidentialite.jsx`, `MentionsLegales.jsx` | Paragraphes précédés du commentaire `APRÈS MIGRATION` | À retirer une fois la base UE en service (étape 7). |

Les variables des plateformes notées `<À_REMPLACER_…>` ci-dessous sont à saisir dans leurs interfaces.

## 1. Supabase en région UE

### 1.1 Créer le projet

1. Supabase → **New project**.
2. Région : **Central EU (Frankfurt)** (`eu-central-1`) — même ville que l'API Render, latence
   minimale — ou **West EU (Paris)** (`eu-west-3`).
3. Mot de passe de la base : généré par Supabase, conservé dans un gestionnaire de mots de passe.

### 1.2 Récupérer les URL de connexion

Supabase → bouton **Connect** → onglet **ORMs / URI**. Remplacer `[YOUR-PASSWORD]` par le mot de
passe, **encodé** s'il contient des caractères spéciaux (`@` → `%40`, `:` → `%3A`, `/` → `%2F`,
`?` → `%3F`, `#` → `%23`, `%` → `%25`).

| Variable | Source | Suffixe à ajouter |
| --- | --- | --- |
| `DATABASE_URL` | **Transaction pooler**, port **6543** | `?pgbouncer=true&connection_limit=1&sslmode=require` |
| `DIRECT_URL` | **Session pooler**, port **5432** (compatible IPv4) | `?sslmode=require` |

Forme : `postgresql://postgres.<ref>:<mot-de-passe-encodé>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?…`

### 1.3 Créer les tables (migrations)

Dans Git Bash (garder ce terminal ouvert jusqu’à la fin de l’étape 1) :

```bash
cd backend
read -rs NEW_DATABASE_URL && export NEW_DATABASE_URL   # coller la DIRECT_URL (5432), puis Entrée
DATABASE_URL="$NEW_DATABASE_URL" DIRECT_URL="$NEW_DATABASE_URL" npx prisma migrate deploy
```

Les variables du shell priment sur `backend/.env` : l'ancienne base n'est pas touchée. Les
migrations créent aussi l'extension `unaccent` (recherche « Lome » → « Lomé ») et activent la
Row Level Security sur toutes les tables (rien n'est exposé par l'API REST publique de Supabase).

### 1.4 Bucket des photos

Supabase → **Project Settings → API** (ou **API Keys**) : noter la **Project URL** et la clé
**service_role** (ou une clé secrète `sb_secret_…`).

```bash
export SUPABASE_URL="https://<ref-nouveau-projet>.supabase.co"
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
node scripts/setup-storage.mjs                  # crée le bucket public « listing-images » (relançable)
```

Si vous copiez les données de l'ancien projet (option A de l'étape 1.5), copier d'abord ses photos :

```bash
export OLD_SUPABASE_URL="https://<ref-ancien-projet>.supabase.co"
read -rs OLD_SUPABASE_SERVICE_ROLE_KEY && export OLD_SUPABASE_SERVICE_ROLE_KEY
node scripts/setup-storage.mjs --copy-from-old   # fichiers déjà présents ignorés (relançable)
```

Garder ce terminal ouvert pour l'étape 1.5 : `SUPABASE_URL` et `OLD_SUPABASE_URL` y servent à
réécrire les URL des photos vers le nouveau projet.

### 1.5 Les données : copie depuis l'ancienne base **ou** jeu de démonstration

**Option A — copier les données de l'ancien projet (us-west-2)** avec
`backend/scripts/migrate-db-to-eu.mjs` (export `pg_dump --data-only`, import `psql` en une seule
transaction, comptes comparés table par table) :

```bash
read -rs OLD_DATABASE_URL && export OLD_DATABASE_URL   # ancien projet : Session pooler 5432 + ?sslmode=require
# NEW_DATABASE_URL (1.3), SUPABASE_URL et OLD_SUPABASE_URL (1.4) déjà exportées :
# les URL des photos sont alors réécrites vers le nouveau projet après la copie.
# Sans outils PostgreSQL installés : export PG_TOOLS=docker

node scripts/migrate-db-to-eu.mjs check   # lecture seule : comptes, migrations, unaccent, RLS
node scripts/migrate-db-to-eu.mjs copy    # copie (refusée si la nouvelle base contient déjà des données)
```

- Les sessions (`RefreshToken`) et les liens de réinitialisation (`PasswordResetToken`) ne sont
  volontairement **pas** copiés : chacun se reconnecte une fois.
- Le fichier d'export (données personnelles) est créé dans un dossier temporaire et supprimé à la fin.
- En cas d'échec de l'import, rien n'est écrit (transaction annulée) : corriger puis relancer `copy`.

**Option B — partir du jeu de démonstration** (base vide + annonces de démo) :

```bash
read -rs SEED_ADMIN_PASSWORD && export SEED_ADMIN_PASSWORD   # 12 caractères minimum (facultatif : compte admin)
DATABASE_URL="$NEW_DATABASE_URL" DIRECT_URL="$NEW_DATABASE_URL" npm run db:seed
```

Le seed crée des comptes de démonstration au mot de passe public `demo1234` : acceptable pour une
démo, à supprimer ou changer pour un service réel.

Fermer ensuite le terminal (les variables disparaissent avec lui).

### 1.6 Vérifications dans Supabase

- **Table Editor** : les tables affichent « RLS enabled ».
- **Advisors → Security Advisor** : pas d'alerte critique sur les tables de l'application.
- **Storage** : bucket `listing-images` marqué *Public*.

## 2. Resend (e-mails)

1. Resend → **Domains → Add domain** (domaine que vous possédez) et ajouter chez votre registrar
   les enregistrements DNS indiqués (SPF, DKIM). Sans domaine : l'adresse de test
   `onboarding@resend.dev` n'envoie **qu'à l'adresse de votre compte Resend** (suffisant pour les
   tests de fumée, pas pour de vrais utilisateurs).
2. Resend → **API Keys → Create** : permission *Sending access*, limitée au domaine. La clé
   (`re_…`) n'est affichée qu'une fois : la saisir directement dans Render (étape 3).
3. `EMAIL_FROM` : `AfrikaBnB <no-reply@votre-domaine>` (ou `AfrikaBnB <onboarding@resend.dev>` en test).

## 3. Render (API)

1. Render → **New → Blueprint** → choisir le dépôt GitHub → Render lit `render.yaml` et propose le
   service `afrikabnb-api` (Docker, `backend/`, Francfort, offre gratuite, health check `/health`).
2. Render demande les variables marquées `sync: false` : les saisir (tableau ci-dessous).
   Le frontend n'existe pas encore : pour `CORS_ORIGIN` et `APP_URL`, mettre l'URL Vercel prévue,
   `https://<nom-du-projet-vercel>.vercel.app` (corrigée à l'étape 5 si besoin).
3. **Apply**. Le premier build prend quelques minutes ; au démarrage, le conteneur exécute
   `prisma migrate deploy` (sans effet si l'étape 1.3 est faite) puis lance l'API.
4. Noter l'URL du service (ex. `https://afrikabnb-api.onrender.com`) et vérifier
   `https://<url-render>/health` → `{"status":"ok","service":"afrikabnb-api"}`.
5. Logs (**Logs** dans Render) : aucune ligne `[config] ERREUR`. Un `AVERTISSEMENT` sur Resend
   signifie que `RESEND_API_KEY` manque.

Offre gratuite : le service **s'endort après ~15 min sans trafic** ; la requête suivante attend
le réveil (~50 s, parfois plus). Le frontend affiche alors son squelette de chargement, et relance
automatiquement les lectures (GET) refusées par la passerelle (502/503/504) deux fois, après 4 s
puis 8 s. Pour éviter l'attente : passer à une offre payante, ou appeler `/health` régulièrement
avec un service de surveillance externe (consomme les 750 h gratuites mensuelles, suffisantes pour
un seul service).

## 4. Vercel (frontend)

1. Si l'URL Render diffère de `https://afrikabnb-api.onrender.com` : la remplacer dans
   `vercel.json` (2 occurrences), commiter et pousser.
2. Vercel → **Add New → Project** → importer le dépôt. `vercel.json` fixe déjà : `npm ci`,
   `npm run build`, dossier `build`. Laisser **Root Directory** à la racine du dépôt.
3. Variables d'environnement Vercel : **ne pas** définir `VITE_API_URL`. Facultatif :
   `VITE_GOOGLE_MAPS_API_KEY` (clé publique de navigateur ; dans Google Cloud, la restreindre aux
   référents `https://<projet>.vercel.app/*` et aux API Maps JavaScript + Places).
4. **Deploy**, puis ouvrir `https://<projet>.vercel.app/health` : la réponse doit venir de l'API
   (même JSON qu'à l'étape 3.4) — preuve que la réécriture fonctionne.

`vercel.json` ajoute aussi : réécriture SPA vers `index.html` (sauf `/api/`, `/assets/`,
`/images/` ; les fichiers existants comme `/sw.js`, `/manifest.webmanifest` et les icônes sont
servis tels quels), en-têtes de sécurité (CSP, HSTS, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`, `frame-ancestors 'none'`), cache d'un an sur `/assets/*` (noms de fichiers
versionnés) et `no-cache` sur `index.html`, `sw.js` et `registerSW.js`.

## 5. Render : finaliser CORS et liens des e-mails

Render → service `afrikabnb-api` → **Environment** :

- `CORS_ORIGIN` = `https://<projet>.vercel.app` (exactement l'origine : `https`, sans `/` final ;
  plusieurs origines séparées par des virgules, ex. un domaine personnalisé).
- `APP_URL` = la même URL (liens des e-mails de réinitialisation et de réservation).

**Save, rebuild and deploy** (ou **Manual Deploy**).

## 6. Tests de fumée (sur l'URL Vercel)

1. Page d'accueil : les annonces de la base s'affichent (pas le bandeau « données de démonstration »).
2. **Inscription** d'un nouveau compte → connecté.
3. **Recharger la page** (F5) : toujours connecté (le cookie `afrikabnb_rt` est bien envoyé ;
   outils de développement → Application → Cookies : `HttpOnly`, `Secure`, `SameSite=Strict`, chemin `/api/auth`).
4. **Réservation** d'un logement (avec et sans compte) → e-mail de suivi reçu.
5. **Photo** : en tant qu'hôte, ajouter une photo à une annonce → elle s'affiche ; son URL commence
   par `https://<ref-nouveau-projet>.supabase.co/storage/v1/object/public/listing-images/`.
6. **Mot de passe oublié** → e-mail reçu, le lien ouvre `https://<projet>.vercel.app/…` et permet
   de changer le mot de passe.
7. Console du navigateur : aucune erreur « Content Security Policy ».

## 7. Rotation et nettoyage

1. **JWT_SECRET** : Render l'a généré (`generateValue`), il est neuf. Pour le changer plus tard :
   Render → Environment → modifier (sortie de `openssl rand -base64 48`), puis redéployer
   (les jetons d'accès en cours deviennent invalides, les sessions se renouvellent).
2. **Mot de passe admin** (si un compte ADMIN a été copié ou créé) : sur votre poste,
   ```bash
   cd backend
   read -rs DATABASE_URL && export DATABASE_URL   # DIRECT_URL de la nouvelle base (5432)
   node scripts/rotate-admin-password.mjs admin@afrikabnb.com
   ```
   Le nouveau mot de passe est écrit dans `backend/.env` (`SEED_ADMIN_PASSWORD`), jamais affiché.
3. **Ancienne base** (us-west-2) : Supabase → ancien projet → Project Settings → Database →
   **Reset database password** (l'ancien mot de passe est dans d'anciens fichiers `.env`), puis
   régénérer ses clés API. Une fois la nouvelle base validée, mettre l'ancien projet en pause ou le supprimer.
4. **Pages légales** : retirer les paragraphes marqués `APRÈS MIGRATION` dans
   `src/pages/legal/Confidentialite.jsx` et `MentionsLegales.jsx`, compléter les `[À COMPLÉTER]`.
5. `backend/.env` local : le garder pour le développement (base locale ou ancienne base), ne
   jamais y mettre la clé de la nouvelle base si le poste est partagé.

## 8. Paiement Mobile Money : CinetPay (facultatif)

Désactivé par défaut (`PAYMENTS_ENABLED=false` dans `render.yaml`) : l'application fonctionne
exactement comme avant (aucun bouton, aucun paiement demandé). Pour l'activer :

1. **Compte marchand** : créer un compte sur [cinetpay.com](https://cinetpay.com) (pays du compte :
   Togo → devise **XOF** ; CinetPay n'encaisse que dans la devise locale du compte), puis souscrire
   un **service** (c'est lui qui fournit le `site_id`).
2. **Clés** : back-office CinetPay → menu **Intégrations** : `apikey` → `CINETPAY_API_KEY`,
   `site_id` → `CINETPAY_SITE_ID`, **Secret Key** → `CINETPAY_SECRET_KEY` (elle sert à vérifier
   l'en-tête `x-token` HMAC-SHA256 de chaque notification). Render → Environment ; ne jamais les
   mettre dans Vercel ni dans une variable `VITE_*`.
3. **Mode test** : la documentation CinetPay indique que les *sandbox* sont « momentanément
   indisponibles » et que la même `apikey` / le même `site_id` servent au test et à la production
   (un service ou un compte distinct peut être créé pour la production). Tester avec de **petits
   montants réels** (minimum 150 XOF au Togo, 100 XOF ailleurs ; maximum 1 500 000 XOF) puis
   rembourser depuis le back-office ; en local et en CI, utiliser `PAYMENT_PROVIDER=fake` (page de
   paiement simulée, refusée en production).
4. **URL de notification** : l'API envoie à chaque paiement
   `notify_url = ${API_PUBLIC_URL}/api/payments/cinetpay/notify` et
   `return_url = ${API_PUBLIC_URL}/api/payments/return?tx=…`.
   **Choix retenu : l'URL Vercel** (`API_PUBLIC_URL` vide = `APP_URL`, soit
   `https://<projet>.vercel.app/api/payments/cinetpay/notify`, transmise à Render par la réécriture
   `/api/*` de `vercel.json`) : domaine stable (identique si Render change d'URL), HTTPS, même
   origine que le site pour le retour du navigateur. Alternative : l'URL Render directe
   (`API_PUBLIC_URL=https://afrikabnb-api.onrender.com`), un intermédiaire de moins mais une URL
   liée à l'hébergeur. Si le back-office demande une URL de notification, y saisir la même.
   Elle doit répondre `200` en `GET` (test de disponibilité de CinetPay) : vérifier avec
   `curl -i https://<projet>.vercel.app/api/payments/cinetpay/notify`.
5. Render → `PAYMENTS_ENABLED=true` (`PAYMENT_PROVIDER=cinetpay`), redéployer. L'API refuse de
   démarrer s'il manque une clé. **La migration `20261023000000_payments` doit être appliquée**
   (le conteneur exécute `prisma migrate deploy` au démarrage).
6. **Test de bout en bout** : réservation instantanée connectée → « Payer avec Mobile Money » →
   paiement sur le guichet CinetPay → retour sur `/paiement/retour` : « Paiement reçu » ; dans le
   profil, badge « Payée » ; e-mails « Paiement reçu » au voyageur et à l'hôte.

Fonctionnement et limites :

- Le statut n'est **jamais** déduit de la notification ni du retour navigateur : l'API vérifie le
  `x-token` (comparaison à temps constant), puis interroge toujours `POST /v2/payment/check`, et
  contrôle `site_id`, montant et devise avant de marquer la réservation payée.
- **Offre gratuite Render** : l'API s'endort après ~15 min ; une notification reçue au réveil
  (~50 s) peut expirer côté CinetPay. Sans conséquence grave : la notification peut être renvoyée,
  et la page de retour redemande le statut à CinetPay (au plus toutes les 10 s). Un plan payant
  évite ce délai.
- **Remboursements** : manuels. Une réservation payée puis annulée (ou un paiement reçu après
  annulation / échéance) passe en « remboursement en cours » ; les administrateurs reçoivent un
  e-mail. Rembourser depuis le back-office CinetPay (ou par transfert Mobile Money), puis
  **Administration → Remboursements → Marquer remboursé**.
- Délais : `PAYMENT_DUE_MINUTES_INSTANT` (défaut 30) et `PAYMENT_DUE_HOURS_REQUEST` (défaut 24) ;
  passé ce délai, les dates de la réservation non payée sont libérées immédiatement. Elle est
  annulée en base (e-mails) après un délai de grâce de 15 min, par la réconciliation périodique
  (toutes les 3 min) ou à la lecture des listes voyageur / hôte, **après une dernière vérification**
  de son paiement en cours auprès de CinetPay (prestataire injoignable : pas d'annulation, nouvel essai).
- **Notifications** : l'API répond `200` une fois la notification traitée, `503` si la vérification
  auprès de CinetPay échoue (CinetPay la renvoie). La réconciliation périodique revérifie aussi les
  paiements en attente depuis plus de 2 min (notification perdue).
- **Désactiver les paiements** (`PAYMENTS_ENABLED=false`) : une réservation encore `UNPAID` redevient
  une réservation confirmée ordinaire (plus d'échéance). Avant de désactiver, solder ces réservations :
  attendre que la réconciliation les ait traitées (échéance + 15 min), puis vérifier dans le SQL
  Editor qu'il n'en reste aucune :
  `select id, "paymentDueAt" from "Booking" where status = 'CONFIRMED' and "paymentStatus" = 'UNPAID';`
  (les annuler depuis l'application, ou les laisser confirmées en connaissance de cause). Traiter
  aussi les remboursements en attente (Administration → Remboursements).
- Pages légales : CinetPay figure comme prestataire (Confidentialité, CGU, Cookies) ; faire relire
  la politique d'annulation / remboursement avant toute exploitation commerciale.

## Variables par service

### Render (`afrikabnb-api`)

| Variable | Valeur | Où la trouver |
| --- | --- | --- |
| `NODE_ENV` | `production` | `render.yaml` |
| `TRUST_PROXY` | `2` | `render.yaml` (voir ci-dessous) |
| `COOKIE_SECURE` | `true` | `render.yaml` |
| `STORAGE_DRIVER` / `SUPABASE_STORAGE_BUCKET` | `supabase` / `listing-images` | `render.yaml` |
| `EMAIL_DRIVER` | `resend` | `render.yaml` |
| `JWT_ACCESS_TTL` / `REFRESH_TTL_DAYS` | `15m` / `30` | `render.yaml` |
| `JWT_SECRET` | généré par Render | — |
| `PORT` | injecté par Render | — (lu par `src/config/env.js`) |
| `DATABASE_URL` | `<À_REMPLACER_TRANSACTION_POOLER_6543>` | Supabase → Connect (étape 1.2) |
| `DIRECT_URL` | `<À_REMPLACER_SESSION_POOLER_5432>` | Supabase → Connect (étape 1.2) |
| `SUPABASE_URL` | `<À_REMPLACER_https://ref.supabase.co>` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `<À_REMPLACER_CLE_SERVICE_ROLE>` | Supabase → Project Settings → API (secret) |
| `RESEND_API_KEY` | `<À_REMPLACER_re_…>` | Resend → API Keys |
| `EMAIL_FROM` | `<À_REMPLACER_AfrikaBnB <no-reply@domaine>>` | Domaine vérifié dans Resend |
| `CORS_ORIGIN` | `<À_REMPLACER_https://projet.vercel.app>` | Vercel → Project → Domains |
| `APP_URL` | idem `CORS_ORIGIN` | Vercel → Project → Domains |
| `PAYMENTS_ENABLED` / `PAYMENT_PROVIDER` | `false` / `cinetpay` | `render.yaml` (étape 8 pour activer) |
| `PAYMENT_DUE_MINUTES_INSTANT` / `PAYMENT_DUE_HOURS_REQUEST` | `30` / `24` | `render.yaml` |
| `CINETPAY_API_KEY` / `CINETPAY_SITE_ID` / `CINETPAY_SECRET_KEY` | `<À_REMPLACER>` | CinetPay → Intégrations (secrets) |
| `API_PUBLIC_URL` | vide (= `APP_URL`) | étape 8 (URL de notification) |

**TRUST_PROXY = 2** : la requête traverse la réécriture Vercel puis le répartiteur de Render.
Vercel remplace `X-Forwarded-For` par l'IP du visiteur, Render y ajoute l'IP de Vercel : avec 2,
l'API retient l'IP du visiteur pour ses limites de débit (avec 1, tous les visiteurs partageraient
l'IP de Vercel et les limites se déclencheraient pour tout le monde à la fois). Limite connue :
quelqu'un qui appelle directement `https://<url-render>` peut falsifier cet en-tête et contourner
les limites par IP ; acceptable pour une démo.

### Vercel

| Variable | Valeur |
| --- | --- |
| `VITE_API_URL` | **ne pas définir** |
| `VITE_GOOGLE_MAPS_API_KEY` | facultatif, clé de navigateur restreinte par référent |

### Supabase

Aucune variable : le projet fournit les valeurs ci-dessus. La clé publique `anon` n'est pas utilisée.

## Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| Erreur CORS dans la console, ou 403/500 sur `/api` | `CORS_ORIGIN` ne correspond pas exactement à l'origine (`http` au lieu de `https`, `/` final, domaine personnalisé oublié). | Corriger `CORS_ORIGIN` dans Render et redéployer. Avec la réécriture Vercel, le navigateur appelle la même origine : une erreur CORS signale souvent un `VITE_API_URL` défini par erreur. |
| Déconnecté à chaque rechargement | Cookie absent : frontend et API sur des origines différentes (`VITE_API_URL` défini dans Vercel, ou site ouvert sur une autre URL que celle de `CORS_ORIGIN`). | Supprimer `VITE_API_URL` dans Vercel et redéployer ; ouvrir le site via son URL Vercel. Vérifier le cookie `afrikabnb_rt` (étape 6.3). |
| 502 / 504 sur `/api/…` ou `/health` après une période d'inactivité | Render se réveille (offre gratuite). | Patienter ~1 min puis recharger ; le frontend relance déjà les lectures. Persistant : vérifier les logs Render (crash au démarrage). |
| Le service Render redémarre en boucle, log `[config] ERREUR` | Variable obligatoire manquante ou invalide (`DATABASE_URL`, `DIRECT_URL`, `CORS_ORIGIN`, `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). | Le message indique la variable ; corriger dans Environment. |
| Échec de `prisma migrate deploy` au démarrage | `DIRECT_URL` absente, mot de passe non encodé, ou port 6543 utilisé pour `DIRECT_URL`. | `DIRECT_URL` = Session pooler 5432 + `?sslmode=require`, mot de passe encodé. Migration marquée en échec : `npx prisma migrate status` puis `npx prisma migrate resolve` (voir la doc Prisma) depuis le poste. |
| `prepared statement "s0" already exists` | `DATABASE_URL` (6543) sans `pgbouncer=true`. | Ajouter `?pgbouncer=true&connection_limit=1&sslmode=require`. |
| `migrate-db-to-eu.mjs` : `pg_dump introuvable` | Outils PostgreSQL absents du `PATH`. | Installer les outils clients (étape 0) ou `export PG_TOOLS=docker`. |
| `pg_dump: error: aborting because of server version mismatch` | `pg_dump` plus ancien que le serveur. | Outils PostgreSQL 17 ou `PG_IMAGE=postgres:17` (défaut). |
| Connexion impossible depuis Docker ou le poste | Connexion directe `db.<ref>.supabase.co` uniquement en IPv6. | Utiliser le **Session pooler** (IPv4). |
| Photos cassées après la migration | Fichiers non copiés, ou URL encore vers l'ancien projet. | `setup-storage.mjs --copy-from-old`, puis vérifier les URL (étape 6.5). |
| Carte Google ou polices absentes, erreur CSP dans la console | Domaine bloqué par la `Content-Security-Policy` de `vercel.json`. | Ajouter le domaine signalé à la directive concernée. Le script en ligne de `index.html` (thème) est autorisé par son empreinte `sha256-…` : si vous le modifiez, recalculer l'empreinte et la remplacer dans `vercel.json`. |
| Page blanche ou ancienne version après un déploiement | Ancien service worker en cache. | Recharger deux fois ; `sw.js` est servi en `no-cache`, la mise à jour est automatique. |
| Render ne trouve pas le Dockerfile | Chemins du Blueprint. | Service → Settings : Root Directory `backend`, Dockerfile Path `./Dockerfile`, Docker Context `.`. |
| E-mails non reçus | Clé Resend absente, domaine non vérifié, ou adresse de test `onboarding@resend.dev` vers un autre destinataire. | Logs Render + Resend → Emails / Logs. |
