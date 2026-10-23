import { defineConfig } from "@playwright/test";

// Tests de bout en bout (navigateur réel) contre les serveurs de développement déjà démarrés :
// frontend Vite sur :3000 (proxy /api et /health vers le backend :4000).
//   npm run e2e:readonly   -> parcours en lecture seule (@readonly), utilisables en local
//   npm run e2e            -> suite complète : elle ÉCRIT dans la base (CI uniquement)
// E2E_CHANNEL=msedge : utilise le navigateur Edge installé au lieu du Chromium de Playwright
// (poste local sans `npx playwright install chromium`). La CI utilise toujours Chromium.
const isCI = Boolean(process.env.CI);
const channel = process.env.E2E_CHANNEL || undefined;
// Garde-fou : hors CI, seuls les tests @readonly sont retenus (la base de développement est
// partagée), sauf E2E_ALLOW_WRITE=1 explicite contre une base jetable.
const allowWrites = isCI || process.env.E2E_ALLOW_WRITE === "1";

// Contexte commun : français, région Togo (devise automatique : XOF), fuseau de Lomé.
const common = {
  baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  locale: "fr-TG",
  timezoneId: "Africa/Lome",
  channel,
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
  video: "off",
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Un seul worker en CI : les parcours d'écriture partagent des comptes de démo (kofi, host).
  workers: isCI ? 1 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    ...common,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "desktop",
      grep: allowWrites ? /.*/ : /@readonly/,
      grepInvert: /@mobile/,
      use: { ...common, browserName: "chromium", viewport: { width: 1280, height: 800 } },
    },
    {
      // Largeur d'un téléphone récent : uniquement les parcours tagués @mobile.
      name: "mobile",
      grep: /@mobile/,
      use: {
        ...common,
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
