import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { CurrencyProvider, useCurrency, CURRENCY_STORAGE_KEY, RATES_STORAGE_KEY } from "./CurrencyContext";
import { LanguageProvider } from "./LanguageContext";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: { getRates: vi.fn() } }));

const RATES = {
  base: "XOF",
  rates: { XOF: 1, XAF: 1, EUR: 1 / 655.957, USD: 0.0018, NGN: 2.7 },
  updatedAt: "2026-10-21T00:00:00.000Z",
  source: "exchangerate-api",
};

const norm = (s) => s.replace(/\s/g, " ");

let ctx;
const Probe = () => {
  ctx = useCurrency();
  return <span data-testid="price">{ctx.formatAmount(65595.7)}</span>;
};

const renderProvider = () =>
  render(
    <LanguageProvider>
      <CurrencyProvider>
        <Probe />
      </CurrencyProvider>
    </LanguageProvider>
  );

const price = () => norm(screen.getByTestId("price").textContent);

let languagesSpy;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  languagesSpy = vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-TG", "fr"]);
  api.getRates.mockResolvedValue(RATES);
});

afterEach(() => {
  languagesSpy.mockRestore();
});

describe("CurrencyProvider", () => {
  test("mode automatique : devise détectée depuis la langue du navigateur (fr-TG -> XOF), sans conversion", async () => {
    renderProvider();
    await waitFor(() => expect(ctx.rates).not.toBeNull());
    expect(ctx.currency).toBe("XOF");
    expect(ctx.isAuto).toBe(true);
    expect(ctx.isConverted()).toBe(false);
    expect(price()).toBe("65 596 F CFA");
  });

  test("mode automatique : fr-FR -> EUR, montant converti préfixé de ≈", async () => {
    languagesSpy.mockReturnValue(["fr-FR"]);
    renderProvider();
    expect(ctx.currency).toBe("EUR");
    await waitFor(() => expect(price()).toBe("≈ 100 €"));
    expect(ctx.isConverted("XOF")).toBe(true);
    expect(ctx.isConverted("EUR")).toBe(false);
    expect(ctx.ratesUpdatedAt).toBe(RATES.updatedAt);
    expect(api.getRates).toHaveBeenCalledTimes(1);
    // Taux mis en cache pour la session.
    expect(JSON.parse(sessionStorage.getItem(RATES_STORAGE_KEY)).data.rates.USD).toBe(0.0018);
  });

  test("sans taux (échec de l'API ou chargement en cours) : devise d'origine, jamais de montant faux", async () => {
    languagesSpy.mockReturnValue(["en-US"]);
    let reject;
    api.getRates.mockReturnValue(new Promise((_, r) => (reject = r)));
    renderProvider();
    expect(ctx.currency).toBe("USD");
    expect(price()).toBe("65 596 F CFA");
    expect(ctx.isConverted()).toBe(false);
    await act(async () => reject(new Error("API injoignable")));
    expect(price()).toBe("65 596 F CFA");
    expect(ctx.rates).toBeNull();
  });

  test("devise sans taux dans la réponse : devise d'origine", async () => {
    languagesSpy.mockReturnValue(["en-GB"]);
    renderProvider();
    await waitFor(() => expect(ctx.rates).not.toBeNull());
    expect(ctx.currency).toBe("GBP");
    expect(price()).toBe("65 596 F CFA");
    expect(ctx.currencies).not.toContain("GBP");
  });

  test("choix mémorisé (localStorage) prioritaire sur la détection, retour à l'automatique", async () => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, "USD");
    renderProvider();
    expect(ctx.currency).toBe("USD");
    expect(ctx.isAuto).toBe(false);
    await waitFor(() => expect(price()).toBe("≈ 118 $US"));

    act(() => ctx.setCurrency("NGN"));
    expect(localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("NGN");
    expect(price()).toMatch(/^≈ 177 108 NGN$|^≈ 177 108 ₦$/);

    act(() => ctx.setCurrency("auto"));
    expect(localStorage.getItem(CURRENCY_STORAGE_KEY)).toBeNull();
    expect(ctx.currency).toBe("XOF");

    // Code inconnu ignoré.
    act(() => ctx.setCurrency("BTC"));
    expect(ctx.preference).toBe("auto");
  });

  test("taux déjà en cache de session : pas de nouvel appel", async () => {
    sessionStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), data: RATES }));
    localStorage.setItem(CURRENCY_STORAGE_KEY, "EUR");
    renderProvider();
    expect(price()).toBe("≈ 100 €");
    expect(api.getRates).not.toHaveBeenCalled();
  });

  test("stockage de la préférence et des taux inaccessible : préférence en mémoire, sans erreur", async () => {
    const original = { getItem: Storage.prototype.getItem, setItem: Storage.prototype.setItem };
    const blocked = (name) =>
      function (key, ...rest) {
        if (key === CURRENCY_STORAGE_KEY || key === RATES_STORAGE_KEY) throw new Error("SecurityError");
        return original[name].call(this, key, ...rest);
      };
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked("getItem"));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked("setItem"));
    try {
      renderProvider();
      await waitFor(() => expect(ctx.rates).not.toBeNull());
      act(() => ctx.setCurrency("EUR"));
      expect(price()).toBe("≈ 100 €");
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe("useCurrency sans fournisseur", () => {
  test("affiche la devise d'origine", () => {
    render(<Probe />);
    expect(price()).toBe("65 596 F CFA");
    expect(ctx.isConverted()).toBe(false);
    expect(ctx.currency).toBe("XOF");
  });
});
