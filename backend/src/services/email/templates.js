// Gabarits des emails transactionnels (FR). Fonctions pures : { subject, text, html }.
// Toute valeur insérée dans le HTML passe par escapeHtml (noms, titres d'annonces : contenu
// saisi par les utilisateurs). Les URL sont construites côté serveur à partir de APP_URL.

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"'`=/]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Retire les retours à la ligne (en-tête Subject).
const oneLine = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();

export function formatAmount(amount, currency = "XOF") {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${Number(amount)} ${currency}`;
  }
}

// "2026-11-01" -> "1 novembre 2026"
export function formatDayFr(day) {
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return String(day);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

function greeting(name) {
  return name ? `Bonjour ${name},` : "Bonjour,";
}

// Mise en page commune. `paragraphs` : textes bruts (échappés ici) ; `action` : { label, url }.
function layout({ subject, name, paragraphs, action, footer }) {
  const textParts = [greeting(name), "", ...paragraphs.flatMap((p) => [p, ""])];
  if (action) textParts.push(`${action.label} : ${action.url}`, "");
  if (footer) textParts.push(footer, "");
  textParts.push("— L'équipe AfrikaBnB");

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#1d2b25;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#0b5d46;">AfrikaBnB</p>
<p>${escapeHtml(greeting(name))}</p>
${paragraphs.map((p) => `<p style="line-height:1.5;">${escapeHtml(p)}</p>`).join("\n")}
${
  action
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(action.url)}" style="background:#0b5d46;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">${escapeHtml(action.label)}</a></p>
<p style="font-size:12px;color:#5b6b64;word-break:break-all;">${escapeHtml(action.url)}</p>`
    : ""
}
${footer ? `<p style="font-size:12px;color:#5b6b64;">${escapeHtml(footer)}</p>` : ""}
<p>— L'équipe AfrikaBnB</p>
</div></body></html>`;

  return { subject: oneLine(subject), text: textParts.join("\n"), html };
}

function stayLine({ listingTitle, checkIn, checkOut, nights, guests }) {
  const n = nights != null ? ` (${nights} nuit${nights > 1 ? "s" : ""})` : "";
  const g = guests != null ? `, ${guests} voyageur${guests > 1 ? "s" : ""}` : "";
  return `« ${listingTitle} » du ${formatDayFr(checkIn)} au ${formatDayFr(checkOut)}${n}${g}.`;
}

// Nom du pays en français à partir du code ISO 3166-1 alpha-2 (repli : le code).
export function countryNameFr(code) {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(String(code).toUpperCase()) || String(code);
  } catch {
    return String(code);
  }
}

// Fiche de contact transmise à l'hôte : un paragraphe par champ (échappés dans la version HTML).
function contactParagraphs(contact, guestAccount) {
  if (!contact) return [];
  const lines = [
    guestAccount === false
      ? "Coordonnées saisies par le voyageur (réservation sans compte AfrikaBnB, non vérifiées) :"
      : "Coordonnées saisies par le voyageur :",
    `Nom : ${oneLine(contact.name)}`,
    `E-mail : ${oneLine(contact.email)}`,
  ];
  if (contact.phone) lines.push(`Téléphone : ${oneLine(contact.phone)}`);
  if (contact.country) lines.push(`Pays : ${countryNameFr(contact.country)}`);
  if (contact.arrivalTime) lines.push(`Heure d'arrivée estimée : ${oneLine(contact.arrivalTime)}`);
  if (contact.message) lines.push(`Message du voyageur : ${contact.message}`);
  return lines;
}

export function passwordResetEmail({ name, resetUrl }) {
  return layout({
    subject: "Réinitialisation de votre mot de passe AfrikaBnB",
    name,
    paragraphs: [
      "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte.",
      "Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois.",
    ],
    action: { label: "Choisir un nouveau mot de passe", url: resetUrl },
    footer: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
  });
}

// Réservation confirmée (instantanée) : voyageur.
export function bookingConfirmedGuestEmail({ name, booking, url }) {
  return layout({
    subject: `Réservation confirmée : ${booking.listingTitle}`,
    name,
    paragraphs: [
      `Votre réservation est confirmée : ${stayLine(booking)}`,
      `Montant total : ${formatAmount(booking.totalPrice, booking.currency)}.`,
      "Vos coordonnées ont été transmises à l'hôte pour organiser votre séjour.",
    ],
    action: url ? { label: "Voir mes voyages", url } : undefined,
  });
}

