import * as paymentsService from "../../services/payments.js";
import { isTransactionIdFormat } from "../../utils/payment.js";
import { escapeHtml, formatAmount } from "../../services/email/templates.js";
import { handleSyncOutcome } from "./payments.notifications.js";

export { handleSyncOutcome };

const returnPath = (appUrl, tx) =>
  `${appUrl}/paiement/retour${isTransactionIdFormat(tx) ? `?tx=${encodeURIComponent(tx)}` : ""}`;

// deps : { settings, provider, db, appUrl }.
export function createPaymentsController({ settings, provider, db, appUrl }) {
  const deps = { settings, provider, db };

  async function start(req, res, next, access) {
    try {
      const view = await paymentsService.startPayment(
        { ...access, lang: req.body?.lang },
        { ...deps, onSync: (result) => handleSyncOutcome(result, req.log) }
      );
      res.set("Cache-Control", "no-store");
      res.status(view.reused ? 200 : 201).json(view);
    } catch (err) {
      if (err.providerError) req.log.error({ provider: provider?.name, ...err.providerError }, "[paiement] initialisation refusée");
      next(err);
    }
  }

  return {
    // POST /api/bookings/:id/payments
    startForUser: (req, res, next) => start(req, res, next, { bookingId: req.params.id, user: req.user }),

    // POST /api/guest-bookings/:token/payments
    startForGuest: (req, res, next) => start(req, res, next, { guestToken: req.params.token }),

    // GET /api/payments/:transactionId/status
    async status(req, res, next) {
      try {
        const { view, sync } = await paymentsService.getPaymentStatus({ transactionId: req.params.transactionId }, deps);
        if (sync) handleSyncOutcome(sync, req.log);
        res.json(view);
      } catch (err) {
        next(err);
      }
    },

    // GET|POST /api/payments/return?tx=… : retour du navigateur, redirection seulement (la page de
    // retour interroge ensuite /status ; aucun statut n'est déduit de cette requête).
    returnRedirect(req, res) {
      const tx = req.query.tx ?? req.body?.transaction_id;
      res.redirect(303, returnPath(appUrl, typeof tx === "string" ? tx : ""));
    },

    // POST /api/payments/cinetpay/notify (application/x-www-form-urlencoded, en-tête x-token).
    // 200 seulement une fois la notification traitée (ou sans objet) ; 503 si la vérification auprès
    // du prestataire échoue, pour que CinetPay renvoie la notification (vérification bornée par le
    // délai d'attente du client CinetPay, 10 s).
    async cinetpayNotify(req, res) {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (!provider.verifyNotification(body, req.get("x-token"))) {
        req.log.warn({ transactionId: String(body.cpm_trans_id || "").slice(0, 64) }, "[paiement] notification rejetée (x-token invalide)");
        return res.status(401).json({ error: "Signature invalide" });
      }
      const transactionId = String(body.cpm_trans_id || "");
      try {
        const result = await paymentsService.syncPayment({ transactionId, siteId: body.cpm_site_id ?? "" }, deps);
        handleSyncOutcome(result, req.log);
        res.status(200).json({ received: true });
      } catch (err) {
        handleSyncOutcome({ outcome: "error", transactionId: transactionId.slice(0, 64), error: err }, req.log);
        res.status(503).json({ error: "Vérification du paiement momentanément impossible, réessayez" });
      }
    },

    // GET /api/payments/fake/:transactionId : page de paiement simulée (sans JavaScript).
    async fakePage(req, res, next) {
      try {
        const payment = await paymentsService.getFakePayment({ transactionId: req.params.transactionId }, deps);
        const tx = escapeHtml(payment.transactionId);
        const appOrigin = new URL(appUrl).origin;
        res.set({
          "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self' ${appOrigin}; base-uri 'none'; frame-ancestors 'none'`,
          "Cache-Control": "no-store",
        });
        res.type("html").send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paiement simulé – AfrikaBnB</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#1d2b25;">
<h1 style="font-size:22px;">Paiement simulé (développement)</h1>
<p>Aucun paiement réel : cette page remplace le guichet CinetPay hors production.</p>
<p>Montant : <strong data-testid="fake-amount">${escapeHtml(formatAmount(payment.amount, payment.currency))}</strong></p>
<p style="font-size:12px;color:#5b6b64;">Transaction ${tx} — statut ${escapeHtml(payment.status)}</p>
<form method="post" action="/api/payments/fake/${tx}/simulate">
<input type="hidden" name="outcome" value="accepted">
<button type="submit" style="padding:12px 18px;margin:8px 0;">Simuler un paiement accepté</button>
</form>
<form method="post" action="/api/payments/fake/${tx}/simulate">
<input type="hidden" name="outcome" value="refused">
<button type="submit" style="padding:12px 18px;margin:8px 0;">Simuler un paiement refusé</button>
</form>
</body></html>`);
      } catch (err) {
        next(err);
      }
    },

    // POST /api/payments/fake/:transactionId/simulate (outcome=accepted|refused).
    async fakeSimulate(req, res, next) {
      try {
        const result = await paymentsService.simulateFakePayment(
          { transactionId: req.params.transactionId, outcome: req.body?.outcome },
          deps
        );
        handleSyncOutcome(result, req.log);
        res.redirect(303, returnPath(appUrl, req.params.transactionId));
      } catch (err) {
        next(err);
      }
    },
  };
}
