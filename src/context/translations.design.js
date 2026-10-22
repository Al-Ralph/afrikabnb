// Textes ajoutés par la refonte visuelle (vague 2 — design).
// Fichier séparé de translations.js : il est fusionné en profondeur dans LanguageContext
// (les clés de translations.js gardent la priorité en cas de collision).
// Toutes les clés vivent sous l'espace de noms `ui.*`.

export const designTranslations = {
  fr: {
    ui: {
      theme: {
        label: "Thème d’affichage",
        light: "Clair",
        dark: "Sombre",
        system: "Système",
        current: "Thème : {mode}",
      },
      hero: {
        photoAlt: "Vue aérienne de Lomé : la lagune serpente vers la plage du golfe de Guinée.",
        place: "Lomé, Togo, vue du ciel",
        photoBy: "Photo {name} / Unsplash",
      },
      home: {
        listingsTitle: "Séjours à découvrir",
        count: { one: "{n} logement", other: "{n} logements" },
        emptyTitle: "Aucun logement trouvé",
        errorTitle: "Annonces indisponibles",
      },
      property: {
        back: "Retour aux annonces",
        about: "À propos de ce logement",
        keyFacts: "Le logement en bref",
        petsOk: "Animaux acceptés",
        petsNo: "Animaux non acceptés",
        hostRole: "Hôte sur AfrikaBnB",
        location: "Emplacement",
      },
      favorites: {
        emptyTitle: "Aucun favori pour l’instant",
        loginTitle: "Gardez vos coups de cœur",
      },
      profile: {
        loginTitle: "Connectez-vous à votre compte",
      },
      host: {
        noListingsTitle: "Aucune annonce publiée",
      },
      notFound: {
        title: "Page introuvable",
        text: "Cette page n’existe pas ou a été déplacée.",
        cta: "Retour à l’accueil",
      },
    },
  },
  en: {
    ui: {
      theme: {
        label: "Display theme",
        light: "Light",
        dark: "Dark",
        system: "System",
        current: "Theme: {mode}",
      },
      hero: {
        photoAlt: "Aerial view of Lomé: the lagoon winds towards the Gulf of Guinea beach.",
        place: "Lomé, Togo, from the sky",
        photoBy: "Photo {name} / Unsplash",
      },
      home: {
        listingsTitle: "Stays to discover",
        count: { one: "{n} stay", other: "{n} stays" },
        emptyTitle: "No stays found",
        errorTitle: "Listings unavailable",
      },
      property: {
        back: "Back to listings",
        about: "About this place",
        keyFacts: "At a glance",
        petsOk: "Pets allowed",
        petsNo: "No pets",
        hostRole: "Host on AfrikaBnB",
        location: "Location",
      },
      favorites: {
        emptyTitle: "No favourites yet",
        loginTitle: "Keep the places you love",
      },
      profile: {
        loginTitle: "Sign in to your account",
      },
      host: {
        noListingsTitle: "No listings yet",
      },
      notFound: {
        title: "Page not found",
        text: "This page does not exist or has moved.",
        cta: "Back to home",
      },
    },
  },
  es: {
    ui: {
      theme: {
        label: "Tema de visualización",
        light: "Claro",
        dark: "Oscuro",
        system: "Sistema",
        current: "Tema: {mode}",
      },
      hero: {
        photoAlt: "Vista aérea de Lomé: la laguna serpentea hacia la playa del golfo de Guinea.",
        place: "Lomé, Togo, desde el cielo",
        photoBy: "Foto {name} / Unsplash",
      },
      home: {
        listingsTitle: "Estancias por descubrir",
        count: { one: "{n} alojamiento", other: "{n} alojamientos" },
        emptyTitle: "No se encontraron alojamientos",
        errorTitle: "Anuncios no disponibles",
      },
      property: {
        back: "Volver a los anuncios",
        about: "Acerca de este alojamiento",
        keyFacts: "En resumen",
        petsOk: "Se admiten mascotas",
        petsNo: "No se admiten mascotas",
        hostRole: "Anfitrión en AfrikaBnB",
        location: "Ubicación",
      },
      favorites: {
        emptyTitle: "Aún no tienes favoritos",
        loginTitle: "Guarda tus flechazos",
      },
      profile: {
        loginTitle: "Inicia sesión en tu cuenta",
      },
      host: {
        noListingsTitle: "Ningún anuncio publicado",
      },
      notFound: {
        title: "Página no encontrada",
        text: "Esta página no existe o se ha movido.",
        cta: "Volver al inicio",
      },
    },
  },
  de: {
    ui: {
      theme: {
        label: "Darstellung",
        light: "Hell",
        dark: "Dunkel",
        system: "System",
        current: "Darstellung: {mode}",
      },
      hero: {
        photoAlt: "Luftaufnahme von Lomé: Die Lagune schlängelt sich zum Strand am Golf von Guinea.",
        place: "Lomé, Togo, von oben",
        photoBy: "Foto {name} / Unsplash",
      },
      home: {
        listingsTitle: "Unterkünfte entdecken",
        count: { one: "{n} Unterkunft", other: "{n} Unterkünfte" },
        emptyTitle: "Keine Unterkunft gefunden",
        errorTitle: "Inserate nicht verfügbar",
      },
      property: {
        back: "Zurück zu den Inseraten",
        about: "Über diese Unterkunft",
        keyFacts: "Auf einen Blick",
        petsOk: "Haustiere erlaubt",
        petsNo: "Keine Haustiere",
        hostRole: "Gastgeber auf AfrikaBnB",
        location: "Lage",
      },
      favorites: {
        emptyTitle: "Noch keine Favoriten",
        loginTitle: "Merken Sie sich Ihre Lieblingsorte",
      },
      profile: {
        loginTitle: "Melden Sie sich an",
      },
      host: {
        noListingsTitle: "Noch keine Inserate",
      },
      notFound: {
        title: "Seite nicht gefunden",
        text: "Diese Seite existiert nicht oder wurde verschoben.",
        cta: "Zur Startseite",
      },
    },
  },
  pt: {
    ui: {
      theme: {
        label: "Tema de exibição",
        light: "Claro",
        dark: "Escuro",
        system: "Sistema",
        current: "Tema: {mode}",
      },
      hero: {
        photoAlt: "Vista aérea de Lomé: a lagoa serpenteia até a praia do golfo da Guiné.",
        place: "Lomé, Togo, vista do céu",
        photoBy: "Foto {name} / Unsplash",
      },
      home: {
        listingsTitle: "Estadias para descobrir",
        count: { one: "{n} acomodação", other: "{n} acomodações" },
        emptyTitle: "Nenhuma acomodação encontrada",
        errorTitle: "Anúncios indisponíveis",
      },
      property: {
        back: "Voltar aos anúncios",
        about: "Sobre esta acomodação",
        keyFacts: "Em resumo",
        petsOk: "Aceita animais",
        petsNo: "Não aceita animais",
        hostRole: "Anfitrião na AfrikaBnB",
        location: "Localização",
      },
      favorites: {
        emptyTitle: "Ainda sem favoritos",
        loginTitle: "Guarde os seus lugares preferidos",
      },
      profile: {
        loginTitle: "Entre na sua conta",
      },
      host: {
        noListingsTitle: "Nenhum anúncio publicado",
      },
      notFound: {
        title: "Página não encontrada",
        text: "Esta página não existe ou foi movida.",
        cta: "Voltar ao início",
      },
    },
  },
};
