import "dotenv/config";
import crypto from "node:crypto";

// Chargement et validation de l'environnement au démarrage.
// En production, toute configuration dangereuse arrête le processus.

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

const errors = [];
const warnings = [];

let jwtSecret = process.env.JWT_SECRET || "";
const weakSecret =
  !jwtSecret || jwtSecret.length < 32 || jwtSecret.toLowerCase().includes("change-me");
if (weakSecret) {
  if (isProduction) {
    errors.push(
      "JWT_SECRET absent ou trop faible (32 caractères minimum, sans \"change-me\"). Générer : openssl rand -base64 48"
    );
  } else {
    warnings.push(
      "JWT_SECRET absent ou trop faible : acceptable en développement uniquement. Générer : openssl rand -base64 48"
    );
    if (!jwtSecret) {
      // Secret aléatoire par processus : les tokens deviennent invalides à chaque redémarrage.
      jwtSecret = crypto.randomBytes(48).toString("base64");
    }
  }
}

// Base PostgreSQL (Supabase en production). DATABASE_URL : utilisée par l'API (pooler en
// mode transaction sur Supabase) ; DIRECT_URL : utilisée par `prisma migrate`.
const databaseUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";
const isPostgresUrl = (url) => /^postgres(ql)?:\/\//.test(url);
// Hôtes locaux (poste de développement, service `db` de docker-compose) : pas de SSL.
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "db"]);

function checkDatabaseUrl(name, url) {
  if (!isPostgresUrl(url)) {
    errors.push(`${name} doit être une URL PostgreSQL (postgresql://…). Voir backend/.env.example.`);
    return;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    errors.push(
      `${name} est une URL invalide (mot de passe avec caractères spéciaux : l'encoder, ex. @ → %40).`
    );
    return;
  }
  const sslMode = parsed.searchParams.get("sslmode");
  if (
    isProduction &&
    !LOCAL_DB_HOSTS.has(parsed.hostname) &&
    !["require", "verify-ca", "verify-full"].includes(sslMode)
  ) {
    warnings.push(
      `${name} sans sslmode=require : ajouter "sslmode=require" pour imposer une connexion chiffrée (Supabase, base distante).`
    );
  }
  // Pooler Supabase en mode transaction (port 6543) : Prisma doit désactiver les requêtes préparées.
  if (
    parsed.port === "6543" &&
    parsed.hostname.endsWith(".pooler.supabase.com") &&
    parsed.searchParams.get("pgbouncer") !== "true"
  ) {
    warnings.push(`${name} pointe vers le pooler Supabase (port 6543) sans "pgbouncer=true".`);
  }
}

if (!databaseUrl) {
  errors.push("DATABASE_URL est obligatoire (URL PostgreSQL / Supabase, voir backend/.env.example).");
} else {
  checkDatabaseUrl("DATABASE_URL", databaseUrl);
}
if (!directUrl) {
  const msg =
    "DIRECT_URL absente : nécessaire à `prisma migrate` (Supabase : connexion directe ou session pooler, port 5432 ; base locale : même valeur que DATABASE_URL).";
  if (isProduction) errors.push(msg);
  else warnings.push(msg);
} else {
  checkDatabaseUrl("DIRECT_URL", directUrl);
}

const rawOrigins =(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
let corsOrigins = rawOrigins;
if (isProduction) {
  if (rawOrigins.length === 0) {
    errors.push("CORS_ORIGIN est obligatoire en production (liste d'origines séparées par des virgules).");
  } else if (rawOrigins.includes("*")) {
    errors.push("CORS_ORIGIN ne peut pas contenir \"*\" en production.");
  }
} else if (rawOrigins.length === 0) {
  corsOrigins = ["http://localhost:3000"];
}

const port = Number(process.env.PORT) || 4000;
const trustProxy = process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0;
if (Number.isNaN(trustProxy) || trustProxy < 0) {
  errors.push("TRUST_PROXY doit être un entier >= 0 (nombre de proxys devant l'API).");
}

if (errors.length > 0) {
  for (const e of errors) console.error(`[config] ERREUR : ${e}`);
  console.error("[config] Démarrage refusé.");
  process.exit(1);
}
for (const w of warnings) console.warn(`[config] AVERTISSEMENT : ${w}`);

export const config = Object.freeze({
  nodeEnv: NODE_ENV,
  isProduction,
  port,
  trustProxy,
  corsOrigins,
  jwt: Object.freeze({
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  }),
});

export default config;
