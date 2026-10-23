import { readFile } from "node:fs/promises";
import { expect } from "./fixtures.js";

export const DEMO_PASSWORD = "demo1234";
export const GUEST_ACCOUNT = { email: "kofi@afrikabnb.com", password: DEMO_PASSWORD };
export const HOST_ACCOUNT = { email: "host@afrikabnb.com", password: DEMO_PASSWORD };

// Annonces du seed (backend/prisma/seed.js).
export const LISTINGS = {
  lomeBeach: { id: "seed-lome-beach-house", title: "Maison de plage à Lomé" },
  capeTown: { id: "seed-cape-town-villa", title: "Luxurious Villa in Cape Town" },
  abidjanPool: { id: "seed-abidjan-pool-villa", title: "Villa avec piscine à Cocody" },
  // Réservation instantanée, hôte awa (pas kofi).
  nairobi: { id: "seed-nairobi-apartment", title: "Modern Apartment in Nairobi" },
  // Sur demande, hôte awa.
  goree: { id: "seed-goree-house", title: "Maison coloniale à Gorée" },
  // Sur demande, hôte host@afrikabnb.com.
  lagos: { id: "seed-lagos-ikoyi-villa", title: "Villa de prestige à Ikoyi" },
};

// Identifiant unique d'une exécution (horodatage + aléa) : e-mails, titres, noms.
export const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
export const uniqueEmail = (prefix = "e2e") => `${prefix}-${uniqueStamp()}@example.com`;

const pad = (n) => String(n).padStart(2, "0");
const isoDay = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

// Séjour loin dans le futur (5 à ~15 ans, décalage aléatoire au jour près) : aucune collision
// avec le seed ni avec les exécutions précédentes.
export function farFutureStay(nights = 2) {
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 365 * 5 + Math.floor(Math.random() * 365 * 10));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + nights);
  return { checkIn: isoDay(start), checkOut: isoDay(end), nights };
}

// Date au format de l'interface (utils/format.js, formatDay), calculée par le navigateur lui-même.
export function formatDayInPage(page, iso) {
  return page.evaluate((value) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("fr", { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(y, m - 1, d)
    );
  }, iso);
}

// Ouvre une page et ferme le bandeau cookies s'il est affiché (refus par défaut : ni Google Fonts
// ni Google Maps, donc aucune dépendance tierce).
export async function openPage(page, path, { cookies = "refuse" } = {}) {
  await page.goto(path);
  await expect(page.getByRole("link", { name: "AfrikaBnB — accueil" })).toBeVisible();
  const banner = page.getByRole("dialog", { name: "Cookies et traceurs" });
  if (await banner.isVisible()) {
    await banner.getByRole("button", { name: cookies === "accept" ? "Tout accepter" : "Tout refuser" }).click();
    await expect(banner).toBeHidden();
  }
}

export const accountMenuButton = (page) => page.getByRole("button", { name: /^Menu du compte — / });

// Connexion par la fenêtre du header (le formulaire de l'application, pas un appel direct).
export async function loginViaUi(page, { email, password }) {
  await page.getByRole("banner").getByRole("button", { name: "Connexion", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Connexion" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Email" }).fill(email);
  await dialog.getByLabel("Mot de passe", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Se connecter" }).click();
  await expect(dialog).toBeHidden();
  await expect(accountMenuButton(page)).toBeVisible();
}

export async function logoutViaUi(page) {
  await accountMenuButton(page).click();
  const logoutDone = page.waitForResponse(
    (r) => r.url().endsWith("/api/auth/logout") && r.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Déconnexion" }).click();
  expect((await logoutDone).ok()).toBe(true);
  await expect(page.getByRole("banner").getByRole("button", { name: "Connexion", exact: true })).toBeVisible();
}

// Aucun débordement horizontal de la page (contenu plus large que la fenêtre).
export async function expectNoHorizontalOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);
}

// Grille des annonces de l'accueil (section « Séjours à découvrir »).
export const listingsRegion = (page) => page.getByRole("region", { name: "Séjours à découvrir" });
export const listingCards = (page) => listingsRegion(page).getByRole("listitem");
export const listingCard = (page, title) =>
  listingCards(page).filter({ has: page.getByText(title, { exact: true }) });

// Montant affiché ("45 000 F CFA") -> nombre.
export const parseAmount = (text) => Number(String(text).replace(/[^\d]/g, ""));

// Lien de réinitialisation envoyé à `email` dans la sortie du backend (EMAIL_DRIVER=console,
// logs JSON pino : NODE_ENV=test). Fichier indiqué par E2E_BACKEND_LOG (CI).
export async function findResetLinkInBackendLog(email) {
  const file = process.env.E2E_BACKEND_LOG;
  if (!file) return null;
  const content = await readFile(file, "utf8").catch(() => "");
  let link = null;
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.to !== email || typeof entry.msg !== "string") continue;
    const match = entry.msg.match(/https?:\/\/[^\s"]+\/reinitialiser-mot-de-passe\?token=[A-Za-z0-9_%-]+/);
    if (match) link = match[0];
  }
  return link;
}
