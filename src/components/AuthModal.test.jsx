import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AuthModal from "./AuthModal";
import { LanguageProvider } from "../context/LanguageContext";
import { api } from "../api/client";

vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
});
vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return { ...actual, api: { forgotPassword: vi.fn() } };
});
const mockLogin = vi.fn();
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ login: mockLogin, register: vi.fn() }) }));

const NEUTRAL =
  "Si un compte existe pour cette adresse, un e-mail contenant un lien de réinitialisation vient d'être envoyé. Le lien est valable 1 heure.";

const renderModal = (props = {}) =>
  render(
    <LanguageProvider>
      <AuthModal isOpen onClose={vi.fn()} {...props} />
    </LanguageProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  api.forgotPassword.mockReset();
  mockLogin.mockReset();
});

describe("AuthModal — forgot password", () => {
  test("the login screen links to « Mot de passe oublié ? », which sends the email and shows a neutral message", async () => {
    api.forgotPassword.mockResolvedValue({ message: "texte serveur" });
    renderModal();
    expect(screen.getByRole("heading", { name: "Connexion" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mot de passe oublié ?" }));

    expect(screen.getByRole("heading", { name: "Mot de passe oublié" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: " kofi@afrikabnb.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));

    expect(await screen.findByRole("status")).toHaveTextContent(NEUTRAL);
    expect(api.forgotPassword).toHaveBeenCalledWith("kofi@afrikabnb.com");
    expect(mockLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retour à la connexion" }));
    expect(screen.getByRole("heading", { name: "Connexion" })).toBeInTheDocument();
  });

  test("same neutral message whatever the address (the UI never reveals whether the account exists)", async () => {
    api.forgotPassword.mockResolvedValue({ message: "autre texte" });
    renderModal({ initialMode: "forgot" });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "inconnu@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));
    expect(await screen.findByRole("status")).toHaveTextContent(NEUTRAL);
  });

  test("errors: rate limit (429), invalid email (400), server down", async () => {
    renderModal({ initialMode: "forgot" });
    const email = screen.getByRole("textbox", { name: "Email" });
    fireEvent.change(email, { target: { value: "kofi@afrikabnb.com" } });

    api.forgotPassword.mockRejectedValueOnce(Object.assign(new Error("x"), { status: 429 }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de tentatives. Réessayez dans quelques minutes.");

    api.forgotPassword.mockRejectedValueOnce(Object.assign(new Error("x"), { status: 400 }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Adresse e-mail invalide."));

    api.forgotPassword.mockRejectedValueOnce(Object.assign(new Error("x"), { network: true }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Impossible d'envoyer la demande pour le moment.")
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
