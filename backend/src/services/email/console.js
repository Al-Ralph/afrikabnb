// Provider de développement : journalise l'email (lien de réinitialisation compris) sans l'envoyer.
// En production, seuls le destinataire et le sujet sont journalisés (jamais le contenu ni les jetons).
export function createConsoleProvider({ logger, isProduction }) {
  return {
    name: "console",
    async send({ to, subject, text }) {
      if (isProduction) logger.warn({ to, subject }, "[email:console] email non envoyé (EMAIL_DRIVER=console)");
      else logger.info({ to, subject }, `[email:console] email non envoyé :\n${text}`);
      return { id: null };
    },
  };
}
