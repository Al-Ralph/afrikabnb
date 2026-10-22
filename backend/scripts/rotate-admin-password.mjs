// Génère un nouveau mot de passe pour un compte ADMIN, l'enregistre (haché) en base,
// révoque ses sessions ouvertes et écrit le mot de passe en clair UNIQUEMENT dans backend/.env
// (SEED_ADMIN_PASSWORD). Rien n'est affiché dans la console.
//
// Usage : cd backend && node scripts/rotate-admin-password.mjs [email]
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const email = process.argv[2] || process.env.SEED_ADMIN_EMAIL || "admin@afrikabnb.com";
const ENV_FILE = new URL("../.env", import.meta.url);

const prisma = new PrismaClient();
const password = randomBytes(18).toString("base64url");
const { count } = await prisma.user.updateMany({
  where: { email, role: "ADMIN" },
  data: { password: await bcrypt.hash(password, 12), passwordChangedAt: new Date() },
});
await prisma.$disconnect();

if (count !== 1) {
  console.error(`Aucun compte ADMIN trouvé pour ${email} : rien n'a été modifié.`);
  process.exit(1);
}

const line = `SEED_ADMIN_PASSWORD="${password}"`;
const env = readFileSync(ENV_FILE, "utf8");
const next = /^SEED_ADMIN_PASSWORD=.*$/m.test(env)
  ? env.replace(/^SEED_ADMIN_PASSWORD=.*$/m, line)
  : `${env.replace(/\s*$/, "")}\n\n# Mot de passe du compte admin (généré, ne jamais le publier)\n${line}\n`;
writeFileSync(ENV_FILE, next);
console.log(`Mot de passe de ${email} remplacé et sessions révoquées. Nouveau mot de passe : SEED_ADMIN_PASSWORD dans backend/.env.`);
