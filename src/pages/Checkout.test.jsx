import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Checkout, { validateContact } from "./Checkout";
import { LanguageProvider } from "../context/LanguageContext";
import { api } from "../api/client";

const nextYear = new Date().getFullYear() + 1;
let mockQuery = "";
let mockState = null;
vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return {
    useParams: () => ({ id: "7" }),
    useSearchParams: () => [new URLSearchParams(mockQuery)],
    useLocation: () => ({ state: mockState }),
    Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children),
  };
});
vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return { ...actual, api: { getListing: vi.fn(), createBooking: vi.fn() } };
});
const mockAuth = { user: null, openAuth: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => mockAuth }));

const apiListing = {
  id: "7",
  title: "Villa Lomé",
  location: "Lomé, Togo",
  pricePerNight: 45000,
  currency: "XOF",
  maxGuests: 4,
  hostId: "host-1",
  instantBook: true,
};
const xof = (n) => new Intl.NumberFormat("fr", { style: "currency", currency: "XOF" }).format(n);

const renderPage = async (query = `checkIn=${nextYear}-06-10&checkOut=${nextYear}-06-13&guests=2`, ready = () => screen.findByRole("heading", { level: 1 })) => {
  mockQuery = query;
  render(
    <LanguageProvider>
      <Checkout />
    </LanguageProvider>
  );
  await ready();
};

const fillValid = () => {
  fireEvent.change(screen.getByLabelText("Nom complet"), { target: { value: "Ama Mensah" } });
  fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "ama@example.com" } });
  fireEvent.change(screen.getByLabelText("Téléphone"), { target: { value: "+228 90 00 00 00" } });
  fireEvent.change(screen.getByLabelText("Pays de résidence"), { target: { value: "TG" } });
  fireEvent.change(screen.getByLabelText("Message à l'hôte (facultatif)"), { target: { value: "Bonjour" } });
  fireEvent.click(screen.getByLabelText("J'accepte les CGU et que ces informations soient transmises à l'hôte"));
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  mockState = null;
  mockAuth.user = null;
  mockAuth.openAuth.mockReset();
  api.getListing.mockReset().mockResolvedValue(apiListing);
  api.createBooking.mockReset();
});

describe("Checkout (booking step)", () => {
  test("guest: summary, request notice, contact notice and a login shortcut", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Demande de réservation");
    expect(screen.getByText(/Sans compte, votre réservation est envoyée comme une demande/)).toBeInTheDocument();
    expect(screen.getByText("Vos coordonnées seront transmises à l'hôte pour organiser votre séjour.")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-total").textContent).toBe(xof(135000));
    // Total déjà en FCFA : pas de ligne « montant de référence ».
    expect(screen.queryByTestId("checkout-charged")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lire les CGU" })).toHaveAttribute("href", "/cgu");
    expect(screen.getByRole("link", { name: "Politique de confidentialité" })).toHaveAttribute("href", "/confidentialite");
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(mockAuth.openAuth).toHaveBeenCalledWith("login");
  });

  test("client-side validation: accessible errors, focus on the first invalid field, no API call", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    const name = screen.getByLabelText("Nom complet");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", "checkout-name-error");
    expect(screen.getByText("Indiquez votre nom complet (2 caractères minimum).")).toBeInTheDocument();
    expect(screen.getByText("Choisissez votre pays.")).toBeInTheDocument();
    expect(screen.getByText("Vous devez accepter les conditions pour réserver.")).toBeInTheDocument();
    expect(document.activeElement).toBe(name);
    expect(api.createBooking).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Téléphone"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    expect(screen.getByText("Indiquez un numéro valide avec l'indicatif (6 à 15 chiffres).")).toBeInTheDocument();
  });

  test("validateContact mirrors the API rules", () => {
    const ok = {
      name: "Ama",
      email: "a@b.co",
      phone: "+228 90 00 00 00",
      country: "TG",
      arrivalTime: "",
      message: "",
      acceptTerms: true,
    };
    expect(validateContact(ok)).toEqual({});
    expect(Object.keys(validateContact({ ...ok, phone: "+1234567890123456" }))).toEqual(["phone"]);
    expect(Object.keys(validateContact({ ...ok, arrivalTime: "25:00" }))).toEqual(["arrivalTime"]);
    expect(Object.keys(validateContact({ ...ok, message: "x".repeat(1001) }))).toEqual(["message"]);
  });

  test("logged-in member: same form prefilled with the account name and email", async () => {
    mockAuth.user = { id: "u1", name: "Kofi Mensah", email: "kofi@example.com" };
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Confirmer et réserver");
    expect(screen.getByLabelText("Nom complet")).toHaveValue("Kofi Mensah");
    expect(screen.getByLabelText("Adresse e-mail")).toHaveValue("kofi@example.com");
    expect(screen.queryByRole("button", { name: "Se connecter" })).not.toBeInTheDocument();
  });

  test("honeypot field is hidden from people and sent with the booking", async () => {
    await renderPage();
    const trap = document.getElementById("checkout-website");
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap).toHaveAttribute("autocomplete", "off");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
    fireEvent.change(trap, { target: { value: "http://spam" } });
    api.createBooking.mockRejectedValue(Object.assign(new Error("Requête invalide"), { status: 400 }));
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Certaines informations sont invalides");
    expect(api.createBooking.mock.calls[0][1].website).toBe("http://spam");
  });

  test("guest booking: sends contact + terms, then shows the request confirmation with the tracking link", async () => {
    api.createBooking.mockResolvedValue({
      id: "b1",
      status: "PENDING",
      checkIn: `${nextYear}-06-10`,
      checkOut: `${nextYear}-06-13`,
      totalPrice: 135000,
      currency: "XOF",
      manageUrl: "http://localhost:3000/reservation/abc",
    });
    await renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    expect(await screen.findByRole("heading", { name: "Demande envoyée" })).toBeInTheDocument();
    expect(api.createBooking).toHaveBeenCalledWith("7", {
      checkIn: `${nextYear}-06-10`,
      checkOut: `${nextYear}-06-13`,
      guests: 2,
      contact: { name: "Ama Mensah", email: "ama@example.com", phone: "+228 90 00 00 00", country: "TG", message: "Bonjour" },
      acceptTerms: true,
      website: "",
    });
    expect(screen.getByText(/L'hôte a 48 h pour répondre/)).toBeInTheDocument();
    expect(screen.getByText("Un e-mail récapitulatif vous a été envoyé à ama@example.com.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir le suivi de ma réservation" })).toHaveAttribute(
      "href",
      "http://localhost:3000/reservation/abc"
    );
  });

  test("409 and 429 errors are explained", async () => {
    api.createBooking.mockRejectedValueOnce(Object.assign(new Error("Conflit"), { status: 409 }));
    await renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ces dates ne sont plus disponibles");

    api.createBooking.mockRejectedValueOnce(Object.assign(new Error("Trop"), { status: 429 }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Trop de demandes en attente"));
  });

  test("invalid stay parameters show a way back to the listing", async () => {
    await renderPage(`checkIn=${nextYear}-06-13&checkOut=${nextYear}-06-10&guests=2`, () =>
      screen.findByText("Séjour à préciser")
    );
    expect(screen.getByRole("link", { name: "Retour au logement" })).toHaveAttribute("href", "/property/7");
  });
});
