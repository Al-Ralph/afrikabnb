import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import Host from "./Host";
import { LanguageProvider } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");
    return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
  },
  { virtual: true }
);

jest.mock("../api/client", () => {
  const actual = jest.requireActual("../api/client");
  return {
    ...actual,
    api: {
      getMyListings: jest.fn(),
      getMyHostBookings: jest.fn(),
      deleteListing: jest.fn(),
      cancelBooking: jest.fn(),
      createListing: jest.fn(),
      updateListing: jest.fn(),
      geocode: jest.fn(),
    },
  };
});
jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
  OPEN_AUTH_EVENT: "afrikabnb:open-auth",
}));
jest.mock("../hooks/useGoogleMapsScript", () => ({
  useGoogleMapsScript: () => ({ loaded: false, error: null, hasKey: false }),
}));
jest.mock("../components/Footer", () => () => <footer>Footer</footer>);

const nextYear = new Date().getFullYear() + 1;
const listing = { id: "1", title: "Villa Lagune", location: "Lomé", price: 45000, currency: "XOF", upcomingBookings: 2, image: "https://img.test/v.jpg" };
const booking = {
  id: "b1",
  checkIn: `${nextYear}-03-01`,
  checkOut: `${nextYear}-03-04`,
  nights: 3,
  guests: 2,
  totalPrice: 135000,
  currency: "XOF",
  status: "CONFIRMED",
  guest: { id: "g1", name: "Kofi", avatar: null },
  listing: { id: "1", title: "Villa Lagune" },
};

const renderHost = () =>
  render(
    <LanguageProvider>
      <Host />
    </LanguageProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getMyListings.mockResolvedValue([listing]);
  api.getMyHostBookings.mockResolvedValue([booking]);
  useAuth.mockReturnValue({ user: { id: "h1", name: "Awa" }, loading: false });
});

describe("Host", () => {
  test("logged out: invites to log in and dispatches the open-auth event", () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    const onOpenAuth = jest.fn();
    window.addEventListener("afrikabnb:open-auth", onOpenAuth);
    renderHost();
    fireEvent.click(screen.getByRole("button", { name: "Se connecter pour devenir hôte" }));
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
    expect(api.getMyListings).not.toHaveBeenCalled();
    window.removeEventListener("afrikabnb:open-auth", onOpenAuth);
  });

  test("lists my listings with upcoming bookings and the bookings received", async () => {
    renderHost();
    expect(await screen.findByText("Réservations à venir : 2")).toBeInTheDocument();
    expect(await screen.findByText("Kofi")).toBeInTheDocument();
    expect(screen.getByText("Confirmée")).toBeInTheDocument();
  });

  test("deletes a listing after confirmation", async () => {
    api.deleteListing.mockResolvedValue(undefined);
    renderHost();
    const [item] = await screen.findAllByRole("listitem");
    fireEvent.click(within(item).getByRole("button", { name: "Supprimer" }));
    expect(api.deleteListing).not.toHaveBeenCalled();
    fireEvent.click(within(item).getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.deleteListing).toHaveBeenCalledWith("1"));
    expect(await screen.findByText("Annonce supprimée.")).toBeInTheDocument();
    expect(screen.queryByText("Réservations à venir : 2")).not.toBeInTheDocument();
  });

  test("cancels an upcoming booking received", async () => {
    api.cancelBooking.mockResolvedValue({ ...booking, status: "CANCELLED", guest: undefined });
    renderHost();
    fireEvent.click(await screen.findByRole("button", { name: "Annuler la réservation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, confirmer" }));
    expect(await screen.findByText("Annulée")).toBeInTheDocument();
    expect(api.cancelBooking).toHaveBeenCalledWith("b1");
    expect(screen.getByText("Kofi")).toBeInTheDocument();
  });

  test("opens the creation form", async () => {
    renderHost();
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle annonce" }));
    expect(screen.getByRole("heading", { name: "Publier une annonce" })).toBeInTheDocument();
    await screen.findByText("Kofi");
  });
});
