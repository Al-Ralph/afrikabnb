import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend Express en développement (remplace le "proxy" de Create React App).
const API_TARGET = "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
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
