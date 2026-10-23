import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PropertyCard from "./PropertyCard";
import { LanguageProvider } from "../context/LanguageContext";
import { useFavorites } from "../context/FavoritesContext";
import { CurrencyProvider } from "../context/CurrencyContext";
import { api } from "../api/client";

// Sans valeur de retour (resetMocks), la carte utilise son état local comme hors provider.
vi.mock("../context/FavoritesContext", () => ({ useFavorites: vi.fn() }));
vi.mock("../api/client", () => ({ api: { getRates: vi.fn() } }));

vi.mock(
  "react-router-dom",
  async () => {
    const React = await vi.importActual("react");
    return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
  }
);

const baseProps = {
  id: 42,
  location: "Lomé, Togo",
  title: "Villa bord de mer",
  price: 120,
  rating: 4.8,
  image: "http://img/villa.jpg",
};

const renderCard = (props = {}) =>
  render(
    <LanguageProvider>
      <PropertyCard {...baseProps} {...props} />
    </LanguageProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
});

describe("PropertyCard", () => {
  test("renders location, title, rating and price per night", () => {
    renderCard();
    expect(screen.getByText("Lomé, Togo")).toBeInTheDocument();
    expect(screen.getByText("Villa bord de mer")).toBeInTheDocument();
    // Note formatée selon la langue de l'interface (français par défaut).
    expect(screen.getByText("4,8")).toBeInTheDocument();
    expect(screen.getByText("$120")).toBeInTheDocument();
    expect(screen.getByText(/nuit/)).toBeInTheDocument();
  });

  test("links to the property details page", () => {
    renderCard();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/property/42");
  });

  test("uses the image prop and title as alt text", () => {
    renderCard();
    expect(screen.getByAltText("Villa bord de mer")).toHaveAttribute("src", "http://img/villa.jpg");
  });

  test("falls back to imageUrl when image is absent", () => {
    renderCard({ image: undefined, imageUrl: "http://img/alt.jpg" });
    expect(screen.getByAltText("Villa bord de mer")).toHaveAttribute("src", "http://img/alt.jpg");
  });

  test("falls back to pricePerNight when price is absent", () => {
    renderCard({ price: undefined, pricePerNight: 75 });
    expect(screen.getByText("$75")).toBeInTheDocument();
  });

  test("a price of 0 is displayed as $0 and not replaced by pricePerNight", () => {
    renderCard({ price: 0, pricePerNight: 75 });
    expect(screen.getByText("$0")).toBeInTheDocument();
  });

  test("hides the rating block when rating is null", () => {
    renderCard({ rating: null });
    expect(screen.queryByText("démo")).not.toBeInTheDocument();
  });

  test("shows the rating block when rating is 0", () => {
    renderCard({ rating: 0 });
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  test("favorite button toggles its accessible label", () => {
    renderCard();
    const btn = screen.getByLabelText("Ajouter aux favoris");
    fireEvent.click(btn);
    expect(screen.getByLabelText("Retirer des favoris")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Retirer des favoris"));
    expect(screen.getByLabelText("Ajouter aux favoris")).toBeInTheDocument();
  });

  test("favorite button exposes its state with aria-pressed", () => {
    renderCard();
    const btn = screen.getByRole("button", { name: "Ajouter aux favoris" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(screen.getByRole("button", { name: "Retirer des favoris" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the favorite button is not nested inside the link (valid HTML)", () => {
    renderCard();
    const link = screen.getByRole("link");
    const btn = screen.getByRole("button", { name: "Ajouter aux favoris" });
    expect(link).not.toContainElement(btn);
  });

  describe("with FavoritesContext", () => {
    test("reflects isFavorite from the context", () => {
      useFavorites.mockReturnValue({ isFavorite: (id) => id === 42, toggleFavorite: vi.fn() });
      renderCard();
      expect(screen.getByRole("button", { name: "Retirer des favoris" })).toHaveAttribute("aria-pressed", "true");
    });

    test("clicking the heart calls toggleFavorite with the listing", () => {
      const toggleFavorite = vi.fn();
      useFavorites.mockReturnValue({ isFavorite: () => false, toggleFavorite });
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Ajouter aux favoris" }));
      expect(toggleFavorite).toHaveBeenCalledWith(
        expect.objectContaining({ id: 42, title: "Villa bord de mer", location: "Lomé, Togo", price: 120, image: "http://img/villa.jpg" })
      );
      // L'état affiché vient du contexte, pas d'un état local.
      expect(screen.getByRole("button", { name: "Ajouter aux favoris" })).toBeInTheDocument();
    });
  });
});

describe("PropertyCard — display currency", () => {
  const RATES = { base: "XOF", rates: { XOF: 1, EUR: 1 / 655.957 }, updatedAt: "2026-10-21T00:00:00.000Z", source: "exchangerate-api" };
  const renderWithCurrency = (props) =>
    render(
      <LanguageProvider>
        <CurrencyProvider>
          <PropertyCard {...baseProps} {...props} />
        </CurrencyProvider>
      </LanguageProvider>
    );

  test("a XOF price is shown converted (≈) into the chosen currency once rates are loaded", async () => {
    sessionStorage.clear();
    localStorage.setItem("afrikabnb_currency", "EUR");
    api.getRates.mockResolvedValue(RATES);
    renderWithCurrency({ price: 32797.85, currency: "XOF" });
    // Avant les taux : devise d'origine.
    expect(screen.getByText(/F\sCFA/)).toBeInTheDocument();
    expect(await screen.findByText(/^≈\s50,00\s€$/)).toBeInTheDocument();
  });

  test("without rates the original XOF price is kept", async () => {
    sessionStorage.clear();
    localStorage.setItem("afrikabnb_currency", "EUR");
    api.getRates.mockRejectedValue(new Error("API injoignable"));
    renderWithCurrency({ price: 25000, currency: "XOF" });
    await waitFor(() => expect(api.getRates).toHaveBeenCalled());
    expect(screen.getByText(/^25\s000\sF\sCFA$/)).toBeInTheDocument();
  });
});
