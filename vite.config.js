import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Backend Express en développement (remplace le "proxy" de Create React App).
const API_TARGET = "http://localhost:4000";

const BRAND_COLOR = "#0b5d46";

// Requête GET anonyme vers l'API publique des annonces (jamais d'en-tête Authorization :
// les réponses authentifiées ne sont pas mises en cache).
const isPublicListingsRequest = ({ url, request }) =>
  request.method === "GET" &&
  url.pathname.startsWith("/api/listings") &&
  !request.headers.has("Authorization");

export default defineConfig({
  plugins: [
    react(),
    // Service worker généré uniquement au build (devOptions.enabled = false par défaut :
    // pas d'interférence avec le HMR de Vite) ; non chargé par les tests.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon-32.png", "apple-touch-icon.png", "icon.svg"],
      manifest: {
        name: "AfrikaBnB",
        short_name: "AfrikaBnB",
        description: "Découvrez et réservez des séjours en Afrique (démo).",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: BRAND_COLOR,
        background_color: "#dcebe3",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // Navigation hors ligne : l'app shell précaché (hors API et health check).
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: isPublicListingsRequest,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-listings",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 30, maxAgeSeconds: 10 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Taux de change d'affichage : publics et identiques pour tous (mis à jour 1 fois/jour).
            urlPattern: ({ url, request }) => request.method === "GET" && url.pathname === "/api/rates",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-rates",
              expiration: { maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === "images.unsplash.com",
            handler: "CacheFirst",
            options: {
              cacheName: "unsplash-images",
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": API_TARGET,
      "/health": API_TARGET,
    },
  },
  build: {
    // Même dossier de sortie que CRA (documentation, .gitignore, hébergement statique).
    outDir: "build",
  },
  test: {
    include: ["src/**/*.test.{js,jsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js",
    css: false,
    // Comportement par défaut de Jest sous CRA (resetMocks: true) : les mocks sont
    // réinitialisés avant chaque test ; plusieurs tests reposent sur cette hypothèse.
    mockReset: true,
  },
});
