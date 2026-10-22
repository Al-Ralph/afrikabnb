import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Header from "./Header";
import { LanguageProvider } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";

vi.mock(
  "react-router-dom",
  async () => {
    const React = await vi.importActual("react");
    return {
      Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children),
      useLocation: () => ({ pathname: "/profil" }),
    };
  }
);
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("./LanguageSelector", () => ({ default: () => <div>LanguageSelector</div> }));
vi.mock("./AuthModal", () => ({ default: ({ isOpen }) => (isOpen ? <div role="dialog">AuthModal</div> : null) }));

const kofi = { id: "u1", email: "kofi@afrikabnb.com", name: "Kofi", avatar: null };

function setup(authOverrides = {}) {
  const auth = {
    user: null,
    logout: vi.fn(),
    authOpen: false,
    openAuth: vi.fn(),
    closeAuth: vi.fn(),
    ...authOverrides,
  };
  useAuth.mockReturnValue(auth);
  render(
    <LanguageProvider>
      <Header />
    </LanguageProvider>
  );
  return auth;
}

const menu = () => screen.queryByRole("group", { name: "Menu du compte" });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
});

describe("Header — connected user menu", () => {
  test("the account button opens the menu with profile, favourites, host space, map and logout", () => {
    setup({ user: kofi });
    const trigger = screen.getByRole("button", { name: /Menu du compte/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(menu()).toBeNull();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const m = within(menu());
    expect(m.getByRole("link", { name: "Profil" })).toHaveAttribute("href", "/profil");
    expect(m.getByRole("link", { name: "Mes favoris" })).toHaveAttribute("href", "/favoris");
    expect(m.getByRole("link", { name: "Espace hôte" })).toHaveAttribute("href", "/host");
    expect(m.getByRole("link", { name: "Carte" })).toHaveAttribute("href", "/carte");
    expect(m.getByRole("button", { name: "Déconnexion" })).toBeInTheDocument();
  });

  test("Escape closes the menu and gives focus back to the trigger", () => {
    setup({ user: kofi });
    const trigger = screen.getByRole("button", { name: /Menu du compte/ });
    fireEvent.click(trigger);
    expect(menu()).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu()).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  test("a click outside closes the menu, a click inside does not", () => {
    setup({ user: kofi });
    fireEvent.click(screen.getByRole("button", { name: /Menu du compte/ }));
    fireEvent.mouseDown(within(menu()).getByRole("link", { name: "Profil" }));
    expect(menu()).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(menu()).toBeNull();
  });

  test("following a link closes the menu", () => {
    setup({ user: kofi });
    fireEvent.click(screen.getByRole("button", { name: /Menu du compte/ }));
    fireEvent.click(within(menu()).getByRole("link", { name: "Mes favoris" }));
    expect(menu()).toBeNull();
  });

  test("logout calls logout and closes the menu", () => {
    const auth = setup({ user: kofi });
    fireEvent.click(screen.getByRole("button", { name: /Menu du compte/ }));
    fireEvent.click(within(menu()).getByRole("button", { name: "Déconnexion" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  test("shows the user's name and avatar", () => {
    setup({ user: { ...kofi, avatar: "https://img/kofi.jpg" } });
    expect(screen.getByText("Kofi")).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /Menu du compte/ });
    expect(within(trigger).getByRole("presentation")).toHaveAttribute("src", "https://img/kofi.jpg");
  });
});

describe("Header — visitor", () => {
  test("the menu button (previously inert) opens a menu with login, map and host links", () => {
    const auth = setup();
    const trigger = screen.getByRole("button", { name: "Menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const m = within(menu());
    expect(m.getByRole("link", { name: "Carte" })).toHaveAttribute("href", "/carte");
    expect(m.getByRole("link", { name: "Passer en mode hôte" })).toHaveAttribute("href", "/host");
    expect(m.queryByRole("link", { name: "Profil" })).not.toBeInTheDocument();
    fireEvent.click(m.getByRole("button", { name: "Connexion" }));
    expect(auth.openAuth).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  test("the login button opens the shared auth modal", () => {
    const auth = setup();
    fireEvent.click(screen.getAllByRole("button", { name: "Connexion" })[0]);
    expect(auth.openAuth).toHaveBeenCalled();
  });

  test("renders the auth modal when authOpen is true in AuthContext", () => {
    setup({ authOpen: true });
    expect(screen.getByRole("dialog")).toHaveTextContent("AuthModal");
  });
});

describe("Header — roles", () => {
  test("an admin sees « Administration » and the host dashboard link", () => {
    setup({ user: { ...kofi, role: "ADMIN" } });
    fireEvent.click(screen.getByRole("button", { name: /Menu du compte/ }));
    const m = within(menu());
    expect(m.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
    expect(m.getByRole("link", { name: "Tableau de bord hôte" })).toHaveAttribute("href", "/host");
  });

  test("a host sees « Tableau de bord hôte » but no administration link", () => {
    setup({ user: { ...kofi, role: "HOST" } });
    fireEvent.click(screen.getByRole("button", { name: /Menu du compte/ }));
    const m = within(menu());
    expect(m.getByRole("link", { name: "Tableau de bord hôte" })).toHaveAttribute("href", "/host");
    expect(m.queryByRole("link", { name: "Administration" })).toBeNull();
  });

  test("a guest has no administration link", () => {
    setup({ user: { ...kofi, role: "GUEST" } });
    fireEvent.click(screen.getByRole("button", { name: /Menu du compte/ }));
    expect(within(menu()).queryByRole("link", { name: "Administration" })).toBeNull();
    expect(within(menu()).getByRole("link", { name: "Espace hôte" })).toBeInTheDocument();
  });
});
