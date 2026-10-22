import React, { useState } from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import HostBookings, { effectiveStatus, formatRemaining } from "./HostBookings";
import { LanguageProvider } from "../../context/LanguageContext";
import { api } from "../../api/client";

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return { ...actual, api: { confirmBooking: vi.fn(), declineBooking: vi.fn(), cancelBooking: vi.fn() } };
});

const nextYear = new Date().getFullYear() + 1;
const inHours = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
const base = {
  checkIn: `${nextYear}-05-01`,
  checkOut: `${nextYear}-05-03`,
  nights: 2,
  guests: 2,
  totalPrice: 90000,
  currency: "XOF",
  listing: { id: "1", title: "Villa Lagune" },
};
const pending = { ...base, id: "p1", status: "PENDING", expiresAt: inHours(5.5), guest: { id: "g1", name: "Ama" } };
const confirmed = { ...base, id: "c1", status: "CONFIRMED", expiresAt: null, guest: { id: "g2", name: "Kofi" } };
const declined = { ...base, id: "d1", status: "DECLINED", expiresAt: null, guest: { id: "g3", name: "Yao" } };
const expired = { ...base, id: "e1", status: "EXPIRED", expiresAt: null, guest: { id: "g4", name: "Esi" } };

const Harness = ({ initial, onReload }) => {
  const [bookings, setBookings] = useState(initial);
  return (
    <HostBookings
      bookings={bookings}
      onBookingUpdated={(u) => setBookings((prev) => prev.map((b) => (b.id === u.id ? u : b)))}
      onReload={onReload}
    />
  );
};

const renderBookings = (initial, onReload = vi.fn()) => {
  render(
    <LanguageProvider>
      <Harness initial={initial} onReload={onReload} />
    </LanguageProvider>
  );
  return onReload;
};

const itemOf = (name) => screen.getByText(name).closest("li");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("helpers", () => {
  test("a pending request past its deadline is shown as expired", () => {
    expect(effectiveStatus({ status: "PENDING", expiresAt: inHours(-1) })).toBe("EXPIRED");
    expect(effectiveStatus({ status: "PENDING", expiresAt: inHours(1) })).toBe("PENDING");
    expect(effectiveStatus({ status: "CONFIRMED", expiresAt: null })).toBe("CONFIRMED");
  });

  test("formats the remaining time with localized units", () => {
    const plain = (s) => s.replace(/\s+/g, " ");
    expect(plain(formatRemaining((5 * 60 + 30) * 60000, "fr"))).toBe("5 h 30 min");
    expect(plain(formatRemaining(3 * 60000, "fr"))).toBe("3 min");
    expect(plain(formatRemaining(2 * 3600000, "en"))).toBe("2 hr");
  });
});

describe("HostBookings", () => {
  test("shows status badges, the response deadline and filters by status", () => {
    renderBookings([pending, confirmed, declined, expired]);
    expect(within(itemOf("Ama")).getByText("En attente")).toBeInTheDocument();
    expect(within(itemOf("Ama")).getByText("Réponse attendue sous 5 h 30 min")).toBeInTheDocument();
    expect(within(itemOf("Yao")).getByText("Refusée")).toBeInTheDocument();
    expect(within(itemOf("Esi")).getByText("Expirée")).toBeInTheDocument();
    // Pas d'actions sur une demande refusée ou expirée.
    expect(within(itemOf("Esi")).queryByRole("button")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^En attente/ }));
    expect(screen.getByRole("button", { name: /^En attente/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Ama")).toBeInTheDocument();
    expect(screen.queryByText("Kofi")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Annulées/ }));
    expect(screen.getByText("Aucune réservation avec ce statut.")).toBeInTheDocument();
  });

  test("accepts a pending request after confirmation", async () => {
    api.confirmBooking.mockResolvedValue({ ...pending, status: "CONFIRMED", expiresAt: null });
    renderBookings([pending]);
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }));
    expect(api.confirmBooking).not.toHaveBeenCalled();
    expect(screen.getByText("Accepter cette demande ?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.confirmBooking).toHaveBeenCalledWith("p1"));
    expect(await screen.findByText("Demande acceptée : la réservation est confirmée.")).toBeInTheDocument();
    expect(within(itemOf("Ama")).getByText("Confirmée")).toBeInTheDocument();
  });

  test("declines a pending request after confirmation", async () => {
    api.declineBooking.mockResolvedValue({ ...pending, status: "DECLINED", expiresAt: null });
    renderBookings([pending]);
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.declineBooking).toHaveBeenCalledWith("p1"));
    expect(await within(itemOf("Ama")).findByText("Refusée")).toBeInTheDocument();
  });

  test("409 (expired meanwhile): explains it and reloads the bookings", async () => {
    api.confirmBooking.mockRejectedValue(Object.assign(new Error("Demande expirée"), { status: 409 }));
    const onReload = renderBookings([pending]);
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, confirmer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cette demande a expiré ou a déjà été traitée");
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  test("a request whose deadline has passed shows as expired without actions", () => {
    renderBookings([{ ...pending, expiresAt: inHours(-0.5) }]);
    expect(within(itemOf("Ama")).getByText("Expirée")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument();
  });

  test("shows the guest's contact sheet (mailto, tel, country, arrival, message) and a « Sans compte » badge", () => {
    const guestCheckout = {
      ...base,
      id: "g9",
      status: "PENDING",
      expiresAt: inHours(10),
      guest: null,
      guestId: null,
      guestAccount: false,
      contact: {
        name: "Akosua Boateng",
        email: "akosua@example.com",
        phone: "+233 24 000 0000",
        country: "GH",
        arrivalTime: "18:30",
        message: "Arrivée tardive\nMerci !",
      },
    };
    renderBookings([guestCheckout]);
    const item = screen.getByRole("region", { name: /Coordonnées du voyageur/ }).closest("li");
    const scope = within(item);
    expect(scope.getByText("Akosua Boateng", { selector: ".host-booking-name" })).toBeInTheDocument();
    expect(scope.getByText("Sans compte")).toBeInTheDocument();
    expect(scope.getByRole("link", { name: "akosua@example.com" })).toHaveAttribute("href", "mailto:akosua@example.com");
    expect(scope.getByRole("link", { name: "+233 24 000 0000" })).toHaveAttribute("href", "tel:+233240000000");
    expect(scope.getByText("Ghana")).toBeInTheDocument();
    expect(scope.getByText("18:30")).toBeInTheDocument();
    expect(scope.getByText(/Arrivée tardive/)).toBeInTheDocument();
    expect(scope.getByText("Informations saisies par le voyageur")).toBeInTheDocument();
  });

  test("a booking without contact details says so; members have no « Sans compte » badge", () => {
    renderBookings([{ ...confirmed, guestAccount: true, contact: null }]);
    expect(within(itemOf("Kofi")).getByText("Aucune coordonnée transmise pour cette réservation.")).toBeInTheDocument();
    expect(screen.queryByText("Sans compte")).not.toBeInTheDocument();
  });
});
