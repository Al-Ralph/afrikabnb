import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Favorites from "./Favorites";
import { LanguageProvider } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useFavorites } from "../context/FavoritesContext";

vi.mock(
  "react-router-dom",
  async () => {
    const React = await vi.importActual("react");
    return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
  }
);
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../context/FavoritesContext", () => ({ useFavorites: vi.fn() }));
vi.mock("../components/Footer", () => ({ default: () => <footer>Footer</footer> }));

const villa = { id: "ck-villa", title: "Villa", location: "Lomé", price: 45000, image: "https://img/v.jpg" };

function setup({ user = { id: "u1" }, fav = {} } = {}) {
  const auth = { user, loading: false, openAuth: vi.fn() };
  const favorites = {
    favorites: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    isFavorite: () => true,
    toggleFavorite: vi.fn(),
    ...fav,
  };
  useAuth.mockReturnValue(auth);
  useFavorites.mockReturnValue(favorites);
  render(
    <LanguageProvider>
      <Favorites />
    </LanguageProvider>
  );
  return { auth, favorites };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
});

describe("Favorites page", () => {
  test("logged out: invites to log in", () => {
    const { auth } = setup({ user: null });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(auth.openAuth).toHaveBeenCalled();
  });

  test("shows a loading state", () => {
    setup({ fav: { loading: true } });
    expect(screen.getByRole("status")).toHaveTextContent("Chargement de vos favoris…");
  });

  test("shows an error with retry", () => {
    const { favorites } = setup({ fav: { error: new Error("down") } });
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger vos favoris.");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(favorites.reload).toHaveBeenCalled();
  });

  test("empty state links back home", () => {
    setup();
    expect(screen.getByRole("link", { name: "Découvrir les logements" })).toHaveAttribute("href", "/");
  });

  test("lists favourites as property cards with a filled heart", () => {
    setup({ fav: { favorites: [villa] } });
    expect(screen.getByRole("link", { name: /Villa/ })).toHaveAttribute("href", "/property/ck-villa");
    expect(screen.getByRole("button", { name: "Retirer des favoris" })).toHaveAttribute("aria-pressed", "true");
  });
});
