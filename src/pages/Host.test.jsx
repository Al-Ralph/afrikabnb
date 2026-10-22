import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Host from "./Host";
import { LanguageProvider } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    api: {
      getMyListings: vi.fn(),
      getMyHostBookings: vi.fn(),
      getHostStats: vi.fn(),
      getBlockedPeriods: vi.fn(),
      deleteListing: vi.fn(),
      cancelBooking: vi.fn(),
      createListing: vi.fn(),
      updateListing: vi.fn(),
      geocode: vi.fn(),
    },
  };
});
vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
  OPEN_AUTH_EVENT: "afrikabnb:open-auth",
}));
vi.mock("../hooks/useGoogleMapsScript", () => ({
  useGoogleMapsScript: () => ({ loaded: false, error: null, hasKey: false }),
}));
vi.mock("../components/Footer", () => ({ default: () => <footer>Footer</footer> }));

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

let currentSearch = "";
const LocationSpy = () => {
  currentSearch = useLocation().search;
  return null;
};

const renderHost = (path = "/host") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Host />
        <LocationSpy />
      </LanguageProvider>
    </MemoryRouter>
  );

const stats = {
  revenue: { XOF: { past: 135000, upcoming: 180000, total: 315000 } },
  nightsBooked: { past: 3, upcoming: 4, total: 7 },
  occupancy: [{ listingId: "1", title: "Villa Lagune", last30: 0.1, last90: 0.0333, next30: 0.1333, next90: 0.0444 }],
  averageRating: 4.5,
  reviewCount: 2,
  listingsCount: 1,
  pendingRequests: 0,
  upcomingArrivals: [],
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getMyListings.mockResolvedValue([listing]);
  api.getMyHostBookings.mockResolvedValue([booking]);
  api.getHostStats.mockResolvedValue(stats);
  api.getBlockedPeriods.mockResolvedValue([]);
  useAuth.mockReturnValue({ user: { id: "h1", name: "Awa" }, loading: false });
});

describe("Host", () => {
  test("logged out: invites to log in and dispatches the open-auth event", () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    const onOpenAuth = vi.fn();
    window.addEventListener("afrikabnb:open-auth", onOpenAuth);
    renderHost();
    fireEvent.click(screen.getByRole("button", { name: "Se connecter pour devenir hôte" }));
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
    expect(api.getMyListings).not.toHaveBeenCalled();
    window.removeEventListener("afrikabnb:open-auth", onOpenAuth);
  });

  test("opens on the dashboard tab and keeps the active tab in the URL (?tab=)", async () => {
    renderHost();
    expect(screen.getByRole("tab", { name: "Tableau de bord" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Revenus encaissés")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Réservations" }));
    expect(currentSearch).toBe("?tab=bookings");
    expect(screen.getByRole("tabpanel", { name: "Réservations" })).toBeInTheDocument();
    // Navigation au clavier entre les onglets (motif ARIA tablist).
    fireEvent.keyDown(screen.getByRole("tab", { name: "Réservations" }), { key: "ArrowRight" });
    expect(currentSearch).toBe("?tab=availability");
    expect(screen.getByRole("tab", { name: "Disponibilités" })).toHaveFocus();
  });

  test("lists my listings with upcoming bookings and the bookings received", async () => {
    renderHost("/host?tab=listings");
    expect(await screen.findByText("Réservations à venir : 2")).toBeInTheDocument();
    expect(screen.getByText("Réservation instantanée")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Réservations" }));
    expect(await screen.findByText("Kofi")).toBeInTheDocument();
    expect(screen.getByText("Confirmée")).toBeInTheDocument();
  });

  test("deletes a listing after confirmation", async () => {
    api.deleteListing.mockResolvedValue(undefined);
    renderHost("/host?tab=listings");
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
    renderHost("/host?tab=bookings");
    fireEvent.click(await screen.findByRole("button", { name: "Annuler la réservation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, confirmer" }));
    expect(await screen.findByText("Annulée")).toBeInTheDocument();
    expect(api.cancelBooking).toHaveBeenCalledWith("b1");
    expect(screen.getByText("Kofi")).toBeInTheDocument();
  });

  test("opens the creation form on the listings tab", async () => {
    renderHost();
    await screen.findByText("Revenus encaissés");
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle annonce" }));
    expect(screen.getByRole("heading", { name: "Publier une annonce" })).toBeInTheDocument();
    expect(currentSearch).toBe("?tab=listings");
    expect(screen.getByRole("tab", { name: "Mes annonces" })).toHaveAttribute("aria-selected", "true");
  });

  test("shows the number of pending requests on the bookings tab", async () => {
    const expiresAt = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    api.getMyHostBookings.mockResolvedValue([booking, { ...booking, id: "b2", status: "PENDING", expiresAt }]);
    renderHost();
    const tab = screen.getByRole("tab", { name: /Réservations/ });
    await waitFor(() => expect(tab).toHaveTextContent("1 demandes en attente"));
  });
});
