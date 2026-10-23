// Réconciliation périodique des paiements (PAYMENTS_ENABLED=true, hors NODE_ENV=test) :
// - vérifie auprès du prestataire les paiements PENDING de plus de 2 min (notification perdue ou en
//   échec), au plus 10 par passage ;
// - annule les réservations impayées après échéance + délai de grâce (sweepUnpaid, qui revérifie
//   d'abord leurs paiements en cours), sans attendre la lecture des listes, avec les e-mails.
// Minuterie non bloquante (unref) ; un passage ne démarre pas tant que le précédent n'est pas fini.
import { sweepUnpaid } from "../../services/bookings.js";
import { reconcilePendingPayments } from "../../services/payments.js";
import { notifyBooking } from "../bookings/bookings.notifications.js";
import { handleSyncOutcome } from "./payments.notifications.js";

export const RECONCILE_INTERVAL_MS = 3 * 60 * 1000;

// Un passage. deps : dépendances de services/payments.js (db, provider, now…) ; log : pino.
export async function runPaymentReconciliation(deps = {}, log) {
  const onSync = (result) => handleSyncOutcome(result, log);
  await reconcilePendingPayments({}, { ...deps, onSync });
  const cancelled = await sweepUnpaid({}, deps.db, deps.now ?? new Date(), { ...deps, onSync });
  for (const id of cancelled) notifyBooking("unpaid", id, log);
  return cancelled;
}

// -> fonction d'arrêt, ou null si désactivé.
export function startPaymentReconciler({ settings, nodeEnv, log, intervalMs = RECONCILE_INTERVAL_MS }) {
  if (!settings?.enabled || nodeEnv === "test") return null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runPaymentReconciliation({}, log);
    } catch (err) {
      log.error({ err }, "[paiement] réconciliation impossible");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
