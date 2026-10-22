// ÉCRITURE en base (création de compte, sessions) : CI uniquement, jamais contre la base partagée.
import { test, expect } from "./fixtures.js";
import { accountMenuButton, logoutViaUi, openPage, uniqueEmail } from "./helpers.js";

const JWT_RE = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

async function webStorageDump(page) {
  return page.evaluate(() => {
    const dump = (storage) => Object.keys(storage).map((key) => `${key}=${storage.getItem(key)}`);
    return { local: dump(window.localStorage), session: dump(window.sessionStorage) };
  });
}

test.describe("Compte et session", () => {
  test("inscription, session restaurée par le cookie httpOnly, puis déconnexion définitive", async ({ page, context }) => {
    const email = uniqueEmail();
    const name = "Voyageur E2E";
    await openPage(page, "/");

    await page.getByRole("banner").getByRole("button", { name: "Connexion", exact: true }).click();
    const loginDialog = page.getByRole("dialog", { name: "Connexion" });
    await loginDialog.getByRole("button", { name: "S'inscrire" }).click();
    const dialog = page.getByRole("dialog", { name: "Inscription" });
    await dialog.getByRole("textbox", { name: "Nom (optionnel)" }).fill(name);
    await dialog.getByRole("textbox", { name: "Email" }).fill(email);
    await dialog.getByLabel("Mot de passe", { exact: true }).fill(`E2e-${Date.now()}-mdp`);
    await dialog.getByRole("checkbox", { name: /J’accepte les/ }).check();
    const registered = page.waitForResponse((r) => r.url().endsWith("/api/auth/register"));
    await dialog.getByRole("button", { name: "S'inscrire" }).click();
    expect((await registered).status()).toBe(201);
    await expect(dialog).toBeHidden();
    await expect(accountMenuButton(page)).toHaveAccessibleName(`Menu du compte — ${name}`);

    // Cookie de renouvellement httpOnly posé par l'API, aucun jeton lisible par le JavaScript.
    const refreshCookie = (await context.cookies()).find((c) => c.name === "afrikabnb_rt");
    expect(refreshCookie, "cookie afrikabnb_rt").toBeDefined();
    expect(refreshCookie.httpOnly).toBe(true);
    expect(refreshCookie.path).toBe("/api/auth");

    const restored = page.waitForResponse((r) => r.url().endsWith("/api/auth/refresh"));
    await page.reload();
    expect((await restored).status()).toBe(200);
    await expect(accountMenuButton(page)).toHaveAccessibleName(`Menu du compte — ${name}`);

    const storage = await webStorageDump(page);
    for (const entry of [...storage.local, ...storage.session]) {
      expect(entry, "aucun JWT dans le stockage web").not.toMatch(JWT_RE);
      expect(entry.split("=")[0], "aucune clé de jeton dans le stockage web").not.toMatch(/token/i);
    }

    await logoutViaUi(page);
    const refused = page.waitForResponse((r) => r.url().endsWith("/api/auth/refresh"));
    await page.reload();
    expect((await refused).status()).toBe(401);
    await expect(page.getByRole("banner").getByRole("button", { name: "Connexion", exact: true })).toBeVisible();
    await expect(accountMenuButton(page)).toHaveCount(0);
  });
});
