// Supabase Storage via son API REST (sans supabase-js). La clé service_role / secret ne quitte
// jamais le serveur : le bucket est public en lecture, les écritures passent par l'API Express.
const TIMEOUT_MS = 15000;

export function createSupabaseStorage({ supabaseUrl, serviceRoleKey, bucket }) {
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const objectUrl = (key) => `${supabaseUrl}/storage/v1/object/${bucket}/${key}`;

  async function call(url, init) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Le corps de réponse ne contient pas la clé ; tronqué pour les logs.
      throw new Error(`Supabase Storage ${res.status} : ${body.slice(0, 300)}`);
    }
    return res;
  }

  return {
    driver: "supabase",
    async put(key, buffer, contentType) {
      await call(objectUrl(key), {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": contentType,
          "Cache-Control": "max-age=31536000",
          "x-upsert": "false",
        },
        body: buffer,
      });
      return { path: key, url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}` };
    },
    async remove(key) {
      await call(objectUrl(key), { method: "DELETE", headers });
    },
  };
}
