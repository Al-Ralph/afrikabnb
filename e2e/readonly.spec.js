// Parcours en lecture seule : aucune écriture en base (seuls des GET de l'API, plus l'appel
// /api/auth/refresh sans cookie que l'application fait à chaque chargement). Exécutables en local
// contre la base de développement partagée : npm run e2e:readonly
import { test, expect } from "./fixtures.js";
import {
  LISTINGS,
  expectNoHorizontalOverflow,
  listingCard,
  listingCards,
  listingsRegion,
  openPage,
  parseAmount,
} from "./helpers.js";

// Annonce du seed avec 4 photos et 7 équipements (seed.js : index 2).
const GALLERY_LISTING = { id: "seed-dakar-seaside-villa", title: "Seaside Villa in Dakar" };

test.describe("Lecture seule", { tag: "@readonly" }, () => {
  test("l'accueil affiche le titre et des cartes d'annonces sans erreur console", async ({ page, consoleErrors }) => {
    await openPage(page, "/");
    await expect(page.getByRole("heading", { level: 1, name: "Des séjours d'exception, partout en Afrique." })).toBeVisible();
    await expect(listingsRegion(page).getByRole("heading", { name: "Séjours à découvrir" })).toBeVisible();
    await expect(listingCards(page).first()).toBeVisible();
    await expect(listingsRegion(page).getByText(/^\d+ logements?$/)).toBeVisible();
    await expect(listingCards(page).first().getByRole("link").first()).toHaveAttribute("href", /^\/property\//);
    expect(consoleErrors).toEqual([]);
  });

  test("le choix du bandeau cookies est mémorisé après rechargement", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: "Cookies et traceurs" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Tout accepter" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner).toBeHidden();
  });

  test("la recherche « Lome » sans accent trouve les logements de Lomé", async ({ page }) => {
    await openPage(page, "/");
    await page.getByRole("textbox", { name: /^Destination/ }).fill("Lome");
    const results = page.waitForResponse((r) => /\/api\/listings\?.*where=Lome/.test(r.url()) && r.ok());
    await page.getByRole("button", { name: "Rechercher" }).click();
    await results;
    await expect(page).toHaveURL(/[?&]where=Lome(&|$)/);
    await expect(listingCard(page, LISTINGS.lomeBeach.title)).toBeVisible();
    await expect(listingCards(page).first()).toContainText("Lomé");
    await expect(listingCard(page, LISTINGS.capeTown.title)).toHaveCount(0);
  });

  test("le filtre par catégorie ne garde que la catégorie choisie", async ({ page }) => {
    await openPage(page, "/");
    await expect(listingCard(page, LISTINGS.capeTown.title)).toBeVisible();
    const category = page.getByRole("button", { name: "Bord de mer", exact: true });
    await expect(category).toHaveAttribute("aria-pressed", "false");
    await category.click();
    await expect(category).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/[?&]categoryId=bord-mer(&|$)/);
    await expect(listingCard(page, LISTINGS.lomeBeach.title)).toBeVisible();
    await expect(listingCard(page, LISTINGS.capeTown.title)).toHaveCount(0);
  });

  test("le panneau Filtres filtre par équipement et le tri par prix croissant ordonne les cartes", async ({ page }) => {
    await openPage(page, "/");
    await expect(listingCards(page).first()).toBeVisible();
    await page.getByRole("button", { name: /^Filtres/ }).click();
    const dialog = page.getByRole("dialog", { name: "Filtres" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("checkbox", { name: "Piscine" }).check();
    await dialog.getByRole("button", { name: "Afficher les logements" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/[?&]amenities=POOL(&|$)/);
    await expect(page.getByRole("button", { name: /^Filtres.*1 filtre actif/ })).toBeVisible();
    await expect(listingCard(page, LISTINGS.abidjanPool.title)).toBeVisible();
    await expect(listingCard(page, LISTINGS.lomeBeach.title)).toHaveCount(0);

    const sorted = page.waitForResponse((r) => /\/api\/listings\?.*sort=price_asc/.test(r.url()) && r.ok());
    await page.getByRole("combobox", { name: "Trier par" }).selectOption("price_asc");
    await sorted;
    await expect(page).toHaveURL(/[?&]sort=price_asc(&|$)/);
    await expect(listingCard(page, LISTINGS.abidjanPool.title)).toBeVisible();
    const prices = (await listingCards(page).getByText(/nuit$/).allTextContents()).map(parseAmount);
    expect(prices.length).toBeGreaterThan(1);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test("la fiche logement affiche la galerie, la visionneuse au clavier et les équipements", async ({ page, consoleErrors }) => {
    await openPage(page, `/property/${GALLERY_LISTING.id}`);
    await expect(page.getByRole("heading", { level: 1, name: GALLERY_LISTING.title })).toBeVisible();

    const firstPhoto = page.getByRole("button", { name: /^Agrandir la photo 1 sur \d+$/ });
    const total = Number((await firstPhoto.getAttribute("aria-label")).match(/sur (\d+)$/)[1]);
    expect(total).toBeGreaterThan(1);
    await firstPhoto.click();

    const viewer = page.getByRole("dialog", { name: `Photos : ${GALLERY_LISTING.title}` });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByText(`1 / ${total}`)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText(`2 / ${total}`)).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByText(`${total} / ${total}`)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(firstPhoto).toBeFocused();

    const amenities = page.getByRole("region", { name: "Ce que propose ce logement" });
    await expect(amenities.getByRole("listitem").first()).toBeVisible();
    const showAll = amenities.getByRole("button", { name: /^Voir les \d+ équipements$/ });
    const count = Number((await showAll.textContent()).match(/\d+/)[0]);
    await showAll.click();
    const modal = page.getByRole("dialog", { name: "Ce que propose ce logement" });
    await expect(modal.getByRole("listitem")).toHaveCount(count);
    await modal.getByRole("button", { name: "Fermer" }).click();
    await expect(modal).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });

  test("la page /carte se charge avec la liste des logements", async ({ page }) => {
    await openPage(page, "/carte");
    await expect(page.getByRole("heading", { level: 1, name: "Explorer sur la carte" })).toBeVisible();
    // Cookies refusés : pas de Google Maps, liste de repli.
    await expect(page.getByText(/La carte Google Maps n’est chargée qu’avec votre accord/)).toBeVisible();
    const list = page.getByRole("region", { name: "Logements" });
    await expect(list.getByRole("link").first()).toBeVisible();
    await expect(list.getByRole("link", { name: new RegExp(LISTINGS.lomeBeach.title) })).toHaveAttribute(
      "href",
      `/property/${LISTINGS.lomeBeach.id}`
    );
  });

  test("le sélecteur de devise convertit les prix en euros puis revient en automatique", async ({ page }) => {
    await openPage(page, "/");
    const card = listingCard(page, LISTINGS.lomeBeach.title);
    const price = card.getByText(/nuit$/);
    await expect(price).toContainText("F CFA");

    const trigger = page.getByRole("button", { name: /^Devise d'affichage — / });
    await expect(trigger).toHaveAccessibleName(/\(XOF\)$/);
    await trigger.click();
    const panel = page.getByRole("group", { name: "Choisir la devise" });
    await expect(panel.getByRole("button", { name: /^Automatique/ })).toHaveAttribute("aria-pressed", "true");
    await panel.getByRole("button", { name: /· EUR$/ }).click();
    await expect(panel).toBeHidden();
    await expect(trigger).toHaveAccessibleName(/\(EUR\)$/);
    await expect(price).toHaveText(/^≈\s.*€/);

    await trigger.click();
    await panel.getByRole("button", { name: /^Automatique/ }).click();
    await expect(trigger).toHaveAccessibleName(/\(XOF\)$/);
    await expect(price).toContainText("F CFA");
    await expect(price).not.toContainText("≈");
  });

  test("le changement de langue traduit l'interface", async ({ page }) => {
    await openPage(page, "/");
    await page.getByRole("button", { name: "Langue" }).click();
    await page.getByRole("menuitem", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Exceptional stays, all across Africa." })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: "Log in", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("menuitem", { name: "Français" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("banner").getByRole("button", { name: "Connexion", exact: true })).toBeVisible();
  });

  test("les pages légales sont accessibles depuis le pied de page", async ({ page }) => {
    await openPage(page, "/");
    const pages = [
      ["Mentions légales", "Mentions légales"],
      ["Confidentialité", "Politique de confidentialité"],
      ["Cookies", "Cookies et traceurs"],
      ["CGU", "Conditions générales d’utilisation"],
    ];
    for (const [link, heading] of pages) {
      await page.getByRole("contentinfo").getByRole("link", { name: link, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });

  test("une adresse inconnue affiche la page 404", async ({ page }) => {
    await openPage(page, "/cette-page-n-existe-pas");
    await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
    await page.getByRole("link", { name: "Retour à l’accueil" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Des séjours d'exception, partout en Afrique." })).toBeVisible();
  });

  test("le mode sombre s'applique, persiste et ne provoque pas d'erreur console", async ({ page, consoleErrors }) => {
    await openPage(page, "/");
    await page.getByRole("button", { name: /^Thème : / }).click();
    await page.getByRole("group", { name: "Thème d’affichage" }).getByRole("button", { name: "Sombre" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Thème : Sombre" })).toBeVisible();

    await listingCard(page, LISTINGS.lomeBeach.title).getByRole("link").first().click();
    await expect(page.getByRole("heading", { level: 1, name: LISTINGS.lomeBeach.title })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: LISTINGS.lomeBeach.title })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(consoleErrors).toEqual([]);
  });

  test("l'administration est réservée : un visiteur voit « Accès réservé »", async ({ page }) => {
    await openPage(page, "/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Accès réservé" })).toBeVisible();
    await expect(page.getByText("Connectez-vous avec un compte administrateur")).toBeVisible();
  });
});

test.describe("Mobile (390 px)", { tag: ["@readonly", "@mobile"] }, () => {
  test("l'accueil ne déborde pas horizontalement et n'affiche pas d'erreur console", async ({ page, consoleErrors }) => {
    await openPage(page, "/");
    await expect(listingCards(page).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
  });

  test("la fiche logement ne déborde pas horizontalement et affiche le carrousel", async ({ page, consoleErrors }) => {
    await openPage(page, `/property/${GALLERY_LISTING.id}`);
    await expect(page.getByRole("heading", { level: 1, name: GALLERY_LISTING.title })).toBeVisible();
    await expect(page.getByRole("region", { name: "Photos du logement" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
  });
});
