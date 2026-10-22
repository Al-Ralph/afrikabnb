# AfrikaBnB — Design system « Lagune »

Direction artistique de la vague 2. Ce document est la référence : toute nouvelle
interface prend ses valeurs dans les jetons de `src/index.css`, jamais en dur.

## 1. Idée

**La lagune de Lomé vue du ciel.** La photo d'accueil (vue aérienne de Lomé : la lagune
serpente vers la plage du golfe de Guinée) donne toute la palette : vert lagune profond,
vert clair des eaux peu profondes, sable, et une touche de latérite (la terre rouge des
pistes) réservée aux notes et aux favoris.

- Afrique contemporaine, **sans motif « tribal »** ni wax en décor : l'identité passe par
  la photographie réelle, la couleur et une typographie à caractère.
- Sobre et premium : peu d'ornements, de la taille, des aplats, des photos grandes.
- Mode d'usage : l'accueil persuade (photo plein cadre), le reste de l'app sert une tâche
  (chercher, réserver, gérer) : précision et lisibilité avant l'effet.

## 2. Couleurs (jetons sémantiques)

| Jeton | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| `--color-bg` | `#f3f4f0` | `#0d1210` | fond de page |
| `--color-surface` | `#ffffff` | `#141b18` | panneaux, cartes, champs |
| `--color-surface-2` | `#e9ece6` | `#1b2420` | survols, zones tonales |
| `--color-surface-3` | `#dde2da` | `#243029` | étoiles vides, images absentes |
| `--color-text` | `#121a17` | `#e8ede9` | texte courant (16:1) |
| `--color-text-muted` | `#4e5a54` | `#a9b4ae` | texte secondaire (≥ 6,5:1) |
| `--color-text-subtle` | `#5f6b65` | `#8c9892` | placeholders, indices (≥ 5:1) |
| `--color-border` | `#d5dad3` | `#26312c` | séparateurs discrets |
| `--color-border-strong` | `#7f8a84` | `#6b7973` | contours de champs (≥ 3:1) |
| `--color-primary` | `#0b5d46` | `#4fbf93` | action principale, liens, focus |
| `--color-on-primary` | `#ffffff` | `#04251a` | texte sur primaire (7,9:1 / 7,2:1) |
| `--color-primary-soft` | `#dcebe3` | `#183a2d` | sélection, pastilles, états vides |
| `--color-accent-warm` | `#b5461e` | `#e98a62` | latérite : étoiles, cœur favori |
| `--color-success-*`, `--color-warning-*`, `--color-danger*` | | | statuts, alertes |

Règles :
- **Un fond, une encre, un accent.** Le vert lagune ne sert qu'aux actions et à l'état
  actif ; la latérite qu'aux notes et favoris.
- Le texte courant est dans l'encre pleine ; le gris (`muted`) est réservé au secondaire.
- Les surfaces se séparent par un **pas de ton**, pas par une bordure + ombre.
- Sur la photo d'accueil, les couleurs sont fixes (texte `#f5f7f3`, bouton `#0b5d46`)
  dans les deux thèmes, sous un voile neutre qui garantit le contraste.
- Le pied de page est un aplat « lagune de nuit » (`#0f2a22`) dans les deux thèmes.
- Contrastes vérifiés AA (texte ≥ 4,5:1, composants ≥ 3:1) dans les deux thèmes.

> Note marque : l'ancien corail `#d93a40` (icônes PWA, `theme-color`) n'est plus la
> couleur principale. La couleur de marque devient `#0b5d46` (fond clair associé `#dcebe3`).

## 3. Thème sombre

- Par défaut : `prefers-color-scheme`. Bouton dans le header : **Clair / Sombre / Système**.
- Le choix est mémorisé dans `localStorage["afrikabnb_theme"]` (`light` | `dark`, absent =
  système), lectures/écritures protégées par try/catch.