// Réservation confirmée (instantanée ou acceptée) : hôte, avec la fiche de contact du voyageur.
export function bookingConfirmedHostEmail({ name, guestName, booking, url, contact, guestAccount }) {
  return layout({
    subject: `Nouvelle réservation : ${booking.listingTitle}`,
    name,
    paragraphs: [
      `${guestName || "Un voyageur"} a réservé ${stayLine(booking)}`,
      `Montant total : ${formatAmount(booking.totalPrice, booking.currency)}.`,
      ...contactParagraphs(contact, guestAccount),
    ],
    action: url ? { label: "Voir mes réservations", url } : undefined,
  });
}

// Demande de réservation en attente : hôte, avec la fiche de contact du voyageur.
export function bookingRequestHostEmail({ name, guestName, booking, url, contact, guestAccount }) {
  return layout({
    subject: `Demande de réservation : ${booking.listingTitle}`,
    name,
    paragraphs: [
      `${guestName || "Un voyageur"} souhaite réserver ${stayLine(booking)}`,
      `Montant total : ${formatAmount(booking.totalPrice, booking.currency)}.`,
      ...contactParagraphs(contact, guestAccount),
      "Acceptez ou refusez la demande sous 48 heures, sans quoi elle expirera automatiquement.",
    ],
    action: url ? { label: "Répondre à la demande", url } : undefined,
  });
}

// Demande de réservation envoyée : récapitulatif au voyageur. `manageUrl` : lien de suivi d'une
// réservation sans compte (sinon `url` : espace voyageur).
export function bookingRequestGuestEmail({ name, booking, url, manageUrl }) {
  return layout({
    subject: `Demande envoyée : ${booking.listingTitle}`,
    name,
    paragraphs: [
      `Votre demande de réservation a bien été transmise à l'hôte : ${stayLine(booking)}`,
      `Montant total : ${formatAmount(booking.totalPrice, booking.currency)}. Rien n'est dû avant l'accord de l'hôte.`,
      "L'hôte a 48 heures pour accepter ou refuser votre demande ; vous serez prévenu par e-mail.",
      "Vos coordonnées ont été transmises à l'hôte pour organiser votre séjour.",
    ],
    action: manageUrl
      ? { label: "Suivre ou annuler ma demande", url: manageUrl }
      : url
        ? { label: "Voir mes voyages", url }
        : undefined,
    footer: manageUrl
      ? "Ce lien personnel permet de suivre ou d'annuler votre demande sans compte : ne le partagez pas."
      : undefined,
  });
}

// Demande acceptée ou refusée : voyageur.
export function bookingDecisionGuestEmail({ name, accepted, booking, url }) {
  return layout({
    subject: accepted
      ? `Demande acceptée : ${booking.listingTitle}`
      : `Demande refusée : ${booking.listingTitle}`,
    name,
    paragraphs: accepted
      ? [
          `Bonne nouvelle : l'hôte a accepté votre demande. ${stayLine(booking)}`,
          `Montant total : ${formatAmount(booking.totalPrice, booking.currency)}.`,
        ]
      : [
          `L'hôte n'a pas pu accepter votre demande pour ${stayLine(booking)}`,
          "Aucun montant n'est dû. D'autres logements sont disponibles à ces dates.",
        ],
    action: url ? { label: accepted ? "Voir mes voyages" : "Trouver un autre logement", url } : undefined,
  });
}

// Annulation : destinataire voyageur ou hôte ; cancelledBy : "guest" | "host".
export function bookingCancelledEmail({ name, recipient, cancelledBy, booking, url }) {
  const who =
    recipient === cancelledBy
      ? "Vous avez annulé"
      : cancelledBy === "host"
        ? "L'hôte a annulé"
        : "Le voyageur a annulé";
  return layout({
    subject: `Réservation annulée : ${booking.listingTitle}`,
    name,
    paragraphs: [`${who} la réservation ${stayLine(booking)}`],
    action: url ? { label: recipient === "host" ? "Voir mes réservations" : "Voir mes voyages", url } : undefined,
  });
}
