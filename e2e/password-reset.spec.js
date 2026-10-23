// ÉCRITURE en base (compte de test, jeton de réinitialisation) : CI uniquement.
import { test, expect } from "./fixtures.js";
import { findResetLinkInBackendLog, loginViaUi, openPage, uniqueEmail } from "./helpers.js";

const NEUTRAL_MESSAGE = "Si un compte existe pour cette adresse, un e-mail contenant un lien de réinitialisation vient d'être envoyé.";

async function registerAccount(request, apiHeaders, email, password) {
  const response = await request.post("/api/auth/register", {
    headers: apiHeaders,
    data: { email, password, name: "Mot De Passe Oublié" },
  });
  expect(response.status(), await response.text()).toBe(201);
}

async function requestResetViaUi(page, email) {
  await page.getByRole("banner").getByRole("button", { name: "Connexion", exact: true }).click();
  await page.getByRole("dialog", { name: "Connexion" }).getByRole("button", { name: "Mot de passe oublié ?" }).click();
  const dialog = page.getByRole("dialog", { name: "Mot de passe oublié" });
  await dialog.getByRole("textbox", { name: "Email" }).fill(email);
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/auth/forgot-password"));
  await dialog.getByRole("button", { name: "Envoyer le lien" }).click();
  expect((await sent).ok()).toBe(true);
  await expect(dialog.getByRole("status")).toContainText(NEUTRAL_MESSAGE);
  return dialog;
}

test.describe("Mot de passe oublié", () => {
  test("la demande affiche le même message neutre pour une adresse inconnue", async ({ page }) => {
    await openPage(page, "/");
    await requestResetViaUi(page, uniqueEmail("e2e-inconnu"));
  });

  test("le lien reçu par e-mail permet de choisir un nouveau mot de passe", async ({ page, request, apiHeaders }) => {
    test.skip(
      !process.env.E2E_BACKEND_LOG,
      "E2E_BACKEND_LOG absent : la sortie du backend (EMAIL_DRIVER=console) n'est lisible qu'en CI"
    );
    const email = uniqueEmail("e2e-reset");
    const newPassword = `Nouveau-${Date.now()}`;
    await registerAccount(request, apiHeaders, email, `Ancien-${Date.now()}`);

    await openPage(page, "/");
    const dialog = await requestResetViaUi(page, email);
    await dialog.getByRole("button", { name: "Fermer" }).click();

    // L'e-mail part après la réponse HTTP : on attend qu'il apparaisse dans les logs du backend.
    let link = null;
    await expect
      .poll(async () => (link = await findResetLinkInBackendLog(email)), { timeout: 15_000 })
      .not.toBeNull();
    const { pathname, search } = new URL(link);
    expect(pathname).toBe("/reinitialiser-mot-de-passe");

    await page.goto(`${pathname}${search}`);
    await expect(page.getByRole("heading", { level: 1, name: "Choisir un nouveau mot de passe" })).toBeVisible();
    // Le jeton est retiré de la barre d'adresse.
    await expect(page).toHaveURL(/\/reinitialiser-mot-de-passe$/);
    await page.getByLabel("Nouveau mot de passe").fill(newPassword);
    await page.getByLabel("Confirmer le mot de passe").fill(newPassword);
    await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mot de passe modifié" })).toBeVisible();

    await loginViaUi(page, { email, password: newPassword });
  });
});
