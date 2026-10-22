// Connexions (sessions écrites en base) : CI uniquement. Le compte ADMIN n'existe que si le seed a
// reçu SEED_ADMIN_PASSWORD (jamais le mot de passe de démo) ; le workflow CI en génère un.
import { test, expect } from "./fixtures.js";
import { GUEST_ACCOUNT, loginViaUi, openPage } from "./helpers.js";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@afrikabnb.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

test.describe("Administration", () => {
  test.skip(!ADMIN_PASSWORD, "SEED_ADMIN_PASSWORD non défini : pas de compte administrateur dans la base");

  test("un administrateur accède à /admin", async ({ page }) => {
    await openPage(page, "/admin");
    await loginViaUi(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await expect(page.getByRole("heading", { level: 1, name: "Administration" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Vue d’ensemble" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Utilisateurs" }).click();
    await expect(page).toHaveURL(/[?&]tab=users/);
    const search = page.getByRole("search");
    await search.getByLabel("Rechercher un utilisateur").fill("kofi");
    await search.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByRole("tabpanel").getByRole("row", { name: /Kofi Mensah/ })).toContainText(GUEST_ACCOUNT.email);

    await page.getByRole("button", { name: /^Menu du compte — / }).click();
    await expect(page.getByRole("link", { name: "Administration" })).toBeVisible();
  });

  test("un voyageur connecté non administrateur voit « Accès réservé »", async ({ page }) => {
    await openPage(page, "/admin");
    await loginViaUi(page, GUEST_ACCOUNT);
    await expect(page.getByRole("heading", { level: 1, name: "Accès réservé" })).toBeVisible();
    await expect(page.getByText("Cet espace est réservé aux administrateurs d’AfrikaBnB.")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Utilisateurs" })).toHaveCount(0);
  });
});
