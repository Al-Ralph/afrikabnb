// ÉCRITURE en base (favoris du compte de démo kofi) : CI uniquement.
import { test, expect } from "./fixtures.js";
import { GUEST_ACCOUNT, LISTINGS, listingCard, loginViaUi, openPage } from "./helpers.js";

const isFavoritesList = (r) => r.url().endsWith("/api/users/me/favorites") && r.request().method() === "GET";

test.describe("Favoris", () => {
  test("un voyageur connecté ajoute un favori, le retrouve dans /favoris puis le retire", async ({ page }) => {
    const target = LISTINGS.capeTown;
    await openPage(page, "/");
    const favoritesLoaded = page.waitForResponse(isFavoritesList);
    await loginViaUi(page, GUEST_ACCOUNT);
    await favoritesLoaded;

    const heart = listingCard(page, target.title).getByRole("button", { name: /favoris$/ });
    // Relance après un échec : repartir d'un état sans ce favori.
    if ((await heart.getAttribute("aria-pressed")) === "true") {
      const removed = page.waitForResponse((r) => r.url().endsWith(`/api/listings/${target.id}/favorite`));
      await heart.click();
      await removed;
    }
    await expect(heart).toHaveAccessibleName("Ajouter aux favoris");

    const added = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${target.id}/favorite`) && r.request().method() === "POST"
    );
    await heart.click();
    expect((await added).ok()).toBe(true);
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(heart).toHaveAccessibleName("Retirer des favoris");

    await page.getByRole("button", { name: /^Menu du compte — / }).click();
    await page.getByRole("link", { name: "Mes favoris" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mes favoris" })).toBeVisible();
    const favorite = page.getByRole("main").getByRole("listitem").filter({ has: page.getByText(target.title, { exact: true }) });
    await expect(favorite).toBeVisible();

    const removed = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${target.id}/favorite`) && r.request().method() === "DELETE"
    );
    await favorite.getByRole("button", { name: "Retirer des favoris" }).click();
    expect((await removed).ok()).toBe(true);
    await expect(favorite).toHaveCount(0);

    // Toujours retiré après rechargement (état serveur, pas seulement local).
    const reloaded = page.waitForResponse(isFavoritesList);
    await page.reload();
    await reloaded;
    await expect(page.getByRole("heading", { level: 1, name: "Mes favoris" })).toBeVisible();
    await expect(page.getByText(target.title, { exact: true })).toHaveCount(0);
  });
});
