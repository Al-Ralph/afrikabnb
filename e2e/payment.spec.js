// ÉCRITURE en base (réservation payée, compte de démo kofi) : CI uniquement, avec le fournisseur de
// paiement simulé (PAYMENTS_ENABLED=true, PAYMENT_PROVIDER=fake : voir .github/workflows/e2e.yml).
import { test, expect } from "./fixtures.js";
import { GUEST_ACCOUNT, LISTINGS, farFutureStay, formatDayInPage, loginViaUi, openPage } from "./helpers.js";

test.describe("Paiement Mobile Money (fournisseur simulé)", () => {
  test("réservation instantanée -> payer -> paiement simulé accepté -> « Payée »", async ({ page, request, apiHeaders }) => {
    const cfg = await (await request.get("/api/payments/config", { headers: apiHeaders })).json();
    // Suite lancée contre une API sans paiement simulé (ex. poste local) : rien à vérifier ici.
    test.skip(!cfg.enabled || cfg.provider !== "fake", "Paiements simulés non activés sur l'API");

    const listing = LISTINGS.nairobi;
    const stay = farFutureStay(2);
    await openPage(page, `/property/${listing.id}`);
    await loginViaUi(page, GUEST_ACCOUNT);

    await page.goto(`/reserver/${listing.id}?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&guests=2`);
    const form = page.getByRole("form", { name: "Vos coordonnées" });
    await expect(form.getByLabel("Nom complet")).toHaveValue("Kofi Mensah");
    await form.getByLabel("Téléphone").fill("+228 90 12 34 56");
    await form.getByLabel("Pays de résidence").selectOption("TG");
    await form.getByRole("checkbox", { name: /J'accepte les CGU/ }).check();
    await form.getByRole("button", { name: "Confirmer la réservation" }).click();

    const done = page.getByRole("status").filter({ has: page.getByRole("heading", { name: "Réservation confirmée !" }) });
    await expect(done).toBeVisible();
    const panel = done.getByRole("region", { name: "Paiement" });
    await expect(panel.getByTestId("payment-badge")).toHaveText(/^À payer avant le /);
    await expect(panel.getByTestId("payment-amount")).toContainText("Montant débité");

    await panel.getByRole("button", { name: "Payer avec Mobile Money" }).click();
    await expect(page).toHaveURL(/\/api\/payments\/fake\/AFB[0-9A-F]{32}$/);
    await expect(page.getByRole("heading", { name: "Paiement simulé (développement)" })).toBeVisible();
    await page.getByRole("button", { name: "Simuler un paiement accepté" }).click();

    await expect(page).toHaveURL(/\/paiement\/retour\?tx=AFB[0-9A-F]{32}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Paiement reçu" })).toBeVisible();

    await page.getByRole("link", { name: "Voir mes voyages" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Mes réservations" })).toBeVisible();
    const dates = `${await formatDayInPage(page, stay.checkIn)} → ${await formatDayInPage(page, stay.checkOut)}`;
    const item = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: listing.title }) })
      .filter({ hasText: dates });
    await expect(item).toHaveCount(1);
    await expect(item.getByTestId("payment-badge")).toHaveText("Payée");
    await expect(item.getByRole("button", { name: "Payer avec Mobile Money" })).toHaveCount(0);

    // Annulation d'une réservation payée : remboursement manuel signalé.
    await item.getByRole("button", { name: "Annuler la réservation" }).click();
    await item.getByRole("group").getByRole("button", { name: "Oui, annuler" }).click();
    await expect(item.getByTestId("payment-badge")).toHaveText("Remboursement en cours");
  });
});
