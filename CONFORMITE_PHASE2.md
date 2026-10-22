# Livrable Phase 2 — Conformité légale AfrikaBnB

Date : 19 octobre 2026 — mis à jour le 21 octobre 2026 (voir « Mise à jour du 21/10/2026 »)  
Cas : marketplace location **démo**, auto-entrepreneur solo (CA ≈ 0), pas d’hébergeur prod → champs **[À COMPLÉTER]** dans les pages.

---

## Fichiers créés

| Fichier | Rôle |
|---------|------|
| `src/context/ConsentContext.js` | Consentement cookies (max 6 mois), chargement conditionnel Google Fonts |
| `src/components/CookieBanner.js` + `.css` | Bandeau « Tout refuser » / « Tout accepter » (parité visuelle) |
| `src/pages/legal/MentionsLegales.js` | Mentions LCEN |
| `src/pages/legal/Confidentialite.js` | Privacy calée sur traitements réels |
| `src/pages/legal/Cookies.js` | Inventaire + « Gérer mes cookies » |
| `src/pages/legal/CGU.js` | CGU (sans CGV vente) |
| `src/pages/legal/LegalPage.css` | Style pages légales |
| `public/llms.txt` | Orientation crawlers / agents IA |
| `CONFORMITE_PHASE2.md` | Ce livrable |

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `src/App.js` | Routes `/mentions-legales`, `/confidentialite`, `/cookies`, `/cgu` + CookieBanner |
| `src/index.js` | `ConsentProvider` |
| `src/hooks/useGoogleMapsScript.js` | Blocage Maps sans consentement |
| `src/components/Footer.js` + `.css` | Footer unifié (légal, sans AirCover) |
| `src/components/AuthModal.js` + `.css` | Finalité + lien privacy ; case CGU non pré-cochée |
| `src/components/Header.js` | aria-label logo / nav |
| `src/components/PropertyCard.js` + `.css` | Notes marquées « démo » |
| `src/pages/PropertyDetails.js` + `.css` | Idem |
| `src/context/translations.js` | Footer / auth / cookies / ratings (5 langues) |
| `public/index.html` | Meta, `lang=fr`, JSON-LD Organization, Fonts retirées du HTML |
| `public/robots.txt` | Allow pages légales |

---

## Résumé points 1–13

1. **Mentions légales LCEN** — page + liens footer. Identité / SIRET / hébergeur = `[À COMPLÉTER]`.
2. **Privacy** — inventaire basé sur le code au 19/10 (comptes, JWT, langue, recherche mémoire, Fonts, Maps, Nominatim, Unsplash). Complété le 22/10 : profil, réservations, avis, favoris et annonces des hôtes figurent dans `Confidentialite.js` (finalité, base légale, conservation).
3. **Cookies** — inventaire + bandeau (Tout refuser / Tout accepter à même niveau) + blocage Fonts & Maps avant consentement + « Gérer mes cookies » + page `/cookies` + durée max 6 mois. Alternative self-host fonts documentée (non implémentée).
4. **CGV** — **pas** de CGV vente opérationnelles (confirmé dans CGU).
5. **CGU** + case inscription **non pré-cochée** dans AuthModal.
6. **Médiateur** — uniquement dans « À FAIRE HUMAIN » ci-dessous (pas sur le site).
7. **AuthModal** — finalité du traitement + lien vers confidentialité.
8. **Scripts tiers** — voir tableau ci-dessous + code conditionnel.
9. **A11y** — focus Escape / `aria-*` modal, labels header, `lang` document, textes noscript FR.
10. **llms.txt**, robots, meta description, JSON-LD Organization.
11. **Contenu** — retrait « Inc. », AirCover ; notes présentées comme indicatives démo.
12. **Footer unifié** — Explorer + Légal + copyright démo.
13. **Autres risques** — voir section risques.

### Tableau scripts / services tiers (point 8)

| Service | Où dans le code | Condition |
|---------|-----------------|-----------|
| Google Fonts | `ConsentContext.js` (injecté dynamiquement) | Consentement « accepté » |
| Google Maps JS API | `useGoogleMapsScript.js` | Consentement + `VITE_GOOGLE_MAPS_API_KEY` |
| Nominatim OSM | `backend/src/api/maps/maps.controller.js` | Appels API backend |
| Unsplash (images) | `src/data/listings.js`, seed Prisma | Chargement `<img>` (pas un script) |
| reportWebVitals | `src/index.js` | Mesures perf locales CRA — **pas** d’endpoint analytics branché |
| Bandeau d’accueil | `src/components/Hero.js` | CSS seul (scène 3D three.js retirée le 22/10) : aucune requête tierce |

