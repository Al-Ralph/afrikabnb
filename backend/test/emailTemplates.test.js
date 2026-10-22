import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingCancelledEmail,
  bookingConfirmedGuestEmail,
  bookingConfirmedHostEmail,
  bookingDecisionGuestEmail,
  bookingRequestHostEmail,
  escapeHtml,
  formatDayFr,
  passwordResetEmail,
} from "../src/services/email/templates.js";

const evil = `<script>alert("x")</script><img src=x onerror=alert(1)>`;
const booking = {
  listingTitle: evil,
  checkIn: "2026-11-01",
  checkOut: "2026-11-04",
  nights: 3,
  guests: 2,
  totalPrice: 135000,
  currency: "XOF",
};

test("escapeHtml neutralise les caractères HTML", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&#60;a href&#61;&#34;x&#34;&#62;&#39;&#38;&#39;&#60;&#47;a&#62;");
  assert.equal(escapeHtml(null), "");
});

test("aucun contenu utilisateur non échappé dans le HTML", () => {
  const mails = [
    passwordResetEmail({ name: evil, resetUrl: "https://app.test/reinitialiser-mot-de-passe?token=abc" }),
    bookingConfirmedGuestEmail({ name: evil, booking, url: "https://app.test/profil" }),
    bookingConfirmedHostEmail({ name: evil, guestName: evil, booking, url: "https://app.test/host" }),
    bookingRequestHostEmail({ name: evil, guestName: evil, booking, url: "https://app.test/host" }),
    bookingDecisionGuestEmail({ name: evil, accepted: true, booking, url: "https://app.test/profil" }),
    bookingDecisionGuestEmail({ name: evil, accepted: false, booking, url: "https://app.test/" }),
    bookingCancelledEmail({ name: evil, recipient: "guest", cancelledBy: "host", booking, url: "https://app.test/profil" }),
  ];
  for (const m of mails) {
    assert.ok(!m.html.includes("<script>"), m.subject);
    assert.ok(!m.html.includes("<img"), m.subject);
    assert.ok(m.html.includes("&#60;script&#62;"), m.subject);
    assert.ok(!/[\r\n]/.test(m.subject));
    assert.ok(m.text.length > 0);
  }
});

test("réinitialisation : lien présent (texte et HTML), validité annoncée", () => {
  const url = "https://app.test/reinitialiser-mot-de-passe?token=abc_DEF-123";
  const m = passwordResetEmail({ name: "Awa", resetUrl: url });
  assert.ok(m.text.includes(url));
  assert.ok(m.html.includes(escapeHtml(url)));
  assert.match(m.text, /1 heure/);
  assert.match(m.text, /^Bonjour Awa,/);
});

test("réservation : dates, nuits et montant formatés en français", () => {
  const m = bookingConfirmedGuestEmail({ name: "Kofi", booking: { ...booking, listingTitle: "Maison de plage" } });
  assert.equal(formatDayFr("2026-11-01"), "1 novembre 2026");
  assert.ok(m.text.includes("du 1 novembre 2026 au 4 novembre 2026 (3 nuits), 2 voyageurs"));
  assert.match(m.text, /135\s000\sF\s?CFA/);
  const c = bookingCancelledEmail({ name: "Awa", recipient: "host", cancelledBy: "guest", booking });
  assert.match(c.text, /Le voyageur a annulé/);
});
