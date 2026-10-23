// Fournisseur de paiement selon la configuration (PAYMENT_PROVIDER, validé par src/config/env.js).
import { createCinetPayProvider } from "./cinetpay.js";
import { createFakeProvider } from "./fake.js";

export function createPaymentProvider(settings) {
  if (!settings?.enabled) return null;
  if (settings.provider === "cinetpay") return createCinetPayProvider(settings.cinetpay);
  if (settings.provider === "fake") return createFakeProvider({ apiUrl: settings.apiUrl });
  return null;
}
