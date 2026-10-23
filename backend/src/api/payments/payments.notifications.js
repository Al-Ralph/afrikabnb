import { alertPaymentIssue, notifyBooking } from "../bookings/bookings.notifications.js";

// Conséquences d'une vérification (e-mails, alertes, journal), après le commit. Ne lève jamais.
export function handleSyncOutcome(result, log) {
  if (!result) return;
  const { outcome, bookingId, transactionId, amount } = result;
  const ctx = { transactionId, bookingId, outcome };
  switch (outcome) {
    case "paid":
      log.info(ctx, "[paiement] accepté");
      notifyBooking("paid", bookingId, log, { amount });
      break;
    case "refund_due":
      log.warn(ctx, "[paiement] accepté sur une réservation inactive : remboursement à effectuer");
      notifyBooking("refund_due", bookingId, log, { amount });
      if (result.cancelledNow) notifyBooking("unpaid", bookingId, log, { hostOnly: true });
      alertPaymentIssue("refund_due", bookingId, log, { transactionId, amount });
      break;
    case "duplicate":
      log.warn(ctx, "[paiement] paiement en double : remboursement à effectuer");
      alertPaymentIssue("duplicate", bookingId, log, { transactionId, amount });
      break;
    case "mismatch":
      log.error({ ...ctx, expected: result.expected, received: result.received }, "[paiement] montant ou devise discordants");
      // Alerte unique : seulement à la première détection (notifications répétées ignorées).
      if (!result.firstDetection) break;
      alertPaymentIssue("mismatch", bookingId, log, {
        transactionId,
        details: `attendu ${result.expected.amount} ${result.expected.currency}, reçu ${result.received.amount} ${result.received.currency}`,
      });
      break;
    case "site_mismatch":
    case "unknown":
      log.warn(ctx, "[paiement] notification ignorée");
      break;
    case "error":
      log.error({ ...ctx, err: { message: result.error?.message } }, "[paiement] vérification impossible");
      break;
    default:
      log.info(ctx, `[paiement] ${outcome}`);
  }
}

