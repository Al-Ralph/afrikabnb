import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  // LOG_SQL=1 : journalise toutes les requêtes SQL (très verbeux, à réserver au débogage).
  log: process.env.LOG_SQL === "1" ? ["query", "error", "warn"] : ["error"],
});

export default prisma;