- **Pas de flash** : un script inline dans `index.html` pose `data-theme` sur `<html>`
  avant le premier rendu. Les jetons sombres sont déclarés sous
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` et sous
  `:root[data-theme="dark"]`.
- Composant : `src/components/ThemeToggle.jsx` (testé dans `ThemeToggle.test.jsx`).

## 4. Typographie

| Rôle | Police (après consentement) | Repli système (sans consentement) |
| --- | --- | --- |
| Titres `--font-display` | **Bricolage Grotesque** 500–800 (axe optique) | Segoe UI Variable Display, SF Pro (-apple-system), Helvetica Neue |
| Texte `--font-sans` | **Instrument Sans** 400–700 | Segoe UI Variable Text, SF Pro, Helvetica Neue, Arial |

- Google Fonts n'est chargé **qu'après consentement** (`ConsentContext`, inchangé dans
  son principe). Sans consentement, la pile système ci-dessus prend le relais.
- Échelle : `--text-xs` 13 px, `sm` 14, `base` 16, `md` 18, `lg` 22, `xl` 24→30,
  `2xl` 30→44, titre d'accueil 40→68 px.
- Titres : approche −0,015 à −0,03 em, interligne 1,02–1,1, `text-wrap: balance`.
  Texte : 16 px mini, interligne 1,55, 65–75 caractères par ligne.
- Chiffres (prix, dates, notes) en `tabular-nums`.
- Pas de petites capitales espacées ni de surtitre au-dessus des titres.

## 5. Espacements, rayons, ombres

- Échelle 4 px : `--space-1` 4 → `--space-9` 96. Gouttière `--gutter` 16→40 px,
  largeur max `--page-max` 1320 px. Écart entre sections ≥ 96 px sur desktop.
- Rayons : contrôles **en pilule** (`--radius-pill`), champs 10 px (`--radius-sm`),
  cartes et photos 16 px (`--radius-md`), panneaux flottants 20 px (`--radius-lg`).
- Ombres **uniquement pour ce qui flotte** : menus, dialogues, barre de recherche sur la
  photo, widget de réservation collant (`--shadow-md`, `--shadow-lg`). Rien au repos.

## 6. Mouvement

- Durées `--dur-fast` 120 ms, `--dur` 200 ms, `--dur-slow` 360 ms ;
  courbe `--ease-out` = `cubic-bezier(0.16, 1, 0.3, 1)`.
- Moment signature : la photo d'accueil se pose (échelle 1,06 → 1 en 1,8 s) pendant que
  titre, texte et actions montent en cascade (80 ms).
- Grille d'annonces : apparition en cascade (45 ms par carte, plafonnée).
- Retour d'interaction : zoom doux des photos au survol, pression des boutons (0,98),
  cœur favori qui « bat » une fois.
- `prefers-reduced-motion: reduce` coupe animations, transitions et le reflet des squelettes.

## 7. Composants

- **Boutons** : `.btn` + `.btn--primary` (vert plein), `.btn--secondary` (contour fort),
  `.btn--ghost`. Hauteur ≥ 44 px. Les classes historiques (`host-btn`, `account-btn`…)
  suivent la même grammaire.
- **Champs** : contour `--color-border-strong`, rayon 10 px, focus = contour primaire
  + halo 1 px ; erreurs en `--color-danger` avec message texte.
- **Focus** : anneau 2 px `--color-focus`, décalé de 2 px, partout (`:focus-visible`).
- **Cartes d'annonce** : photo 4:3 arrondie, pas de boîte ni d'ombre ; lieu en titre,
  note avec étoile SVG, prix en gras tabulaire.
- **Squelettes** (`Skeleton.jsx`) : `ListingGridSkeleton`, `ListSkeleton`,
  `PropertySkeleton`, `ProfileSkeleton`. Un seul `role="status"` avec texte masqué
  (`.sr-only`), formes `aria-hidden`.
- **États vides** (`EmptyState.jsx`) : pastille tonale + pictogramme au trait, titre,
  texte, action. Variante `compact`, ton `danger` pour les erreurs.
- **Icônes** (`Icons.jsx`, `CategoryIcons.jsx`) : SVG au trait 1,75, viewBox 24, bouts
  ronds. Aucune icône en caractère Unicode ou emoji.

## 8. Do / Don't

| Faire | Ne pas faire |
| --- | --- |
| Prendre les couleurs dans les jetons | Écrire un hexadécimal dans un composant |
| Une action principale verte par écran | Multiplier les boutons pleins |
| Photo réelle, grande, créditée | Motifs « africains » décoratifs, clichés |
| Séparer par le ton ou l'espace | Bordure + ombre sur une même carte |
| Titres qui tiennent en 2 lignes | Mot coloré/italique dans un titre |
| Squelette de la forme du contenu | Spinner + « Chargement… » |
| Tester les deux thèmes | Contraste vérifié en clair seulement |

## 9. Photo d'accueil et crédit

- « Lomé view » par **Edouard TAMBA**, Unsplash —
  <https://unsplash.com/photos/QpPBoQw9O3U> — licence Unsplash (usage libre, crédit
  apprécié). Crédit discret affiché sur la photo (« Photo Edouard TAMBA / Unsplash »).
- Fichiers : `public/images/hero-lome-1600.webp` (≈ 155 Ko) et
  `public/images/hero-lome-800.webp` (≈ 37 Ko), WebP générés avec ffmpeg depuis
  `images.unsplash.com/photo-1507975840173-2ea123318205`.
- Chargement : `srcset`/`sizes`, `fetchpriority="high"`, préchargement dans `index.html`.
  Repli : aplat vert lagune si l'image ne charge pas ; voile neutre pour la lisibilité.

## 10. Textes de l'interface (i18n)

Les textes ajoutés par la refonte vivent dans `src/context/translations.design.js`
(espace de noms `ui.*`, 5 langues). `LanguageContext` les fusionne en profondeur avec
`translations.js` au chargement (`mergeTranslations`) ; en cas de collision,
`translations.js` garde la priorité. Un test vérifie que les 5 langues ont les mêmes clés.
