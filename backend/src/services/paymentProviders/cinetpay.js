// Client CinetPay API Checkout v2 (https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation,
// …/verification, …/notification, …/hmac). Les clés ne quittent jamais le serveur ; aucune donnée
// personnelle du voyageur n'est transmise (canal Mobile Money : champs client non requis).
import { computeCinetPayToken, normalizeProviderStatus, verifyCinetPayToken } from "../../utils/payment.js";

export const CINETPAY_API_BASE = "https://api-checkout.cinetpay.com/v2";
// Borne le temps de réponse à la notification (traitée avant de répondre à CinetPay).
const TIMEOUT_MS = 10000;

function providerError(message, details) {
  return Object.assign(new Error(message), { provider: "cinetpay", details });
}

export function createCinetPayProvider({ apiKey, siteId, secretKey, fetchImpl = globalThis.fetch, baseUrl = CINETPAY_API_BASE }) {
  async function post(path, body) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      throw Object.assign(providerError("CinetPay injoignable"), { cause });
    }
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") throw providerError(`Réponse CinetPay illisible (HTTP ${res.status})`);
    return data;
  }

  return {
    name: "cinetpay",
    siteId: String(siteId),

    // POST /v2/payment -> { paymentUrl, providerRef (payment_token) }. Succès : code "201" (CREATED).
    async initPayment({ transactionId, amount, currency, description, notifyUrl, returnUrl, lang, metadata }) {
      const data = await post("/payment", {
        apikey: apiKey,
        site_id: String(siteId),
        transaction_id: transactionId,
        amount,
        currency,
        description,
        notify_url: notifyUrl,
        return_url: returnUrl,
        channels: "MOBILE_MONEY",
        lang: lang === "en" ? "en" : "fr",
        metadata,
      });
      const paymentUrl = data?.data?.payment_url;
      if (String(data.code) !== "201" || typeof paymentUrl !== "string" || !/^https:\/\//.test(paymentUrl)) {
        throw providerError("Initialisation CinetPay refusée", { code: data.code, message: data.message, description: data.description });
      }
      return { paymentUrl, providerRef: data.data.payment_token ? String(data.data.payment_token) : null };
    },

    // POST /v2/payment/check -> statut réel de la transaction (seule source de vérité).
    async checkPayment(transactionId) {
      const data = await post("/payment/check", { apikey: apiKey, site_id: String(siteId), transaction_id: transactionId });
      const d = data.data;
      if (!d || typeof d !== "object") {
        throw providerError("Vérification CinetPay sans données", { code: data.code, message: data.message });
      }
      return {
        status: normalizeProviderStatus(d.status),
        rawStatus: d.status ? String(d.status).slice(0, 100) : String(data.message || "").slice(0, 100),
        amount: d.amount != null && d.amount !== "" ? Number(d.amount) : null,
        currency: d.currency ? String(d.currency).toUpperCase() : null,
        method: d.payment_method ? String(d.payment_method).slice(0, 50) : null,
        operatorId: d.operator_id ? String(d.operator_id).slice(0, 255) : null,
        code: data.code != null ? String(data.code) : null,
      };
    },

    // En-tête x-token de la notification (HMAC-SHA256 des champs du corps, clé secrète).
    verifyNotification(body, token) {
      return verifyCinetPayToken(body, token, secretKey);
    },

    computeToken(body) {
      return computeCinetPayToken(body, secretKey);
    },
  };
}
