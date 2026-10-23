import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GuestBooking from "./GuestBooking";
import { LanguageProvider } from "../context/LanguageContext";
import { api } from "../api/client";

let mockToken = "";
vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return {
    useParams: () => (mockToken ? { token: mockToken } : {}),
    Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children),
  };
});
vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return { ...actual, api: { getGuestBooking: vi.fn(), cancelGuestBooking: vi.fn() } };
});

const TOKEN = "t".repeat(43);
const nextYear = new Date().getFullYear() + 1;
const booking = {
  id: "b1",
  status: "PENDING",
  checkIn: `${nextYear}-06-10`,
  checkOut: `${nextYear}-06-13`,
  nights: 3,
  guests: 2,
  totalPrice: 135000,
  currency: "XOF",
  expiresAt: new Date(Date.now() + 40 * 3600 * 1000).toISOString(),
  listing: { id: "7", title: "Villa Lomé", location: "Lomé, Togo", currency: "XOF" },
};

const renderPage = (token = TOKEN) => {
  mockToken = token;
  render(
    <LanguageProvider>
      <GuestBooking />
    </LanguageProvider>
  );
};

let replaceState;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  api.getGuestBooking.mockReset();
  api.cancelGuestBooking.mockReset();
  replaceState = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  replaceState.mockRestore();
  document.querySelectorAll('meta[name="referrer"]').forEach((m) => m.remove());
});

describe("GuestBooking (tracking page without an account)", () => {
  test("removes the token from the address bar, sets no-referrer and loads the booking with it", async () => {
    api.getGuestBooking.mockResolvedValue(booking);
    renderPage();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/reservation");
    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    expect(await screen.findByText("Villa Lomé")).toBeInTheDocument();
    expect(api.getGuestBooking).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText("En attente de l'hôte")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir le logement" })).toHaveAttribute("href", "/property/7");
  });

  test("cancels after confirmation", async () => {
    api.getGuestBooking.mockResolvedValue(booking);
    api.cancelGuestBooking.mockResolvedValue({ ...booking, status: "CANCELLED", expiresAt: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Annuler la réservation" }));
    expect(api.cancelGuestBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
    expect(await screen.findByText(/Votre réservation a été annulée/)).toBeInTheDocument();
    expect(api.cancelGuestBooking).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText("Annulée")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Annuler la réservation" })).not.toBeInTheDocument();
  });

  test("a 409 on cancel explains why and reloads the booking", async () => {
    api.getGuestBooking.mockResolvedValue(booking);
    api.cancelGuestBooking.mockRejectedValue(Object.assign(new Error("Conflit"), { status: 409 }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Annuler la réservation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cette réservation ne peut plus être annulée");
    expect(api.getGuestBooking).toHaveBeenCalledTimes(2);
  });

  test("unknown or expired link (404) and missing token show an explanation", async () => {
    api.getGuestBooking.mockRejectedValue(Object.assign(new Error("Introuvable"), { status: 404 }));
    renderPage();
    expect(await screen.findByText("Lien invalide ou expiré")).toBeInTheDocument();
  });

  test("without a token, no API call", () => {
    renderPage("");
    expect(screen.getByText(/Ouvrez le lien de suivi reçu par e-mail/)).toBeInTheDocument();
    expect(api.getGuestBooking).not.toHaveBeenCalled();
  });
});
