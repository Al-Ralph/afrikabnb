// ÉCRITURE en base (réservation puis annulation, compte de démo kofi) : CI uniquement.
import { test, expect } from "./fixtures.js";
import { GUEST_ACCOUNT, LISTINGS, farFutureStay, formatDayInPage, loginViaUi, openPage } from "./helpers.js";

test.describe("Réservation connectée", () => {
  test("réservation instantanée via /reserver/:id, visible dans le profil puis annulée", async ({ page }) => {
    const listing = LISTINGS.nairobi;
    const stay = farFutureStay(2);
    await openPage(page, `/property/${listing.id}`);
    await expect(page.getByText("Réservation instantanée", { exact: true })).toBeVisible();
    await loginViaUi(page, GUEST_ACCOUNT);

    await page.goto(`/reserver/${listing.id}?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&guests=2`);
    await expect(page.getByRole("heading", { level: 1, name: "Confirmer et réserver" })).toBeVisible();
    const form = page.getByRole("form", { name: "Vos coordonnées" });
    // Formulaire pré-rempli avec le compte (session restaurée par le cookie après le rechargement).
    await expect(form.getByText("Vos informations de compte ont été pré-remplies")).toBeVisible();
    await expect(form.getByLabel("Nom complet")).toHaveValue("Kofi Mensah");
    await expect(form.getByLabel("Adresse e-mail")).toHaveValue(GUEST_ACCOUNT.email);
    await form.getByLabel("Téléphone").fill("+228 90 12 34 56");
    await form.getByLabel("Pays de résidence").selectOption("TG");

    // Sans la case CGU, l'envoi est bloqué côté client.
    await form.getByRole("button", { name: "Confirmer la réservation" }).click();
    await expect(form.getByText("Vous devez accepter les conditions pour réserver.")).toBeVisible();
    await form.getByRole("checkbox", { name: /J'accepte les CGU/ }).check();

    const created = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${listing.id}/bookings`) && r.request().method() === "POST"
    );
    await form.getByRole("button", { name: "Confirmer la réservation" }).click();
    expect((await created).status()).toBe(201);
    const done = page.getByRole("status").filter({ has: page.getByRole("heading", { name: "Réservation confirmée !" }) });
    await expect(done).toBeVisible();
    await expect(done.getByText(`Un e-mail récapitulatif vous a été envoyé à ${GUEST_ACCOUNT.email}.`)).toBeVisible();

    await done.getByRole("link", { name: "Voir mes réservations" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Mes réservations" })).toBeVisible();
    const dates = `${await formatDayInPage(page, stay.checkIn)} → ${await formatDayInPage(page, stay.checkOut)}`;
    const item = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: listing.title }) })
      .filter({ hasText: dates });
    await expect(item).toHaveCount(1);
    await expect(item.getByText("Confirmée", { exact: true })).toBeVisible();

    await item.getByRole("button", { name: "Annuler la réservation" }).click();
    await item.getByRole("group").getByRole("button", { name: "Oui, annuler" }).click();
    await expect(item.getByText("Annulée", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Annulées/ }).getByRole("listitem").filter({ hasText: dates })).toHaveCount(1);
  });
});
