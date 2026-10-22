import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ResetPassword from "./ResetPassword";
import { LanguageProvider } from "../context/LanguageContext";
import { api } from "../api/client";

let mockQuery = "";
vi.mock("react-router-dom", () => ({ useSearchParams: () => [new URLSearchParams(mockQuery)] }));
vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return { ...actual, api: { resetPassword: vi.fn() } };
});
const mockAuth = { logout: vi.fn(), openAuth: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => mockAuth }));

const TOKEN = "a".repeat(43);

const renderPage = (query = `token=${TOKEN}`) => {
  mockQuery = query;
  render(
    <LanguageProvider>
      <ResetPassword />
    </LanguageProvider>
  );
};

const fill = (password, confirm = password) => {
  fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  api.resetPassword.mockReset();
  mockAuth.logout.mockReset();
  mockAuth.openAuth.mockReset();
});

describe("ResetPassword page", () => {
  test("success: sends token + new password, signs out locally and invites to log in", async () => {
    api.resetPassword.mockResolvedValue({ message: "ok" });
    renderPage();
    expect(screen.getByRole("heading", { name: "Choisir un nouveau mot de passe" })).toBeInTheDocument();
    fill("nouveau-secret");

    expect(await screen.findByText("Mot de passe modifié")).toBeInTheDocument();
    expect(api.resetPassword).toHaveBeenCalledWith(TOKEN, "nouveau-secret");
    expect(mockAuth.logout).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(mockAuth.openAuth).toHaveBeenCalledWith("login");
  });

  test("client-side validation: 8 characters minimum and matching confirmation (no API call)", () => {
    renderPage();
    fill("court");
    expect(screen.getByText("Le mot de passe doit contenir au moins 8 caractères.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveAttribute("aria-invalid", "true");

    fill("assez-long-1", "assez-long-2");
    expect(screen.getByText("Les deux mots de passe ne correspondent pas.")).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  test("invalid or expired token (400): explains and offers a new link", async () => {
    api.resetPassword.mockRejectedValue(Object.assign(new Error("Lien invalide ou expiré"), { status: 400 }));
    renderPage();
    fill("nouveau-secret");
    expect(await screen.findByRole("alert")).toHaveTextContent("Lien invalide ou expiré");
    expect(mockAuth.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Demander un nouveau lien" }));
    expect(mockAuth.openAuth).toHaveBeenCalledWith("forgot");
  });

  test("a 400 about the password itself stays on the form with the API message", async () => {
    api.resetPassword.mockRejectedValue(
      Object.assign(new Error("Validation"), {
        status: 400,
        details: [{ path: "newPassword", message: "8 à 72 caractères" }],
      })
    );
    renderPage();
    fill("nouveau-secret");
    expect(await screen.findByText("8 à 72 caractères")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer le mot de passe" })).toBeInTheDocument();
  });

  test("rate limit (429) and server errors keep the form", async () => {
    api.resetPassword.mockRejectedValueOnce(Object.assign(new Error("x"), { status: 429 }));
    renderPage();
    fill("nouveau-secret");
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de tentatives");

    api.resetPassword.mockRejectedValueOnce(Object.assign(new Error("x"), { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(await screen.findByText("Impossible de modifier le mot de passe pour le moment.")).toBeInTheDocument();
  });

  test("a link without token shows the invalid-link state", () => {
    renderPage("");
    expect(screen.getByRole("alert")).toHaveTextContent("Ce lien est incomplet.");
    expect(screen.queryByLabelText("Nouveau mot de passe")).toBeNull();
  });

  test("removes the token from the address bar, keeps it for submission, and sets a no-referrer meta while mounted", async () => {
    api.resetPassword.mockResolvedValue({ message: "ok" });
    const replaceState = vi.spyOn(window.history, "replaceState");
    mockQuery = `token=${TOKEN}`;
    const { unmount } = render(
      <LanguageProvider>
        <ResetPassword />
      </LanguageProvider>
    );
    expect(replaceState).toHaveBeenCalledWith(null, "", "/reinitialiser-mot-de-passe");
    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

    fill("nouveau-secret");
    await screen.findByText("Mot de passe modifié");
    expect(api.resetPassword).toHaveBeenCalledWith(TOKEN, "nouveau-secret");

    unmount();
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
    replaceState.mockRestore();
  });
});
