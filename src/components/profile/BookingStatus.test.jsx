import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import MyBookings from "./MyBookings";
import { LanguageProvider } from "../../context/LanguageContext";
import { api, toIsoDay } from "../../api/client";

vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
});
vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return { ...actual, api: { getMyBookings: vi.fn(), cancelBooking: vi.fn() } };
});

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toIsoDay(d);
};
const booking = (id, status, extra = {}) => ({
  id,
  listingId: `l-${id}`,
  checkIn: day(10),
  checkOut: day(13),
  nights: 3,
  guests: 2,
  totalPrice: 90000,
  currency: "XOF",
  status,
  listing: { id: `l-${id}`, title: `Séjour ${id}`, location: "Lomé", currency: "XOF" },
  ...extra,
});

const section = (name) => screen.getByRole("region", { name: new RegExp(`^${name}`) });
const item = (title) =>
  screen.getAllByRole("listitem").find((li) => within(li).queryByRole("link", { name: title }));

const renderBookings = async (bookings) => {
  api.getMyBookings.mockResolvedValue(bookings);
  render(
    <LanguageProvider>
      <MyBookings />
    </LanguageProvider>
  );
  await screen.findByRole("heading", { name: /^À venir/ });
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  api.getMyBookings.mockReset();
  api.cancelBooking.mockReset();
});

describe("Booking statuses", () => {
  test("badges for each status; declined and expired requests are listed with the cancelled ones", async () => {
    await renderBookings([
      booking("p", "PENDING", { expiresAt: "2030-05-02T14:30:00.000Z" }),
      booking("c", "CONFIRMED"),
      booking("d", "DECLINED"),
      booking("e", "EXPIRED"),
      booking("x", "CANCELLED"),
    ]);
    const upcoming = section("À venir");
    expect(within(upcoming).getByText("En attente de l'hôte")).toHaveClass("booking-status--pending");
    expect(within(upcoming).getByText("Confirmée")).toHaveClass("booking-status--confirmed");

    const closed = section("Annulées");
    expect(within(closed).getByText("Refusée")).toHaveClass("booking-status--declined");
    expect(within(closed).getByText("Expirée")).toHaveClass("booking-status--expired");
    expect(within(closed).getByText("Annulée")).toHaveClass("booking-status--cancelled");
    expect(within(closed).getByText(/Les dates ont été libérées/)).toBeInTheDocument();
    expect(within(closed).getByText(/n'a pas répondu à temps/)).toBeInTheDocument();
    // Rien à annuler dans les réservations closes.
    expect(within(closed).queryByRole("button")).toBeNull();
  });

  test("a pending request shows the host's deadline and can be cancelled", async () => {
    api.cancelBooking.mockResolvedValue({ status: "CANCELLED" });
    await renderBookings([booking("p", "PENDING", { expiresAt: "2030-05-02T14:30:00.000Z" })]);
    const pending = within(item("Séjour p"));
    expect(pending.getByText(/L'hôte a jusqu'au .*2030.* pour répondre\./)).toBeInTheDocument();

    fireEvent.click(pending.getByRole("button", { name: "Annuler la demande" }));
    expect(pending.getByText("Annuler cette demande de réservation ?")).toBeInTheDocument();
    fireEvent.click(pending.getByRole("button", { name: "Oui, annuler" }));
    expect(api.cancelBooking).toHaveBeenCalledWith("p");
    expect(await within(section("Annulées")).findByRole("link", { name: "Séjour p" })).toBeInTheDocument();
  });

  test("a confirmed upcoming stay can be cancelled; a stay that has started cannot", async () => {
    await renderBookings([
      booking("c", "CONFIRMED"),
      booking("s", "CONFIRMED", { checkIn: day(-1), checkOut: day(2) }),
    ]);
    expect(within(item("Séjour c")).getByRole("button", { name: "Annuler la réservation" })).toBeInTheDocument();
    expect(within(item("Séjour s")).queryByRole("button")).toBeNull();
  });
});
