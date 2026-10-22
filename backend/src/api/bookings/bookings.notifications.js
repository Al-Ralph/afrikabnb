import prisma from "../../config/db.js";
import { formatDay, nightsBetween } from "../../utils/booking.js";
import { appLink, sendEmailInBackground } from "../../services/email/index.js";
import {
  bookingCancelledEmail,
  bookingConfirmedGuestEmail,
  bookingConfirmedHostEmail,
  bookingDecisionGuestEmail,
  bookingRequestHostEmail,
} from "../../services/email/templates.js";

const GUEST_URL = "/profil";
const HOST_URL = "/host";

// Emails liés à une réservation, envoyés APRÈS le commit et sans bloquer la réponse :
// la fonction ne lève jamais (échecs journalisés).
// kind : "created" | "accepted" | "declined" | "cancelled" ; extra.cancelledBy : "guest" | "host".
export function notifyBooking(kind, bookingId, log, extra = {}) {
  load(bookingId)
    .then((ctx) => {
      if (!ctx) return;
      const { booking, guest, host } = ctx;
      const guestMail = (tpl) => sendEmailInBackground({ to: guest.email, ...tpl }, log);
      const hostMail = (tpl) => sendEmailInBackground({ to: host.email, ...tpl }, log);
      const guestUrl = appLink(GUEST_URL);
      const hostUrl = appLink(HOST_URL);
      if (kind === "created" && booking.status === "CONFIRMED") {
        guestMail(bookingConfirmedGuestEmail({ name: guest.name, booking, url: guestUrl }));
        hostMail(bookingConfirmedHostEmail({ name: host.name, guestName: guest.name, booking, url: hostUrl }));
      } else if (kind === "created" && booking.status === "PENDING") {
        hostMail(bookingRequestHostEmail({ name: host.name, guestName: guest.name, booking, url: hostUrl }));
      } else if (kind === "accepted" || kind === "declined") {
        const accepted = kind === "accepted";
        guestMail(bookingDecisionGuestEmail({ name: guest.name, accepted, booking, url: accepted ? guestUrl : appLink("/") }));
        if (accepted) {
          hostMail(bookingConfirmedHostEmail({ name: host.name, guestName: guest.name, booking, url: hostUrl }));
        }
      } else if (kind === "cancelled") {
        const cancelledBy = extra.cancelledBy;
        guestMail(bookingCancelledEmail({ name: guest.name, recipient: "guest", cancelledBy, booking, url: guestUrl }));
        hostMail(bookingCancelledEmail({ name: host.name, recipient: "host", cancelledBy, booking, url: hostUrl }));
      }
    })
    .catch((err) => log.error({ err, bookingId, kind }, "[email] préparation impossible"));
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
    guest: b.guest,
    host: b.listing.host,
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
