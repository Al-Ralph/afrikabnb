import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import Home from "./Home";
import { LanguageProvider } from "../context/LanguageContext";
import { SearchProvider } from "../context/SearchContext";
import { api } from "../api/client";

const mockSetUrlParams = vi.fn();

vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return {
    Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children),
    useSearchParams: () => [new URLSearchParams(""), mockSetUrlParams],
  };
});
vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return { ...actual, api: { getListings: vi.fn() } };
});
vi.mock("../components/Hero", () => ({ default: () => <div>Hero</div> }));
vi.mock("../components/Footer", () => ({ default: () => <footer>Footer</footer> }));
vi.mock("../components/SearchBar", () => ({ default: () => <div>SearchBar</div> }));

const listing = {
  id: "42",
  title: "Villa API",
  location: "Lomé, Togo",
  price: 45000,
  currency: "XOF",
  image: "a.jpg",
  images: [],
};

const renderHome = () =>
  render(
    <LanguageProvider>
      <SearchProvider>
        <Home />
      </SearchProvider>
    </LanguageProvider>
  );

const lastCall = () => api.getListings.mock.calls[api.getListings.mock.calls.length - 1][0];
const lastUrl = () => mockSetUrlParams.mock.calls[mockSetUrlParams.mock.calls.length - 1][0].toString();
const filtersButton = () => screen.getByRole("button", { name: /^Filtres/ });
const dialog = () => screen.getByRole("dialog", { name: "Filtres" });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  mockSetUrlParams.mockReset();
  api.getListings.mockReset().mockResolvedValue({
    data: [listing],
    total: 1,
    priceRange: { min: 10000, max: 210000 },
  });
});

describe("Home — filters panel", () => {
  test("opens from the « Filtres » button with price bounds from the API, applies amenities and price", async () => {
    renderHome();
    await screen.findByText("Villa API");
    fireEvent.click(filtersButton());

    const d = within(dialog());
    expect(d.getByText(/Prix par nuit/)).toHaveTextContent(/10\s?000.*210\s?000/);
    const minSlider = d.getByRole("slider", { name: "Prix minimum" });
    expect(minSlider).toHaveAttribute("min", "10000");
    expect(minSlider).toHaveAttribute("max", "210000");

    fireEvent.change(minSlider, { target: { value: "50000" } });
    expect(d.getByRole("spinbutton", { name: "Minimum" })).toHaveValue(50000);
    fireEvent.change(d.getByRole("spinbutton", { name: "Maximum" }), { target: { value: "120000" } });
    fireEvent.click(d.getByRole("checkbox", { name: "Piscine" }));
    fireEvent.click(d.getByRole("checkbox", { name: "Wi-Fi" }));
    fireEvent.click(d.getByRole("button", { name: "Afficher les logements" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(lastCall()).toEqual({
        where: "",
        categoryId: null,
        pets: false,
        guests: 0,
        minPrice: 50000,
        maxPrice: 120000,
        amenities: ["WIFI", "POOL"],
      })
    );
    // URL partageable synchronisée.
    await waitFor(() => expect(lastUrl()).toBe("minPrice=50000&maxPrice=120000&amenities=WIFI%2CPOOL"));
    // Compteur : prix (1) + 2 équipements.
    expect(filtersButton()).toHaveTextContent("3");
    expect(filtersButton()).toHaveAccessibleName("Filtres, 3 filtres actifs");
  });

  test("« Tout effacer » resets the draft; applying it removes every filter", async () => {
    renderHome();
    await screen.findByText("Villa API");
    fireEvent.click(filtersButton());
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: "Groupe électrogène" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Afficher les logements" }));
    await waitFor(() => expect(lastCall().amenities).toEqual(["GENERATOR"]));
    expect(filtersButton()).toHaveAccessibleName("Filtres, 1 filtre actif");

    fireEvent.click(filtersButton());
    // Le panneau repart des filtres appliqués.
    expect(within(dialog()).getByRole("checkbox", { name: "Groupe électrogène" })).toBeChecked();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Tout effacer" }));
    expect(within(dialog()).getByRole("checkbox", { name: "Groupe électrogène" })).not.toBeChecked();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Afficher les logements" }));

    await waitFor(() => expect(lastCall().amenities).toBeUndefined());
    expect(filtersButton()).toHaveAccessibleName("Filtres");
  });

  test("closing without applying keeps the current filters; a slider at its bound is not a filter", async () => {
    renderHome();
    await screen.findByText("Villa API");
    fireEvent.click(filtersButton());
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: "Piscine" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.getListings).toHaveBeenCalledTimes(1);

    fireEvent.click(filtersButton());
    const max = within(dialog()).getByRole("slider", { name: "Prix maximum" });
    fireEvent.change(max, { target: { value: "150000" } });
    fireEvent.change(max, { target: { value: "210000" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Afficher les logements" }));
    await waitFor(() => expect(api.getListings).toHaveBeenCalledTimes(1));
    expect(lastCall().maxPrice).toBeUndefined();
  });

  test("rejects a minimum above the maximum", async () => {
    renderHome();
    await screen.findByText("Villa API");
    fireEvent.click(filtersButton());
    const d = within(dialog());
    fireEvent.change(d.getByRole("spinbutton", { name: "Minimum" }), { target: { value: "90000" } });
    fireEvent.change(d.getByRole("spinbutton", { name: "Maximum" }), { target: { value: "20000" } });
    expect(d.getByRole("alert")).toHaveTextContent("Le minimum doit être inférieur au maximum.");
    expect(d.getByRole("button", { name: "Afficher les logements" })).toBeDisabled();
  });

  test("without a price range from the API, only the number fields are shown", async () => {
    api.getListings.mockResolvedValue({ data: [listing], total: 1 });
    renderHome();
    await screen.findByText("Villa API");
    fireEvent.click(filtersButton());
    expect(within(dialog()).queryByRole("slider")).toBeNull();
    expect(within(dialog()).getByRole("spinbutton", { name: "Minimum" })).toBeInTheDocument();
  });
});

describe("Home — sort", () => {
  test("the sort menu next to the results count reloads the listings and updates the URL", async () => {
    renderHome();
    await screen.findByText("1 logement");
    const select = screen.getByRole("combobox", { name: "Trier par" });
    expect(select).toHaveValue("recommended");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Recommandés",
      "Prix croissant",
      "Prix décroissant",
      "Mieux notés",
    ]);

    fireEvent.change(select, { target: { value: "price_asc" } });
    await waitFor(() => expect(lastCall().sort).toBe("price_asc"));
    await waitFor(() => expect(lastUrl()).toBe("sort=price_asc"));
    // Le tri ne compte pas comme un filtre.
    expect(filtersButton()).toHaveAccessibleName("Filtres");
  });
});
