// ÉCRITURE en base (demandes de réservation sans compte, refus par l'hôte) : CI uniquement.
import { test, expect } from "./fixtures.js";
import { HOST_ACCOUNT, LISTINGS, farFutureStay, loginViaUi, openPage, uniqueEmail, uniqueStamp } from "./helpers.js";

test.describe("Réservation sans compte", () => {
  test("demande sur une annonce « sur demande », suivi par le lien personnel puis annulation", async ({ page }) => {
    const listing = LISTINGS.goree;
    const stay = farFutureStay(3);
    const email = uniqueEmail("e2e-invite");
    await openPage(page, `/property/${listing.id}`);
    await expect(page.getByText("Sur demande", { exact: true })).toBeVisible();

    await page.goto(`/reserver/${listing.id}?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&guests=2`);
    await expect(page.getByRole("heading", { level: 1, name: "Demande de réservation" })).toBeVisible();
    await expect(page.getByText("Sans compte, votre réservation est envoyée comme une demande")).toBeVisible();
    const form = page.getByRole("form", { name: "Vos coordonnées" });
    await form.getByLabel("Nom complet").fill("Ama Sans Compte");
    await form.getByLabel("Adresse e-mail").fill(email);
    await form.getByLabel("Téléphone").fill("+221 77 123 45 67");
    await form.getByLabel("Pays de résidence").selectOption("SN");
    await form.getByLabel("Heure d'arrivée estimée (facultatif)").fill("15:30");
    await form.getByLabel("Message à l'hôte (facultatif)").fill("Bonjour, nous arriverons par la chaloupe de l'après-midi.");
    await form.getByRole("checkbox", { name: /J'accepte les CGU/ }).check();

    const created = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${listing.id}/bookings`) && r.request().method() === "POST"
    );
    await form.getByRole("button", { name: "Envoyer la demande" }).click();
    expect((await created).status()).toBe(201);

    const done = page.getByRole("status").filter({ has: page.getByRole("heading", { name: "Demande envoyée" }) });
    await expect(done).toBeVisible();
    await expect(done.getByText(`Un e-mail récapitulatif vous a été envoyé à ${email}.`)).toBeVisible();
    await expect(done.getByRole("heading", { name: "Suivre ou annuler votre demande" })).toBeVisible();
    const manageLink = done.getByRole("link", { name: "Ouvrir le suivi de ma réservation" });
    const href = await manageLink.getAttribute("href");
    expect(href).toMatch(/\/reservation\/[^/?#]+$/);
    const token = href.split("/reservation/")[1];

    const loaded = page.waitForResponse((r) => r.url().includes("/api/guest-bookings/") && r.request().method() === "GET");
    await manageLink.click();
    expect((await loaded).ok()).toBe(true);
    // Le jeton est retiré de la barre d'adresse (historique, partage d'écran, Referer).
    await expect(page).toHaveURL(/\/reservation$/);
    expect(page.url()).not.toContain(token);

    await expect(page.getByRole("heading", { level: 1, name: "Votre réservation" })).toBeVisible();
    await expect(page.getByText("En attente de l'hôte", { exact: true })).toBeVisible();
    await expect(page.getByText(listing.title, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Annuler la réservation" }).click();
    const confirm = page.getByRole("group", { name: "Annuler définitivement cette réservation ?" });
    const cancelled = page.waitForResponse((r) => r.url().endsWith("/cancel") && r.request().method() === "POST");
    await confirm.getByRole("button", { name: "Oui, annuler" }).click();
    expect((await cancelled).ok()).toBe(true);
    await expect(page.getByRole("status").filter({ hasText: "Votre réservation a été annulée." })).toBeVisible();
    await expect(page.getByText("Annulée", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toHaveCount(0);
  });

  test("l'hôte voit la demande sans compte avec la fiche de contact et la refuse", async ({ page, request, apiHeaders }) => {
    const listing = LISTINGS.lagos;
    const stay = farFutureStay(2);
    const contact = {
      name: `Kodjo Invité ${uniqueStamp()}`,
      email: uniqueEmail("e2e-contact"),
      phone: "+228 91 23 45 67",
      country: "TG",
      arrivalTime: "18:45",
      message: "Arrivée tardive, merci de prévoir une clé.",
    };
    // Nouvelle demande sans compte, propre à ce test (appel direct à l'API, comme le formulaire).
    const response = await request.post(`/api/listings/${listing.id}/bookings`, {
      headers: apiHeaders,
      data: { checkIn: stay.checkIn, checkOut: stay.checkOut, guests: 2, contact, acceptTerms: true, website: "" },
    });
    expect(response.status(), await response.text()).toBe(201);
    expect((await response.json()).status).toBe("PENDING");

    await openPage(page, "/host");
    await loginViaUi(page, HOST_ACCOUNT);
    await expect(page.getByRole("heading", { level: 1, name: "Mon espace hôte" })).toBeVisible();
    await page.getByRole("tab", { name: /^Réservations/ }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("heading", { name: "Réservations reçues" })).toBeVisible();

    const item = panel.getByRole("listitem").filter({ hasText: contact.name });
    await expect(item).toHaveCount(1);
    await expect(item.getByText(listing.title, { exact: true })).toBeVisible();
    await expect(item.getByText("En attente", { exact: true })).toBeVisible();
    const card = item.getByRole("region", { name: /^Coordonnées du voyageur/ });
    await expect(card.getByText("Sans compte", { exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: contact.email })).toHaveAttribute("href", `mailto:${contact.email}`);
    await expect(card.getByRole("link", { name: contact.phone })).toHaveAttribute("href", /^tel:\+228/);
    await expect(card.getByText("Togo", { exact: true })).toBeVisible();
    await expect(card.getByText(contact.arrivalTime, { exact: true })).toBeVisible();
    await expect(card.getByText(contact.message)).toBeVisible();

    await item.getByRole("button", { name: "Refuser" }).click();
    const declined = page.waitForResponse((r) => r.url().endsWith("/decline") && r.request().method() === "PATCH");
    await item.getByRole("group", { name: "Refuser cette demande ?" }).getByRole("button", { name: "Oui, confirmer" }).click();
    expect((await declined).ok()).toBe(true);
    await expect(panel.getByRole("status").filter({ hasText: "Demande refusée" })).toBeVisible();
    await expect(item.getByText("Refusée", { exact: true })).toBeVisible();
    await expect(item.getByRole("button", { name: "Refuser" })).toHaveCount(0);
  });
});
