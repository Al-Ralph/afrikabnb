import React from "react";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import BookingWidget, { checkoutPath } from "./BookingWidget";
import { LanguageProvider } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));

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
  mockNavigate.mockReset();
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

  test("« Réserver » opens the booking step with the dates and guests (no direct booking)", async () => {
    await renderWidget();
    fireEvent.click(widget().getByRole("button", { name: "Réserver" }));
    expect(mockNavigate).toHaveBeenCalledWith(`/reserver/7?checkIn=${nextYear}-06-10&checkOut=${nextYear}-06-13&guests=2`, {
      state: { listing },
    });
    expect(api.createBooking).not.toHaveBeenCalled();
  });

  test("logged-out visitors can also continue to the booking step (booking without an account)", async () => {
    useAuth.mockReturnValue({ user: null });
    await renderWidget();
    fireEvent.click(widget().getByRole("button", { name: "Réserver" }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("without dates, asks to choose them instead of opening the booking step", async () => {
    mockApplied = {};
    await renderWidget();
    fireEvent.click(widget().getByRole("button", { name: "Réserver" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choisissez vos dates d’arrivée et de départ.");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("checkoutPath encodes the listing id and the stay", () => {
    expect(checkoutPath("a b", { checkIn: "2030-01-02", checkOut: "2030-01-05", guests: 3 })).toBe(
      "/reserver/a%20b?checkIn=2030-01-02&checkOut=2030-01-05&guests=3"
    );
  });

  test("demo listings show a notice and no booking form", async () => {
    await renderWidget({ demo: true });
    expect(screen.getByRole("note")).toHaveTextContent("Réservation indisponible en mode démo");
    expect(widget().queryByRole("button", { name: "Réserver" })).not.toBeInTheDocument();
    expect(api.getAvailability).not.toHaveBeenCalled();
  });

  test("on-request listing (instantBook=false): « Demande de réservation » opens the booking step", async () => {
    await renderWidget({ listing: { ...listing, instantBook: false } });
    expect(widget().getByText(/Cet hôte valide chaque demande/)).toBeInTheDocument();
    expect(widget().queryByRole("button", { name: "Réserver" })).not.toBeInTheDocument();
    fireEvent.click(widget().getByRole("button", { name: "Demande de réservation" }));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/reserver\/7\?/), expect.anything());
  });

  test("dates blocked by the host (returned in availability.booked) cannot be booked", async () => {
    api.getAvailability.mockResolvedValue({
      listingId: "7",
      booked: [{ checkIn: `${nextYear}-06-11`, checkOut: `${nextYear}-06-12` }],
      blocked: [{ startDate: `${nextYear}-06-11`, endDate: `${nextYear}-06-12` }],
    });
    await renderWidget();
    await waitFor(() => expect(widget().getByRole("alert")).toHaveTextContent("Ces dates ne sont plus disponibles"));
    expect(widget().getByRole("button", { name: "Réserver" })).toBeDisabled();
  });
});
