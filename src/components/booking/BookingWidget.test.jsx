import React from "react";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import BookingWidget, { OPEN_AUTH_EVENT } from "./BookingWidget";
import { LanguageProvider } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";

vi.mock(
  "react-router-dom",
  async () => {
    const React = await vi.importActual("react");
    return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
  }
);

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return { ...actual, api: { getAvailability: vi.fn(), createBooking: vi.fn() } };
});

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn(), OPEN_AUTH_EVENT: "afrikabnb:open-auth" }));

const nextYear = new Date().getFullYear() + 1;
let mockApplied = {};
vi.mock("../../context/SearchContext", () => ({ useSearch: () => ({ appliedSearch: mockApplied }) }));

const listing = { id: "7", title: "Villa Lomé", price: 45000, currency: "XOF", maxGuests: 3, hostId: "host-1" };
const xof = (n) => new Intl.NumberFormat("fr", { style: "currency", currency: "XOF" }).format(n);

// Rend le widget puis laisse se résoudre le chargement de la disponibilité.
const renderWidget = async (props = {}) => {
  render(
    <LanguageProvider>
      <BookingWidget listing={listing} {...props} />
    </LanguageProvider>
  );
  await act(() => Promise.resolve());
};

const widget = () => within(screen.getByRole("complementary"));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  mockApplied = {
    checkIn: new Date(nextYear, 5, 10),
    checkOut: new Date(nextYear, 5, 13),
    adults: 2,
    children: 0,
  };
  useAuth.mockReturnValue({ user: { id: "guest-1", name: "Kofi" } });
  api.getAvailability.mockReset().mockResolvedValue({ listingId: "7", booked: [] });
  api.createBooking.mockReset();
});

describe("BookingWidget", () => {
  test("prefills dates and guests from the applied search and computes nights × price", async () => {
    await renderWidget();
    await waitFor(() => expect(api.getAvailability).toHaveBeenCalledWith("7"));
    expect(screen.getByTestId("booking-total").textContent).toBe(xof(135000));
    expect(widget().getByText(/× 3 nuits/).textContent).toBe(`${xof(45000)} × 3 nuits`);
    expect(widget().getByText("2", { selector: "output" })).toBeInTheDocument();
  });

  test("guests are capped at maxGuests", async () => {
    mockApplied = { ...mockApplied, adults: 6 };
    await renderWidget();
    expect(widget().getByText("3", { selector: "output" })).toBeInTheDocument();
    expect(widget().getByRole("button", { name: "Ajouter un voyageur" })).toBeDisabled();
  });

  test("booked nights from the availability are disabled in the calendar", async () => {
    api.getAvailability.mockResolvedValue({
      listingId: "7",
      booked: [{ checkIn: `${nextYear}-06-20`, checkOut: `${nextYear}-06-22` }],
    });
    await renderWidget();
    await waitFor(() => expect(api.getAvailability).toHaveBeenCalled());
    fireEvent.click(widget().getByRole("button", { name: /Arrivée/ }));
    const dayButtons = (day) =>
      widget()
        .getAllByRole("button", { name: String(day) })
        .filter((b) => b.classList.contains("date-picker-cell"))[0];
    await waitFor(() => expect(dayButtons(20)).toBeDisabled());
    expect(dayButtons(21)).toBeDisabled();
    expect(dayButtons(22)).not.toBeDisabled();
  });

  test("books the stay and shows a confirmation linking to the profile", async () => {
    api.createBooking.mockResolvedValue({
      id: "b1",
      checkIn: `${nextYear}-06-10`,
      checkOut: `${nextYear}-06-13`,
      totalPrice: 135000,
      currency: "XOF",
      status: "CONFIRMED",
    });
    await renderWidget();
    fireEvent.click(widget().getByRole("button", { name: "Réserver" }));
    expect(await screen.findByText("Réservation confirmée !")).toBeInTheDocument();
    expect(api.createBooking).toHaveBeenCalledWith("7", {
      checkIn: new Date(nextYear, 5, 10),
      checkOut: new Date(nextYear, 5, 13),
      guests: 2,
    });
    expect(screen.getByRole("link", { name: "Voir mes réservations" })).toHaveAttribute("href", "/profil");
  });

  test("a 409 shows 'dates unavailable' and refreshes the availability", async () => {
    api.createBooking.mockRejectedValue(Object.assign(new Error("Conflit"), { status: 409 }));
    await renderWidget();
    await waitFor(() => expect(api.getAvailability).toHaveBeenCalledTimes(1));
    fireEvent.click(widget().getByRole("button", { name: "Réserver" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ces dates ne sont plus disponibles");
    await waitFor(() => expect(api.getAvailability).toHaveBeenCalledTimes(2));
  });

  test("when logged out, asks to log in and dispatches the open-auth event", async () => {
    useAuth.mockReturnValue({ user: null });
    const onOpenAuth = vi.fn();
    window.addEventListener(OPEN_AUTH_EVENT, onOpenAuth);
    await renderWidget();
    fireEvent.click(widget().getByRole("button", { name: "Réserver" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Connectez-vous pour réserver ce logement.");
    expect(api.createBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_AUTH_EVENT, onOpenAuth);
  });

  test("demo listings show a notice and no booking form", async () => {
    await renderWidget({ demo: true });
    expect(screen.getByRole("note")).toHaveTextContent("Réservation indisponible en mode démo");
    expect(widget().queryByRole("button", { name: "Réserver" })).not.toBeInTheDocument();
    expect(api.getAvailability).not.toHaveBeenCalled();
  });
});
