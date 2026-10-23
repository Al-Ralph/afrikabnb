import prisma from "../../config/db.js";
import { formatDay, nightsBetween } from "../../utils/booking.js";
import { appLink, sendEmailInBackground } from "../../services/email/index.js";
import {
  bookingCancelledEmail,
  bookingConfirmedGuestEmail,
  bookingConfirmedHostEmail,
  bookingDecisionGuestEmail,
  bookingRequestGuestEmail,
  bookingRequestHostEmail,
} from "../../services/email/templates.js";
import { contactOf } from "./bookings.serializers.js";

const GUEST_URL = "/profil";
const HOST_URL = "/host";

// Emails liés à une réservation, envoyés APRÈS le commit et sans bloquer la réponse :
// la fonction ne lève jamais (échecs journalisés).
// kind : "created" | "accepted" | "declined" | "cancelled" ; extra.cancelledBy : "guest" | "host" ;
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
        guestMail(bookingDecisionGuestEmail({ name: guest.name, accepted, booking, url: accepted ? guestUrl : appLink("/") }));
        if (accepted) {
          hostMail(bookingConfirmedHostEmail({ name: host.name, ...hostView }));
        }
      } else if (kind === "cancelled") {
        const cancelledBy = extra.cancelledBy;
        guestMail(bookingCancelledEmail({ name: guest.name, recipient: "guest", cancelledBy, booking, url: guestUrl }));
        hostMail(bookingCancelledEmail({ name: host.name, recipient: "host", cancelledBy, booking, url: hostUrl }));
      }
    })
    .catch((err) => log.error({ err, bookingId, kind }, "[email] préparation impossible"));
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
    },
  };
}
