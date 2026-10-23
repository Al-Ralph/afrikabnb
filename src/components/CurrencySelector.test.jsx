import React from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import CurrencySelector from "./CurrencySelector";
import { LanguageProvider } from "../context/LanguageContext";
import { CurrencyProvider, CURRENCY_STORAGE_KEY } from "../context/CurrencyContext";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: { getRates: vi.fn() } }));

const RATES = {
  base: "XOF",
  rates: { XOF: 1, XAF: 1, EUR: 1 / 655.957, USD: 0.0018 },
  updatedAt: "2026-10-21T12:00:00.000Z",
  source: "exchangerate-api",
};

let languagesSpy;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  languagesSpy = vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-SN"]);
  api.getRates.mockResolvedValue(RATES);
});

afterEach(() => languagesSpy.mockRestore());

const setup = () =>
  render(
    <LanguageProvider>
      <CurrencyProvider>
        <CurrencySelector />
      </CurrencyProvider>
    </LanguageProvider>
  );

const trigger = () => screen.getByRole("button", { name: /^Devise d'affichage/ });
const panel = () => screen.queryByRole("group", { name: "Choisir la devise" });

describe("CurrencySelector", () => {
  test("bouton annoncé avec la devise courante, liste des devises disponibles avec nom et symbole", async () => {
    setup();
    await waitFor(() => expect(api.getRates).toHaveBeenCalled());
    expect(trigger()).toHaveAccessibleName(/Devise d'affichage — franc CFA \(BCEAO\) \(XOF\)/i);
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const list = within(panel());
    await waitFor(() => expect(list.queryByRole("button", { name: /Livre sterling/i })).toBeNull());
    expect(list.getByRole("button", { name: /Automatique \(selon votre région\)/ })).toHaveAttribute("aria-pressed", "true");
    expect(list.getByRole("button", { name: /euro.*€ · EUR/i })).toHaveAttribute("aria-pressed", "false");
    expect(list.getByRole("button", { name: /dollar des États-Unis/i })).toBeInTheDocument();
    // Option active focalisée à l'ouverture.
    expect(list.getByRole("button", { name: /Automatique/ })).toHaveFocus();
    // Mentions : paiement en XOF, date des taux et attribution.
    expect(panel()).toHaveTextContent(/paiement s'effectue en francs CFA \(XOF\)/);
    expect(panel()).toHaveTextContent(/mis à jour le 21 octobre 2026/);
    expect(list.getByRole("link", { name: "Rates By Exchange Rate API" })).toHaveAttribute("href", "https://www.exchangerate-api.com");
  });

  test("choisir une devise la mémorise, ferme le menu et rend le focus ; Automatique efface le choix", async () => {
    setup();
    fireEvent.click(trigger());
    fireEvent.click(within(panel()).getByRole("button", { name: /euro/i }));
    expect(panel()).toBeNull();
    expect(localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("EUR");
    expect(trigger()).toHaveTextContent("EUR");
    expect(trigger()).toHaveFocus();

    fireEvent.click(trigger());
    expect(within(panel()).getByRole("button", { name: /euro/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(panel()).getByRole("button", { name: /Automatique/ }));
    expect(localStorage.getItem(CURRENCY_STORAGE_KEY)).toBeNull();
    expect(trigger()).toHaveTextContent("XOF");
    await waitFor(() => expect(api.getRates).toHaveBeenCalled());
  });

  test("Échap et clic extérieur ferment le menu", async () => {
    setup();
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel()).toBeNull();
    expect(trigger()).toHaveFocus();
    fireEvent.click(trigger());
    fireEvent.mouseDown(document.body);
    expect(panel()).toBeNull();
    await waitFor(() => expect(api.getRates).toHaveBeenCalled());
  });
});
