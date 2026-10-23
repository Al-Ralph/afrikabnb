import "dotenv/config";
import crypto from "node:crypto";
import pino from "pino";
import pinoHttp from "pino-http";

// Ce module lit process.env directement (sans passer par env.js) pour pouvoir être importé
// par les tests sans déclencher la validation de env.js ; env.js garde console.* car il s'exécute avant le logger.

const nodeEnv = process.env.NODE_ENV || "development";
const isDevelopment = nodeEnv === "development";
const level = process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info");

// Jamais d'en-têtes sensibles dans les logs (les corps de requête ne sont de toute façon pas journalisés).
export const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

// Sortie lisible en développement uniquement, si pino-pretty (devDependency) est installé.
async function developmentStream() {
  if (!isDevelopment) return undefined;
  try {
    const { default: pretty } = await import("pino-pretty");
    return pretty({ colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" });
  } catch {
    return undefined;
  }
}

export const logger = pino(
  { level, redact: { paths: redactPaths, censor: "[masqué]" } },
  await developmentStream()
);

// Jetons portés par le chemin de l'URL (lien de suivi d'une réservation sans compte) : masqués
// dans les logs de requête et d'erreur.
export function maskSensitiveUrl(url) {
  return typeof url === "string" ? url.replace(/(\/api\/guest-bookings\/)[^/?#]+/, "$1[masqué]") : url;
}

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function genReqId(req, res) {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader("X-Request-Id", id);
  return id;
}

export const httpLogger = pinoHttp({
  logger,
  genReqId,
  // En-têtes de réponse (helmet, rate limit…) trop verbeux : seul le statut est journalisé.
  serializers: {
    req: (req) => {
      req.url = maskSensitiveUrl(req.url);
      if (req.params?.token) req.params = { ...req.params, token: "[masqué]" };
      return req;
    },
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  // L'erreur complète est déjà journalisée par errorHandler : pas de doublon (stack) dans la ligne de fin de requête.
  customErrorObject: (req, res, err, val) => ({ res: val.res, responseTime: val.responseTime }),
});

export default logger;
