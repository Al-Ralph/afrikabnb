// Provider Resend (https://resend.com/docs/api-reference/emails/send-email), via fetch.
const TIMEOUT_MS = 10000;

export function createResendProvider({ apiKey, from }) {
  return {
    name: "resend",
    async send({ to, subject, text, html }) {
      if (!apiKey) throw new Error("RESEND_API_KEY absente : email non envoyé");
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Resend ${res.status} : ${body?.message || body?.name || "erreur"}`);
      return { id: body.id ?? null };
    },
  };
}
