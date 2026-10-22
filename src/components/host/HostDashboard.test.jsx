import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import HostDashboard from "./HostDashboard";
import { LanguageProvider } from "../../context/LanguageContext";
import { api } from "../../api/client";

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return { ...actual, api: { getHostStats: vi.fn() } };
});

const y = new Date().getFullYear() + 1;
const stats = {
  revenue: { XOF: { past: 135000, upcoming: 180000, total: 315000 }, EUR: { past: 0, upcoming: 250, total: 250 } },
  nightsBooked: { past: 3, upcoming: 4, total: 7 },
  occupancy: [{ listingId: "1", title: "Villa Lagune", last30: 0.1, last90: 0.0333, next30: 0.1333, next90: 0.0444 }],
  averageRating: 4.5,
  reviewCount: 2,
  listingsCount: 2,
  pendingRequests: 1,
  upcomingArrivals: [
    { id: "b1", checkIn: `${y}-02-01`, checkOut: `${y}-02-04`, nights: 3, guest: { name: "Kofi" }, listing: { title: "Villa Lagune" } },
  ],
};

const renderDashboard = (props = {}) =>
  render(
    <LanguageProvider>
      <HostDashboard onCreateListing={vi.fn()} onShowRequests={vi.fn()} {...props} />
    </LanguageProvider>
  );

// Montants attendus formatés par Intl (espaces insécables normalisés comme le fait Testing Library).
const fr = (n, cur) =>
  new Intl.NumberFormat("fr", { style: "currency", currency: cur, minimumFractionDigits: 0, maximumFractionDigits: cur === "XOF" ? 0 : 2 })
    .format(n)
    .replace(/\s+/g, " ");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  api.getHostStats.mockReset();
});

describe("HostDashboard", () => {
  test("shows a skeleton while loading, then revenue per currency, nights, rating and arrivals", async () => {
    api.getHostStats.mockResolvedValue(stats);
    const onShowRequests = vi.fn();
    renderDashboard({ onShowRequests });
    expect(screen.getByRole("status")).toHaveTextContent("Chargement…");

    const past = (await screen.findByText("Revenus encaissés")).closest("li");
    expect(within(past).getByText(`${fr(135000, "XOF")} · ${fr(0, "EUR")}`)).toBeInTheDocument();
    const upcoming = screen.getByText("Revenus à venir").closest("li");
    expect(within(upcoming).getByText(`${fr(180000, "XOF")} · ${fr(250, "EUR")}`)).toBeInTheDocument();
    expect(screen.getByText("3 passées · 4 à venir")).toBeInTheDocument();
    expect(screen.getByText("4,5")).toBeInTheDocument();
    expect(screen.getByText("2 avis")).toBeInTheDocument();
    expect(screen.getByText("Kofi")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Voir les demandes" }));
    expect(onShowRequests).toHaveBeenCalled();
  });

  test("occupancy table: past and upcoming rates in percent", async () => {
    api.getHostStats.mockResolvedValue(stats);
    renderDashboard();
    const table = await screen.findByRole("table");
    const row = within(table).getByRole("row", { name: /Villa Lagune/ });
    expect(row).toHaveTextContent("10 %");
    expect(row).toHaveTextContent("3 %");
    fireEvent.click(screen.getByRole("button", { name: "À venir" }));
    expect(screen.getByRole("button", { name: "À venir" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("table")).getByRole("row", { name: /Villa Lagune/ })).toHaveTextContent("13 %");
  });

  test("empty state for a host without listings", async () => {
    api.getHostStats.mockResolvedValue({ revenue: {}, nightsBooked: { past: 0, upcoming: 0, total: 0 }, occupancy: [], averageRating: null, reviewCount: 0, listingsCount: 0, pendingRequests: 0, upcomingArrivals: [] });
    const onCreateListing = vi.fn();
    renderDashboard({ onCreateListing });
    expect(await screen.findByText("Votre tableau de bord vous attend")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle annonce" }));
    expect(onCreateListing).toHaveBeenCalled();
  });

  test("no reviews and no arrivals yet", async () => {
    api.getHostStats.mockResolvedValue({ ...stats, averageRating: null, reviewCount: 0, pendingRequests: 0, upcomingArrivals: [] });
    renderDashboard();
    expect(await screen.findByText("Pas encore d’avis")).toBeInTheDocument();
    expect(screen.getByText("Aucune arrivée prévue.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voir les demandes" })).not.toBeInTheDocument();
  });

  test("error state", async () => {
    api.getHostStats.mockRejectedValue(new Error("boom"));
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Statistiques indisponibles");
  });
});
