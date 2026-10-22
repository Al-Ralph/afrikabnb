import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Stockage sur disque (développement) : backend/uploads/, servi en statique sous /uploads.
export const UPLOADS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../uploads");

// Résout une clé ("listings/<id>/<uuid>.webp") dans UPLOADS_DIR, sans sortie possible du dossier.
function resolveKey(key) {
  const full = path.resolve(UPLOADS_DIR, key);
  if (!full.startsWith(UPLOADS_DIR + path.sep)) throw new Error("Clé de stockage invalide");
  return full;
}

export function createLocalStorage({ publicBaseUrl }) {
  return {
    driver: "local",
    async put(key, buffer) {
      const full = resolveKey(key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, buffer, { flag: "wx" });
      return { path: key, url: `${publicBaseUrl}/uploads/${key}` };
    },
    async remove(key) {
      await fs.rm(resolveKey(key), { force: true });
    },
  };
}
