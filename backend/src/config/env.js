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

const isHttpUrl = (url) => {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};
const stripSlash = (url) => url.replace(/\/+$/, "");

// URL publique du frontend (liens des emails : réinitialisation du mot de passe, réservations).
let appUrl = process.env.APP_URL || "";
if (!appUrl) {
  if (isProduction) errors.push("APP_URL est obligatoire en production (URL publique du frontend, liens des emails).");
  else appUrl = "http://localhost:3000";
} else if (!isHttpUrl(appUrl)) {
  errors.push("APP_URL doit être une URL http(s) (ex. https://afrikabnb.example).");
}
appUrl = stripSlash(appUrl);

// URL publique de l'API (URL des images du stockage « local »).
let publicApiUrl = process.env.PUBLIC_API_URL || `http://localhost:${Number(process.env.PORT) || 4000}`;
if (!isHttpUrl(publicApiUrl)) errors.push("PUBLIC_API_URL doit être une URL http(s).");
publicApiUrl = stripSlash(publicApiUrl);

// Stockage des photos : "supabase" (Supabase Storage) ou "local" (dossier backend/uploads).
// Défaut : local en développement, supabase en production. « local » est refusé en production
// (disque éphémère des conteneurs, pas de CDN) sauf STORAGE_ALLOW_LOCAL=1.
const storageDriver = (process.env.STORAGE_DRIVER || (isProduction ? "supabase" : "local")).toLowerCase();
const storageAllowLocal = process.env.STORAGE_ALLOW_LOCAL === "1";
const supabaseUrl = stripSlash(process.env.SUPABASE_URL || "");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "listing-images";
if (!["local", "supabase"].includes(storageDriver)) {
  errors.push('STORAGE_DRIVER doit valoir "local" ou "supabase".');
} else if (storageDriver === "local" && isProduction && !storageAllowLocal) {
  errors.push(
    'STORAGE_DRIVER=local refusé en production (fichiers perdus au redéploiement). Utiliser "supabase", ou forcer avec STORAGE_ALLOW_LOCAL=1 (volume persistant).'
  );
} else if (storageDriver === "supabase") {
  const msgs = [];
  if (!/^https:\/\/[^/]+$/.test(supabaseUrl)) msgs.push("SUPABASE_URL (https://<ref>.supabase.co)");
  if (!supabaseServiceRoleKey) msgs.push("SUPABASE_SERVICE_ROLE_KEY (clé service_role / secret, serveur uniquement)");
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(storageBucket)) msgs.push("SUPABASE_STORAGE_BUCKET valide");
  if (msgs.length) errors.push(`STORAGE_DRIVER=supabase : renseigner ${msgs.join(", ")}.`);
}

// Emails : "resend" (API HTTP Resend) ou "console" (journalise le contenu, n'envoie rien).
// Défaut : console en développement, resend en production. Sans clé en production : l'API
// démarre quand même, chaque envoi est journalisé en erreur et ignoré.
const emailDriver = (process.env.EMAIL_DRIVER || (isProduction ? "resend" : "console")).toLowerCase();
const resendApiKey = process.env.RESEND_API_KEY || "";
const emailFrom = process.env.EMAIL_FROM || "AfrikaBnB <onboarding@resend.dev>";
if (!["console", "resend"].includes(emailDriver)) {
  errors.push('EMAIL_DRIVER doit valoir "console" ou "resend".');
} else if (emailDriver === "resend" && !resendApiKey) {
  warnings.push("EMAIL_DRIVER=resend sans RESEND_API_KEY : aucun email ne sera envoyé (erreur journalisée à chaque envoi).");
}
if (isProduction && emailDriver === "console") {
  warnings.push("EMAIL_DRIVER=console en production : aucun email n'est envoyé (contenu non journalisé).");
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
  appUrl,
  publicApiUrl,
  storage: Object.freeze({
    driver: storageDriver,
    supabaseUrl,
    supabaseServiceRoleKey,
    bucket: storageBucket,
  }),
  email: Object.freeze({
    driver: emailDriver,
    resendApiKey,
    from: emailFrom,
  }),
});

export default config;
