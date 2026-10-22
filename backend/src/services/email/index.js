import { config } from "../../config/env.js";
import { logger as rootLogger } from "../../config/logger.js";
import { createConsoleProvider } from "./console.js";
import { createResendProvider } from "./resend.js";

// Choix du provider par EMAIL_DRIVER (validé au démarrage par config/env.js).
const provider =
  config.email.driver === "resend"
    ? createResendProvider({ apiKey: config.email.resendApiKey, from: config.email.from })
    : createConsoleProvider({ logger: rootLogger, isProduction: config.isProduction });

// Envoi « au mieux », à appeler APRÈS le commit de la transaction : ne bloque jamais la réponse
// HTTP et ne lève jamais d'erreur (échec journalisé). `message` : { to, subject, text, html }.
export function sendEmailInBackground(message, log = rootLogger) {
  if (!message?.to) return Promise.resolve();
  return provider
    .send(message)
    .then((r) => log.debug({ to: message.to, subject: message.subject, id: r?.id }, "[email] envoyé"))
    .catch((err) =>
      log.error({ err: { message: err.message }, to: message.to, subject: message.subject }, "[email] échec d'envoi")
    );
}

// Construit des URL du frontend (APP_URL) pour les liens des emails.
export const appLink = (path) => `${config.appUrl}${path}`;
