// Copie les données de l'ancienne base Supabase (us-west-2) vers la nouvelle base en région UE
// (voir DEPLOY.md, étape 1). Ne crée aucune table : le schéma de la nouvelle base vient des
// migrations versionnées, à appliquer AVANT ce script :
//   DIRECT_URL="$NEW_DATABASE_URL" DATABASE_URL="$NEW_DATABASE_URL" npx prisma migrate deploy
//
// Commandes (Git Bash, depuis backend/) :
//   node scripts/migrate-db-to-eu.mjs check   # lecture seule : comptes par table, migrations,
//                                             # extension unaccent, RLS ; n'écrit nulle part
//   node scripts/migrate-db-to-eu.mjs copy    # copie les données (nouvelle base vide exigée),
//                                             # puis compare les comptes avant/après
//
// Variables (shell uniquement, backend/.env n'est jamais lu) :
//   OLD_DATABASE_URL  ancienne base, connexion 5432 (Session pooler ou directe) + ?sslmode=require
//   NEW_DATABASE_URL  nouvelle base UE, connexion 5432 (Session pooler) + ?sslmode=require
//                     (pas le Transaction pooler 6543 : pg_dump / psql ont besoin d'une session)
//   PG_TOOLS=docker   facultatif : pg_dump / psql exécutés dans l'image Docker PG_IMAGE
//                     (défaut postgres:17) au lieu des outils installés sur le poste
//   OLD_SUPABASE_URL, SUPABASE_URL  facultatif : https://<ref>.supabase.co de l'ancien et du
//                     nouveau projet ; « copy » réécrit alors les URL des photos en base
//                     (copier d'abord les fichiers : scripts/setup-storage.mjs --copy-from-old)
//
// Saisie sans écho (rien dans l'historique du shell) :
//   read -rs OLD_DATABASE_URL && export OLD_DATABASE_URL
//   read -rs NEW_DATABASE_URL && export NEW_DATABASE_URL
//
// Les sessions (RefreshToken) et les liens de réinitialisation (PasswordResetToken) ne sont pas
// copiés : chacun se reconnecte une fois sur le site mis en ligne. Le fichier de copie (données
// personnelles) est écrit dans un dossier temporaire puis supprimé, même en cas d'erreur.
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const NOT_COPIED = ["RefreshToken", "PasswordResetToken"];
const PG_IMAGE = process.env.PG_IMAGE || "postgres:17";
const useDocker = process.env.PG_TOOLS === "docker";
const command = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readUrl(name) {
  const value = process.env[name] || "";
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name} absente ou invalide (postgresql://…). Voir l'en-tête de ce script.`);
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) fail(`${name} doit commencer par postgresql://`);
  if (url.port === "6543") fail(`${name} : utiliser la connexion 5432 (Session pooler), pas le port 6543.`);
  // Paramètres propres à Prisma, inconnus de pg_dump / psql.
  for (const p of ["pgbouncer", "connection_limit", "schema"]) url.searchParams.delete(p);
  return { value: url.toString(), host: url.hostname, user: url.username };
}

const tableList = async (db) =>
  (
    await db.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`
    )
  ).map((r) => r.tablename);

async function countRows(db) {
  const counts = {};
  for (const table of await tableList(db)) {
    const [{ n }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}"`);
    counts[table] = n;
  }
  return counts;
}

// Migrations du dépôt appliquées sans erreur, extension unaccent fonctionnelle, RLS partout.
async function inspectNew(db) {
  const problems = [];
  const expected = readdirSync(new URL("../prisma/migrations/", import.meta.url)).filter((name) =>
    statSync(new URL(`../prisma/migrations/${name}`, import.meta.url)).isDirectory()
  );
  let applied = [];
  try {
    applied = (
      await db.$queryRawUnsafe(
        `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
      )
    ).map((r) => r.migration_name);
  } catch {
    problems.push("table _prisma_migrations absente : lancer `npx prisma migrate deploy` sur la nouvelle base.");
  }
  const missing = expected.filter((m) => !applied.includes(m));
  if (applied.length && missing.length) problems.push(`migrations non appliquées : ${missing.join(", ")}.`);
  try {
    const [{ v }] = await db.$queryRawUnsafe(`SELECT unaccent('Lomé') AS v`);
    if (v !== "Lome") problems.push("unaccent('Lomé') ne renvoie pas « Lome ».");
  } catch {
    problems.push("extension unaccent absente (migration 20261022120000_unaccent) : relancer migrate deploy.");
  }
  const noRls = (
    await db.$queryRawUnsafe(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity AND c.relname <> '_prisma_migrations'`
    )
  ).map((r) => r.relname);
  if (noRls.length) problems.push(`RLS désactivée sur : ${noRls.join(", ")} (voir les migrations).`);
  return problems;
}

function printCounts(oldCounts, newCounts) {
  const tables = [...new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)])].sort();
  console.log("\nTable                  ancienne   nouvelle");
  for (const t of tables) {
    const note = NOT_COPIED.includes(t) ? "  (non copiée)" : "";
    console.log(`${t.padEnd(22)} ${String(oldCounts[t] ?? "-").padStart(8)} ${String(newCounts[t] ?? "-").padStart(10)}${note}`);
  }
  console.log("");
}

