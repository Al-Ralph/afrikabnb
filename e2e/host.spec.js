// ÉCRITURE en base et dans le stockage des photos (annonce créée puis supprimée) : CI uniquement.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./fixtures.js";
import { HOST_ACCOUNT, loginViaUi, openPage, uniqueStamp } from "./helpers.js";

const PHOTO = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "photo.png");

test.describe("Espace hôte", () => {
  test("création d'une annonce avec photo, visible dans « Mes annonces », puis suppression", async ({ page }) => {
    const title = `Case E2E ${uniqueStamp()}`;
    await openPage(page, "/host");
    await expect(page.getByRole("heading", { level: 1, name: "Devenez hôte sur AfrikaBnB" })).toBeVisible();
    await loginViaUi(page, HOST_ACCOUNT);
    await expect(page.getByRole("heading", { level: 1, name: "Mon espace hôte" })).toBeVisible();

    // Bouton de l'en-tête de l'espace hôte (le tableau de bord vide en affiche un second).
    await page.getByRole("button", { name: "Nouvelle annonce" }).first().click();
    await expect(page.getByRole("tab", { name: "Mes annonces" })).toHaveAttribute("aria-selected", "true");
    const form = page.getByRole("form", { name: "Publier une annonce" });
    await form.getByLabel("Titre *").fill(title);
    await form.getByLabel("Description").fill("Annonce créée par les tests de bout en bout.");
    await form.getByLabel("Ville *").fill("Aného, Togo");
    await form.getByLabel("Latitude").fill("6.2280");
    await form.getByLabel("Longitude").fill("1.5919");
    await form.getByLabel("Prix par nuit *").fill("25000");
    await form.getByLabel("Voyageurs max.").fill("3");
    await form.getByLabel("Chambres").fill("1");
    await form.getByLabel("Catégorie").selectOption("bord-mer");

    await form.getByLabel("Ajouter des photos").setInputFiles(PHOTO);
    const photos = form.getByRole("list", { name: "Photos de l’annonce, dans l’ordre d’affichage" });
    await expect(photos.getByRole("listitem")).toHaveCount(1);
    await expect(photos.getByText("Envoyée à la publication")).toBeVisible();

    const created = page.waitForResponse((r) => r.url().endsWith("/api/listings") && r.request().method() === "POST");
    const uploaded = page.waitForResponse((r) => /\/api\/listings\/[^/]+\/images$/.test(r.url()) && r.request().method() === "POST");
    await form.getByRole("button", { name: "Publier", exact: true }).click();
    expect((await created).status()).toBe(201);
    expect((await uploaded).status()).toBe(201);
    await expect(page.getByRole("status").filter({ hasText: "Votre annonce est publiée." })).toBeVisible();
    await expect(form).toBeHidden();

    const myListings = page.getByRole("region", { name: "Mes annonces" });
    const item = myListings.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });
    await expect(item).toHaveCount(1);
    // Photo téléversée : couverture servie par l'API (stockage local en CI).
    await expect(item.locator("img")).toHaveAttribute("src", /\/uploads\//);

    const deleted = page.waitForResponse((r) => /\/api\/listings\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE");
    await item.getByRole("button", { name: "Supprimer" }).click();
    await item.getByRole("group", { name: "Supprimer définitivement cette annonce ?" }).getByRole("button", { name: "Oui, confirmer" }).click();
    expect((await deleted).ok()).toBe(true);
    await expect(page.getByRole("status").filter({ hasText: "Annonce supprimée." })).toBeVisible();
    await expect(item).toHaveCount(0);
  });
});
