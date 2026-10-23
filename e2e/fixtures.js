import { test as base, expect } from "@playwright/test";

// Adresse IP fictive par test, transmise à l'API dans X-Forwarded-For (CI uniquement).
// En CI le backend tourne avec TRUST_PROXY=1 : chaque test a ses propres compteurs de rate limiting
// (connexion 10 / 15 min, renouvellement 60 / 15 min, réservations sans compte 5 / h…), sinon
// toute la suite partagerait ceux de 127.0.0.1. En local (TRUST_PROXY=0), rien n'est modifié.
const spoofClientIp = Boolean(process.env.CI) || process.env.E2E_SPOOF_IP === "1";

const randomIp = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;

// Bruit qui ne relève pas d'une erreur de l'application :
// - 401/429 de /api/auth/refresh : visiteur sans session (appel normal à chaque chargement) ;
// - ressources tierces (photos Unsplash…) momentanément injoignables depuis le runner.
function isIgnorableConsoleError(message) {
  const text = message.text();
  const url = message.location()?.url || "";
  if (!text.startsWith("Failed to load resource")) return false;
  if (/\/api\/auth\/refresh(\?|$)/.test(url)) return true;
  try {
    const { hostname } = new URL(url);
    return hostname !== "localhost" && hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

export const test = base.extend({
  clientIp: async ({}, use) => {
    await use(spoofClientIp ? randomIp() : null);
  },

  // En-têtes à joindre aux appels directs à l'API (fixture `request`).
  apiHeaders: async ({ clientIp }, use) => {
    await use(clientIp ? { "X-Forwarded-For": clientIp } : {});
  },

  context: async ({ context, clientIp }, use) => {
    // Langue de l'interface fixée en français au premier chargement (un test peut la changer ensuite).
    await context.addInitScript(() => {
      try {
        if (!window.localStorage.getItem("afrikabnb_lang")) window.localStorage.setItem("afrikabnb_lang", "fr");
      } catch {
        // stockage indisponible : la langue par défaut du navigateur (fr-TG) donne aussi le français
      }
    });
    if (clientIp) {
      const isApi = (url) => url.pathname.startsWith("/api/") || url.pathname === "/health";
      await context.route(isApi, (route) =>
        route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": clientIp } })
      );
    }
    await use(context);
  },

  // Erreurs console (console.error) et exceptions non interceptées de la page.
  consoleErrors: async ({ page }, use) => {
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !isIgnorableConsoleError(message)) {
        errors.push(`${message.text()} (${message.location()?.url || "?"})`);
      }
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await use(errors);
  },
});

export { expect };
