// Prépare Supabase Storage pour la mise en ligne (voir DEPLOY.md, étape 1) :
//   1. crée le bucket PUBLIC des photos (listing-images par défaut), ou le rend public s'il existe
//      déjà : relançable sans risque (idempotent) ;
//   2. avec --copy-from-old : copie aussi les photos de l'ancien projet Supabase vers le nouveau
//      (les fichiers déjà présents sont ignorés, donc relançable également).
//
// Lit UNIQUEMENT les variables de la ligne de commande / du shell, jamais backend/.env (qui
// pointe vers l'ancien projet) : impossible de viser le mauvais projet par accident.
//
// Usage (Git Bash, depuis backend/) — ne jamais coller les clés dans un fichier versionné :
//   export SUPABASE_URL="https://<ref-nouveau-projet>.supabase.co"
//   read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY   # saisie masquée
//   node scripts/setup-storage.mjs
//
//   # Copie des photos de l'ancien projet (facultatif) :
//   export OLD_SUPABASE_URL="https://<ref-ancien-projet>.supabase.co"
//   read -rs OLD_SUPABASE_SERVICE_ROLE_KEY && export OLD_SUPABASE_SERVICE_ROLE_KEY
//   node scripts/setup-storage.mjs --copy-from-old
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (nouveau projet, obligatoires),
// SUPABASE_STORAGE_BUCKET (défaut listing-images), OLD_SUPABASE_URL et
// OLD_SUPABASE_SERVICE_ROLE_KEY (ancien projet, seulement avec --copy-from-old).
// Aucune clé n'est jamais affichée.

const TIMEOUT_MS = 30000;
// Photos produites par l'API : WebP (sharp), au plus 1600 px ; 5 Mo de marge.
const BUCKET_OPTIONS = {
  public: true,
  file_size_limit: 5 * 1024 * 1024,
  allowed_mime_types: ["image/webp", "image/jpeg", "image/png"],
};

const stripSlash = (url) => (url || "").replace(/\/+$/, "");
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "listing-images";
const copyFromOld = process.argv.includes("--copy-from-old");

function project(urlVar, keyVar) {
  const url = stripSlash(process.env[urlVar]);
  const key = process.env[keyVar] || "";
  const missing = [];
  if (!/^https:\/\/[^/]+$/.test(url)) missing.push(`${urlVar} (https://<ref>.supabase.co)`);
  if (!key) missing.push(keyVar);
  if (missing.length) {
    console.error(`Variables manquantes : ${missing.join(", ")}. Voir l'en-tête de ce script.`);
    process.exit(1);
  }
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

async function call(target, path, init = {}) {
  const res = await fetch(`${target.url}/storage/v1${path}`, {
    ...init,
    headers: { ...target.headers, ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Storage ${init.method || "GET"} ${path} → ${res.status} : ${body.slice(0, 300)}`);
  }
  return res;
}

const json = (body) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function ensureBucket(target) {
  const buckets = await (await call(target, "/bucket")).json();
  const existing = buckets.find((b) => b.id === bucket);
  if (!existing) {
    await call(target, "/bucket", { method: "POST", ...json({ id: bucket, name: bucket, ...BUCKET_OPTIONS }) });
    console.log(`Bucket « ${bucket} » créé (public).`);
  } else if (!existing.public) {
    await call(target, `/bucket/${bucket}`, { method: "PUT", ...json({ id: bucket, ...BUCKET_OPTIONS }) });
    console.log(`Bucket « ${bucket} » existant, rendu public.`);
  } else {
    console.log(`Bucket « ${bucket} » déjà présent et public : rien à faire.`);
  }
}

// Liste récursive des fichiers du bucket (les dossiers ont id === null).
async function listAll(target, prefix = "") {
  const files = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const res = await call(target, `/object/list/${bucket}`, {
      method: "POST",
      ...json({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }),
    });
    const entries = await res.json();
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listAll(target, path)));
      else files.push({ path, contentType: entry.metadata?.mimetype || "application/octet-stream" });
    }
    if (entries.length < limit) return files;
  }
}

async function copyObjects(source, target) {
  const sourceFiles = await listAll(source);
  const existing = new Set((await listAll(target)).map((f) => f.path));
  let copied = 0;
  for (const file of sourceFiles) {
    if (existing.has(file.path)) continue;
    const data = await (await call(source, `/object/${bucket}/${file.path}`)).arrayBuffer();
    await call(target, `/object/${bucket}/${file.path}`, {
      method: "POST",
      headers: { "Content-Type": file.contentType, "Cache-Control": "max-age=31536000", "x-upsert": "false" },
      body: Buffer.from(data),
    });
    copied += 1;
  }
  const after = await listAll(target);
  const missing = sourceFiles.filter((f) => !after.some((a) => a.path === f.path));
  console.log(
    `Photos : ${sourceFiles.length} dans l'ancien projet, ${copied} copiée(s), ${after.length} dans le nouveau.`
  );
  if (missing.length) {
    console.error(`${missing.length} photo(s) absente(s) du nouveau projet : relancer le script.`);
    process.exit(1);
  }
}

const target = project("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
try {
  await ensureBucket(target);
  if (copyFromOld) {
    const source = project("OLD_SUPABASE_URL", "OLD_SUPABASE_SERVICE_ROLE_KEY");
    if (source.url === target.url) {
      console.error("OLD_SUPABASE_URL et SUPABASE_URL désignent le même projet : copie annulée.");
      process.exit(1);
    }
    await copyObjects(source, target);
    console.log(
      "Pensez à réécrire les URL des photos en base : scripts/migrate-db-to-eu.mjs copy le fait si OLD_SUPABASE_URL et SUPABASE_URL sont définies."
    );
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
