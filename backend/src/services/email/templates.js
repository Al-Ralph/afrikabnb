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

// Date et heure (GMT, heure de Lomé) : "1 novembre 2026 à 14:30 (GMT)".
export function formatDateTimeFr(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const text = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(d);
  return `${text} (GMT)`;
}

// Paiement attendu (PAYMENTS_ENABLED) : montant exact et échéance ; vide sinon.
function paymentDueParagraphs(booking, guestAccount) {
  if (booking.paymentStatus !== "UNPAID" || !booking.paymentDueAt) return [];
  return [
    `Paiement Mobile Money à effectuer avant le ${formatDateTimeFr(booking.paymentDueAt)} : ${formatAmount(booking.paymentAmount ?? booking.totalPrice, "XOF")}. Sans paiement à cette échéance, la réservation est annulée automatiquement et les dates sont libérées.`,
    guestAccount === false
      ? "Payez depuis le lien de suivi personnel reçu lors de votre demande."
      : "Payez depuis votre espace « Mes voyages ».",
  ];
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
      ...paymentDueParagraphs(booking, true),
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

// Demande acceptée ou refusée : voyageur. guestAccount false : réservation sans compte.
export function bookingDecisionGuestEmail({ name, accepted, booking, url, guestAccount }) {
  return layout({
    subject: accepted
      ? `Demande acceptée : ${booking.listingTitle}`
      : `Demande refusée : ${booking.listingTitle}`,
    name,
    paragraphs: accepted
      ? [
          `Bonne nouvelle : l'hôte a accepté votre demande. ${stayLine(booking)}`,
          `Montant total : ${formatAmount(booking.totalPrice, booking.currency)}.`,
          ...paymentDueParagraphs(booking, guestAccount),
        ]
      : [
          `L'hôte n'a pas pu accepter votre demande pour ${stayLine(booking)}`,
          "Aucun montant n'est dû. D'autres logements sont disponibles à ces dates.",
        ],
    action: url ? { label: accepted ? "Voir mes voyages" : "Trouver un autre logement", url } : undefined,
  });
}

// Annulation : destinataire voyageur ou hôte ; cancelledBy : "guest" | "host".
// refundDue : la réservation était payée (remboursement manuel en cours de traitement).
export function bookingCancelledEmail({ name, recipient, cancelledBy, booking, url, refundDue = false }) {
  const who =
    recipient === cancelledBy
      ? "Vous avez annulé"
      : cancelledBy === "host"
        ? "L'hôte a annulé"
        : "Le voyageur a annulé";
  return layout({
    subject: `Réservation annulée : ${booking.listingTitle}`,
    name,
    paragraphs: [
      `${who} la réservation ${stayLine(booking)}`,
      ...(refundDue
        ? [
            recipient === "host"
              ? "Le paiement du voyageur lui sera remboursé par AfrikaBnB."
              : "Votre paiement sera remboursé : remboursement en cours de traitement (délai selon votre opérateur Mobile Money).",
          ]
        : []),
    ],
    action: url ? { label: recipient === "host" ? "Voir mes réservations" : "Voir mes voyages", url } : undefined,
  });
}

// Réservation annulée faute de paiement à l'échéance : voyageur ou hôte.
export function bookingUnpaidCancelledEmail({ name, recipient, booking, url }) {
  return layout({
    subject: `Réservation annulée (paiement non reçu) : ${booking.listingTitle}`,
    name,
    paragraphs: [
      recipient === "host"
        ? `La réservation ${stayLine(booking)} a été annulée : le voyageur n'a pas payé dans le délai prévu. Les dates sont de nouveau disponibles.`
        : `Votre réservation ${stayLine(booking)} a été annulée : le paiement n'a pas été reçu dans le délai prévu. Aucun montant n'a été débité.`,
    ],
    action: url ? { label: recipient === "host" ? "Voir mes réservations" : "Voir mes voyages", url } : undefined,
  });
}

// Paiement reçu (vérifié auprès du prestataire) : voyageur ou hôte.
export function paymentReceivedEmail({ name, recipient, booking, amount, url }) {
  return layout({
    subject: `Paiement reçu : ${booking.listingTitle}`,
    name,
    paragraphs: [
      recipient === "host"
        ? `Le voyageur a payé la réservation ${stayLine(booking)}`
        : `Votre paiement de ${formatAmount(amount, "XOF")} a bien été reçu pour ${stayLine(booking)}`,
      recipient === "host" ? `Montant payé : ${formatAmount(amount, "XOF")}.` : "Votre réservation est payée et confirmée.",
    ],
    action: url ? { label: recipient === "host" ? "Voir mes réservations" : "Voir mes voyages", url } : undefined,
  });
}

// Paiement reçu alors que la réservation n'est plus active (annulée, échue) : voyageur.
export function refundDueGuestEmail({ name, booking, amount, url }) {
  return layout({
    subject: `Paiement à rembourser : ${booking.listingTitle}`,
    name,
    paragraphs: [
      `Nous avons reçu votre paiement de ${formatAmount(amount, "XOF")} pour ${stayLine(booking)}`,
      "Cette réservation n'étant plus active (annulée ou délai de paiement dépassé), elle n'a pas été réactivée.",
      "Votre paiement sera remboursé : remboursement en cours de traitement (délai selon votre opérateur Mobile Money).",
    ],
    action: url ? { label: "Voir mes voyages", url } : undefined,
  });
}

// Alerte administrateur : remboursement manuel à effectuer ou anomalie de paiement.
// reason : "refund_due" | "duplicate" | "mismatch".
export function adminPaymentAlertEmail({ reason, booking, transactionId, amount, details, url }) {
  const titles = {
    refund_due: "Remboursement à effectuer",
    duplicate: "Paiement en double à rembourser",
    mismatch: "Paiement accepté avec un montant ou une devise inattendus",
  };
  return layout({
    subject: `[AfrikaBnB] ${titles[reason] || "Alerte paiement"} : ${booking.listingTitle}`,
    name: null,
    paragraphs: [
      `${titles[reason] || "Alerte paiement"} pour ${stayLine(booking)}`,
      ...(transactionId ? [`Transaction : ${oneLine(transactionId)}.`] : []),
      ...(amount != null ? [`Montant : ${formatAmount(amount, "XOF")}.`] : []),
      ...(details ? [`Détails : ${oneLine(details)}`] : []),
      "Effectuer le remboursement depuis le back-office CinetPay (ou auprès du voyageur), puis le marquer « remboursé » dans l'administration AfrikaBnB.",
    ],
    action: url ? { label: "Ouvrir l'administration", url } : undefined,
  });
}