// pg_dump / psql : outils locaux, ou image Docker (l'URL passe par l'environnement du
// conteneur, jamais sur la ligne de commande).
function run(tool, args, { url, stdin, stdout }) {
  const [cmd, cmdArgs, env] = useDocker
    ? ["docker", ["run", "--rm", "-i", "-e", "PG_URL", PG_IMAGE, "sh", "-c", `${tool} --dbname="$PG_URL" "$@"`, tool, ...args], { ...process.env, PG_URL: url }]
    : [tool, ["--dbname", url, ...args], process.env];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { env, stdio: [stdin ? "pipe" : "ignore", stdout ? "pipe" : "inherit", "inherit"] });
    child.on("error", (err) =>
      reject(
        new Error(
          err.code === "ENOENT"
            ? `${cmd} introuvable : installer les outils clients PostgreSQL ou utiliser PG_TOOLS=docker (DEPLOY.md).`
            : err.message
        )
      )
    );
    if (stdin) createReadStream(stdin).pipe(child.stdin);
    if (stdout) child.stdout.pipe(createWriteStream(stdout));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${tool} a échoué (code ${code}).`))));
  });
}

if (!["check", "copy"].includes(command)) {
  fail("Usage : node scripts/migrate-db-to-eu.mjs check|copy (voir l'en-tête du script).");
}

const oldUrl = readUrl("OLD_DATABASE_URL");
const newUrl = readUrl("NEW_DATABASE_URL");
if (oldUrl.host === newUrl.host && oldUrl.user === newUrl.user) {
  fail("OLD_DATABASE_URL et NEW_DATABASE_URL désignent la même base : arrêt.");
}

const oldDb = new PrismaClient({ datasourceUrl: oldUrl.value });
const newDb = new PrismaClient({ datasourceUrl: newUrl.value });
let workDir;
try {
  const oldCounts = await countRows(oldDb);
  const newCounts = await countRows(newDb);
  printCounts(oldCounts, newCounts);
  const problems = await inspectNew(newDb);
  for (const p of problems) console.error(`Nouvelle base : ${p}`);
  if (problems.length) throw new Error("Nouvelle base non prête : copie impossible.");
  console.log("Nouvelle base : migrations, unaccent et RLS en ordre.");

  if (command === "copy") {
    const notEmpty = Object.entries(newCounts).filter(([, n]) => n > 0).map(([t]) => t);
    if (notEmpty.length) {
      throw new Error(`La nouvelle base contient déjà des données (${notEmpty.join(", ")}) : copie annulée (aucun doublon).`);
    }
    workDir = mkdtempSync(join(tmpdir(), "afrikabnb-migration-"));
    const dumpFile = join(workDir, "data.sql");
    console.log("Export des données de l'ancienne base (pg_dump --data-only)…");
    await run(
      "pg_dump",
      [
        "--data-only",
        "--schema=public",
        "--exclude-table=public._prisma_migrations",
        ...NOT_COPIED.map((t) => `--exclude-table-data=public."${t}"`),
        "--no-owner",
        "--no-privileges",
      ],
      { url: oldUrl.value, stdout: dumpFile }
    );
    console.log("Import dans la nouvelle base (une seule transaction, contraintes différées)…");
    // session_replication_role = replica : clés étrangères et triggers ignorés pendant l'import
    // (ordre des tables indifférent) ; tout est annulé à la moindre erreur.
    await run(
      "psql",
      ["--single-transaction", "-v", "ON_ERROR_STOP=1", "--quiet", "-c", "SET session_replication_role = replica", "-f", "-"],
      { url: newUrl.value, stdin: dumpFile }
    );

    const oldSupabase = (process.env.OLD_SUPABASE_URL || "").replace(/\/+$/, "");
    const newSupabase = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
    if (oldSupabase && newSupabase && oldSupabase !== newSupabase) {
      const from = `${oldSupabase}/storage/v1/object/public/`;
      const to = `${newSupabase}/storage/v1/object/public/`;
      const images = await newDb.$executeRawUnsafe(
        `UPDATE "ListingImage" SET url = replace(url, $1, $2) WHERE starts_with(url, $1)`, from, to
      );
      const covers = await newDb.$executeRawUnsafe(
        `UPDATE "Listing" SET "imageUrl" = replace("imageUrl", $1, $2) WHERE starts_with("imageUrl", $1)`, from, to
      );
      console.log(`URL des photos réécrites vers le nouveau projet : ${images} image(s), ${covers} couverture(s).`);
    }

    const after = await countRows(newDb);
    printCounts(oldCounts, after);
    const mismatches = Object.keys(oldCounts).filter((t) => !NOT_COPIED.includes(t) && oldCounts[t] !== after[t]);
    if (mismatches.length) throw new Error(`Comptes différents pour : ${mismatches.join(", ")}.`);
    console.log("Copie terminée : comptes identiques pour toutes les tables copiées.");
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  await oldDb.$disconnect();
  await newDb.$disconnect();
}
