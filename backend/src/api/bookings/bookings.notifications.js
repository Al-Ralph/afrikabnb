import prisma from "../../config/db.js";
import { formatDay, nightsBetween } from "../../utils/booking.js";
import { appLink, sendEmailInBackground } from "../../services/email/index.js";
import { payableAmount } from "../../utils/payment.js";
import {
  adminPaymentAlertEmail,
  bookingCancelledEmail,
  bookingConfirmedGuestEmail,
  bookingConfirmedHostEmail,
  bookingDecisionGuestEmail,
  bookingRequestGuestEmail,
  bookingRequestHostEmail,
  bookingUnpaidCancelledEmail,
  paymentReceivedEmail,
  refundDueGuestEmail,
} from "../../services/email/templates.js";
import { contactOf } from "./bookings.serializers.js";

const GUEST_URL = "/profil";
const HOST_URL = "/host";

// Emails liés à une réservation, envoyés APRÈS le commit et sans bloquer la réponse :
// la fonction ne lève jamais (échecs journalisés).
// kind : "created" | "accepted" | "declined" | "cancelled" | "unpaid" (annulée faute de paiement)
// | "paid" | "refund_due" (paiement reçu sur une réservation inactive) ; extra.cancelledBy :
// "guest" | "host" ; extra.refundDue : annulation d'une réservation payée ; extra.amount : montant payé ;
// extra.manageUrl : lien de suivi d'une réservation sans compte (création uniquement : le jeton
// n'est connu qu'à ce moment, seule son empreinte est stockée).
export function notifyBooking(kind, bookingId, log, extra = {}) {
  load(bookingId)
    .then((ctx) => {
      if (!ctx) return;
      const { booking, guest, host, contact, guestAccount } = ctx;
      const guestMail = (tpl) => sendEmailInBackground({ to: guest.email, ...tpl }, log);
      const hostMail = (tpl) => sendEmailInBackground({ to: host.email, ...tpl }, log);
      // Sans compte : pas d'espace voyageur ; le lien de suivi n'existe que dans le 1er e-mail.
      const guestUrl = guestAccount ? appLink(GUEST_URL) : undefined;
      const hostUrl = appLink(HOST_URL);
      const hostView = { guestName: guest.name, booking, url: hostUrl, contact, guestAccount };
      if (kind === "created" && booking.status === "CONFIRMED") {
        guestMail(bookingConfirmedGuestEmail({ name: guest.name, booking, url: guestUrl }));
        hostMail(bookingConfirmedHostEmail({ name: host.name, ...hostView }));
      } else if (kind === "created" && booking.status === "PENDING") {
        guestMail(bookingRequestGuestEmail({ name: guest.name, booking, url: guestUrl, manageUrl: extra.manageUrl }));
        hostMail(bookingRequestHostEmail({ name: host.name, ...hostView }));
      } else if (kind === "accepted" || kind === "declined") {
        const accepted = kind === "accepted";
        guestMail(
          bookingDecisionGuestEmail({ name: guest.name, accepted, booking, url: accepted ? guestUrl : appLink("/"), guestAccount })
        );
        if (accepted) {
          hostMail(bookingConfirmedHostEmail({ name: host.name, ...hostView }));
        }
      } else if (kind === "cancelled") {
        const cancelledBy = extra.cancelledBy;
        const refundDue = Boolean(extra.refundDue);
        guestMail(bookingCancelledEmail({ name: guest.name, recipient: "guest", cancelledBy, booking, url: guestUrl, refundDue }));
        hostMail(bookingCancelledEmail({ name: host.name, recipient: "host", cancelledBy, booking, url: hostUrl, refundDue }));
        if (refundDue) notifyAdmins(adminPaymentAlertEmail({ reason: "refund_due", booking, url: appLink("/admin?tab=refunds") }), log);
      } else if (kind === "unpaid") {
        if (!extra.hostOnly) guestMail(bookingUnpaidCancelledEmail({ name: guest.name, recipient: "guest", booking, url: guestUrl }));
        hostMail(bookingUnpaidCancelledEmail({ name: host.name, recipient: "host", booking, url: hostUrl }));
      } else if (kind === "paid") {
        guestMail(paymentReceivedEmail({ name: guest.name, recipient: "guest", booking, amount: extra.amount, url: guestUrl }));
        hostMail(paymentReceivedEmail({ name: host.name, recipient: "host", booking, amount: extra.amount, url: hostUrl }));
      } else if (kind === "refund_due") {
        guestMail(refundDueGuestEmail({ name: guest.name, booking, amount: extra.amount, url: guestUrl }));
      }
    })
    .catch((err) => log.error({ err, bookingId, kind }, "[email] préparation impossible"));
}

// Alerte de paiement aux administrateurs (comptes ADMIN), journalisée dans tous les cas.
export function notifyAdmins(message, log) {
  log.warn({ subject: message.subject }, "[paiement] alerte administrateur");
  prisma.user
    .findMany({ where: { role: "ADMIN" }, select: { email: true }, take: 10 })
    .then((admins) => admins.forEach((a) => sendEmailInBackground({ to: a.email, ...message }, log)))
    .catch((err) => log.error({ err }, "[email] administrateurs introuvables"));
}

// Alerte paiement (remboursement à effectuer, paiement en double, montant discordant).
export function alertPaymentIssue(reason, bookingId, log, { transactionId, amount, details } = {}) {
  load(bookingId)
    .then((ctx) => {
      if (!ctx) return;
      notifyAdmins(
        adminPaymentAlertEmail({ reason, booking: ctx.booking, transactionId, amount, details, url: appLink("/admin?tab=refunds") }),
        log
      );
    })
    .catch((err) => log.error({ err, bookingId, reason }, "[email] alerte paiement impossible"));
}

// Destinataire voyageur : le compte s'il existe, sinon la fiche de contact (réservation sans compte).
export function guestRecipient(b) {
  if (b.guest) return { email: b.guest.email, name: b.guest.name };
  return { email: b.contactEmail ?? null, name: b.contactName ?? null };
}

async function load(bookingId) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { email: true, name: true } },
      listing: { select: { title: true, currency: true, host: { select: { email: true, name: true } } } },
    },
  });
  if (!b) return null;
  const checkIn = formatDay(b.checkIn);
  const checkOut = formatDay(b.checkOut);
  return {
    guest: guestRecipient(b),
    host: b.listing.host,
    contact: contactOf(b),
    guestAccount: b.guestId != null,
    booking: {
      status: b.status,
      listingTitle: b.listing.title,
      currency: b.listing.currency,
      checkIn,
      checkOut,
      nights: nightsBetween(checkIn, checkOut),
      guests: b.guests,
      totalPrice: Number(b.totalPrice),
      paymentStatus: b.paymentStatus,
      paymentDueAt: b.paymentDueAt ?? null,
      paymentAmount: payableAmount(b.totalPrice),
    },
  };
}