---

## À FAIRE HUMAIN

- Remplir tous les `[À COMPLÉTER]` : identité, SIRET, adresse, e-mail, hébergeur prod, e-mail JSON-LD.
- Choisir et déclarer un **hébergeur** dès mise en ligne.
- Si ouverture au public avec service payant / litiges conso : désigner un **médiateur de la consommation** et l’afficher.
- Décider si auto-hébergement des polices (WOFF2) pour réduire les traceurs.
- Vérifier statut TVA / franchise en base.
- Sécuriser `JWT_SECRET` et clés Maps en production.
- Si agents IA branchés plus tard : mettre à jour privacy + consentements.
- Faire relire par un juriste les ajouts du 22/10 dans `Confidentialite.js` et `CGU.js` (réservations, avis, favoris, calcul des notes).

---

## NON applicables (+ raisons)

| Élément | Raison |
|---------|--------|
| CGV de vente / réservation | Aucun paiement ni contrat de vente dans le code : les réservations sont enregistrées sans transaction financière |
| Médiateur (affichage site) | Pas de relation consommateur payante ; reporté « À FAIRE HUMAIN » |
| Newsletter / pixels / analytics / chat / YouTube | Absents du dépôt — non inventés |
| Page Accessibilité obligatoire | Hors scope validé ; corrections a11y raisonnables seulement |
| DPO nommé | Solo CA≈0 ; contact éditeur suffit pour l’instant (à réévaluer) |

---

## Autres risques (point 13)

- JWT en `localStorage` (toujours le cas) : sensible au XSS — durcir CSP / éviter `dangerouslySetInnerHTML` ; piste : cookie `httpOnly` + refresh token.
- ~~Secret JWT par défaut dans le backend~~ — **corrigé** : plus de secret par défaut ; `JWT_SECRET` est validé au démarrage (≥ 32 caractères, refus de démarrer en production s’il est absent ou faible ; secret aléatoire temporaire en dev).
- Images Unsplash / CDN tiers : fuite IP possible même sans bandeau (contenu nécessaire aux annonces) — à documenter / éventuellement self-host.
- Nominatim : respecter usage policy (User-Agent, rate limits) en prod.
- Contenu « Airbnb-like » : risque de confusion de marque — déjà réduit (AirCover / Inc. retirés) ; rester vigilant.
- Annonces, prix et réservations sans paiement : risque de tromperie si présentés comme offre réelle — bandeau / mention démo dans le footer.
- Agents IA futurs : nouveaux traitements à cartographier avant activation.

---

## Mise à jour du 21/10/2026

Évolutions du code ayant un effet sur ce livrable :

- **Nouvelles données personnelles** : réservations (`Booking`), avis (`Review`, nom de l’auteur affiché publiquement), favoris (`Favorite`) stockés en base MySQL. Décrites dans la page Confidentialité depuis le 22/10.
- **Email des hôtes** : n’est plus exposé par l’API (les annonces ne renvoient que `id`, `name`, `avatar` de l’hôte).
- **Hero 3D** : texture des nuages servie localement le 22/10, puis scène 3D entièrement retirée le même jour (bandeau CSS) : plus aucune requête tierce.
- **Secret JWT** : plus de valeur par défaut (voir « Autres risques »).
- **Stockage du token** : inchangé, toujours en `localStorage`.
- **Pages légales (22/10)** : durée du JWT corrigée (1 jour par défaut) dans `Confidentialite.js` et `Cookies.js` ; `CGU.js` décrit la réservation sans paiement et le calcul des notes à partir des avis.

## Mise à jour du 22/10/2026

- **Base de données** : passage de MySQL à **PostgreSQL hébergé par Supabase** (sous-traitant au sens du RGPD pour l’hébergement de la base : comptes, annonces, réservations, avis, favoris). Région à choisir dans l’Union européenne ; connexions chiffrées (`sslmode=require`) ; Row Level Security activée sur les tables pour bloquer l’API REST publique de Supabase (seule l’API Express y accède).
- Supabase est déclaré comme hébergeur de la base dans `Confidentialite.js` (sections « Destinataires » et « Transferts hors UE »). **Le projet créé est en région AWS us-west-2 (Oregon, États-Unis)** : transfert hors UE.
- **À FAIRE HUMAIN** : idéalement recréer le projet Supabase en région UE (ex. West EU Paris / Central EU Frankfurt) avant toute mise en ligne publique, puis mettre à jour la page Confidentialité ; sinon vérifier et citer le mécanisme de transfert (DPA Supabase, clauses contractuelles types). Déclarer Supabase dans les mentions légales lors de la mise en ligne.
