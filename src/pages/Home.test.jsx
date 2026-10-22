import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "./Home";
import { LanguageProvider } from "../context/LanguageContext";
import { SearchProvider, useSearch } from "../context/SearchContext";
import { api } from "../api/client";
import { listings as mockListings } from "../data/listings";

const mockSetUrlParams = vi.fn();

vi.mock(
  "react-router-dom",
  async () => {
    const React = await vi.importActual("react");
    return {
      Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children),
      useSearchParams: () => [new URLSearchParams(""), mockSetUrlParams],
    };
  }
);

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return { ...actual, api: { getListings: vi.fn() } };
});

vi.mock("../components/Hero", () => ({ default: () => <div>Hero</div> }));
vi.mock("../components/Footer", () => ({ default: () => <footer>Footer</footer> }));

// Barre de recherche simplifiée : modifie le brouillon puis applique la recherche.
vi.mock("../components/SearchBar", async () => {
  const React = await vi.importActual("react");
  const { useSearch: useSearchCtx } = await import("../context/SearchContext");
  return { default: function MockSearchBar() {
    const { setSearchParams, applySearch } = useSearchCtx();
    return React.createElement(
      "div",
      null,
      React.createElement(
        "button",
        { type: "button", onClick: () => setSearchParams((p) => ({ ...p, pets: p.pets + 1 })) },
        "draft-pet"
      ),
      React.createElement(
        "button",
        { type: "button", onClick: () => setSearchParams((p) => ({ ...p, where: "Lomé" })) },
        "draft-where"
      ),
      React.createElement("button", { type: "button", onClick: applySearch }, "apply")
    );
  } };
});

const AppliedProbe = () => {
  const { appliedSearch } = useSearch();
  return <pre data-testid="applied">{JSON.stringify(appliedSearch)}</pre>;
};

const renderHome = () =>
  render(
    <LanguageProvider>
      <SearchProvider>
        <Home />
        <AppliedProbe />
      </SearchProvider>
    </LanguageProvider>
  );

const apiListing = { id: "42", title: "Villa API", location: "Lomé, Togo", pricePerNight: 99, rating: 4.5, imageUrl: "a.jpg" };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  api.getListings.mockReset();
  mockSetUrlParams.mockReset();
});

describe("Home", () => {
  test("renders API listings (no demo banner)", async () => {
    api.getListings.mockResolvedValue({ data: [{ ...apiListing, price: 99, image: "a.jpg" }], total: 1 });
    renderHome();
    expect(await screen.findByText("Villa API")).toBeInTheDocument();
    expect(screen.queryByText(/Données de démonstration/)).not.toBeInTheDocument();
    expect(api.getListings).toHaveBeenCalledWith({ where: "", categoryId: null, pets: false, guests: 0 });
  });

  test("an empty API result shows the empty state, never the mocks, and reset clears the filters", async () => {
    api.getListings.mockResolvedValue({ data: [], total: 0 });
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: /Safari/ }));
    expect(await screen.findByText("Aucun logement ne correspond à votre recherche.")).toBeInTheDocument();
    expect(screen.queryByText(mockListings[0].title)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les filtres" }));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("applied").textContent).categoryId).toBeNull());
  });

  test("falls back to the mocks with a demo banner when the API is unreachable", async () => {
    api.getListings.mockRejectedValue(Object.assign(new Error("API injoignable"), { network: true }));
    renderHome();
    expect(await screen.findByText(mockListings[0].title)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Données de démonstration");
  });

  test("shows the error message when the API answers with a client error", async () => {
    api.getListings.mockRejectedValue(Object.assign(new Error("Bad request"), { status: 400 }));
    renderHome();
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger les annonces");
    expect(screen.queryByText(mockListings[0].title)).not.toBeInTheDocument();
  });

  test("clicking a category refetches with categoryId and marks it pressed; re-click deselects", async () => {
    api.getListings.mockResolvedValue({ data: [], total: 0 });
    renderHome();
    await waitFor(() => expect(api.getListings).toHaveBeenCalledTimes(1));
    const safari = screen.getByRole("button", { name: /Safari/ });
    expect(safari).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(safari);
    expect(safari).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(api.getListings).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: "safari" })));
    fireEvent.click(safari);
    expect(safari).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(api.getListings).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: null })));
  });

  test("editing the draft does not refetch; applying the search does", async () => {
    api.getListings.mockResolvedValue({ data: [], total: 0 });
    renderHome();
    await waitFor(() => expect(api.getListings).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("draft-pet"));
    fireEvent.click(screen.getByText("draft-where"));
    await screen.findByText("Aucun logement ne correspond à votre recherche.");
    expect(api.getListings).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("apply"));
    await waitFor(() =>
      expect(api.getListings).toHaveBeenLastCalledWith({ where: "Lomé", categoryId: null, pets: true, guests: 0 })
    );
    expect(api.getListings).toHaveBeenCalledTimes(2);
  });

  test("mirrors the applied search in the URL", async () => {
    api.getListings.mockResolvedValue({ data: [], total: 0 });
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: /Safari/ }));
    await waitFor(() => expect(mockSetUrlParams).toHaveBeenCalled());
    const [params, options] = mockSetUrlParams.mock.calls[mockSetUrlParams.mock.calls.length - 1];
    expect(params.toString()).toBe("categoryId=safari");
    expect(options).toEqual({ replace: true });
  });
});
