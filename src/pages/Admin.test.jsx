import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Admin from "./Admin";
import { LanguageProvider } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    api: {
      getAdminStats: vi.fn(),
      getAdminUsers: vi.fn(),
      updateUserRole: vi.fn(),
      getAdminListings: vi.fn(),
      updateListingStatus: vi.fn(),
      getAdminReviews: vi.fn(),
      deleteReview: vi.fn(),
    },
  };
});
vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
  OPEN_AUTH_EVENT: "afrikabnb:open-auth",
}));
vi.mock("../components/Footer", () => ({ default: () => <footer>Footer</footer> }));

const admin = { id: "a1", name: "Admin", email: "admin@afrikabnb.com", role: "ADMIN" };
const users = [
  admin,
  { id: "u2", name: "Awa", email: "awa@test.com", role: "HOST", listingsCount: 3, bookingsCount: 1, createdAt: "2026-01-05T10:00:00.000Z" },
  { id: "u3", name: "Kofi", email: "kofi@test.com", role: "GUEST", listingsCount: 0, bookingsCount: 2, createdAt: "2026-02-01T10:00:00.000Z" },
];
const listings = [
  { id: "l1", title: "Villa Lagune", location: "Lomé", price: 45000, currency: "XOF", status: "ACTIVE", host: { name: "Awa", email: "awa@test.com" }, bookingsCount: 4, reviewsCount: 2 },
];
const reviews = [
  { id: "r1", rating: 2, comment: "Bruyant", createdAt: "2026-03-01T00:00:00.000Z", author: { name: "Kofi", email: "kofi@test.com" }, listing: { id: "l1", title: "Villa Lagune" } },
];

const renderAdmin = (path = "/admin") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Admin />
      </LanguageProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  Object.values(api).forEach((fn) => fn.mockReset());
  useAuth.mockReturnValue({ user: admin, loading: false });
  api.getAdminStats.mockResolvedValue({
    users: { total: 3, byRole: { GUEST: 1, HOST: 1, ADMIN: 1 } },
    listings: { total: 12, byStatus: { ACTIVE: 11, HIDDEN: 1 } },
    bookings: { total: 5, byStatus: { CONFIRMED: 3, PENDING: 2 } },
    confirmedRevenue: [{ currency: "XOF", total: 315000, bookings: 3 }],
  });
  api.getAdminUsers.mockResolvedValue({ data: users, total: 3, limit: 20, offset: 0 });
  api.getAdminListings.mockResolvedValue({ data: listings, total: 1, limit: 20, offset: 0 });
  api.getAdminReviews.mockResolvedValue({ data: reviews, total: 1, limit: 20, offset: 0 });
});

describe("Admin", () => {
  test("non-admin users get « Accès réservé » and no admin call is made", () => {
    useAuth.mockReturnValue({ user: { id: "h1", role: "HOST" }, loading: false });
    renderAdmin();
    expect(screen.getByRole("heading", { name: "Accès réservé" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(api.getAdminStats).not.toHaveBeenCalled();
  });

  test("logged-out visitors are invited to log in", () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    const onOpenAuth = vi.fn();
    window.addEventListener("afrikabnb:open-auth", onOpenAuth);
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
    window.removeEventListener("afrikabnb:open-auth", onOpenAuth);
  });

  test("overview shows the global statistics", async () => {
    renderAdmin();
    expect(screen.getByRole("tab", { name: "Vue d’ensemble" })).toHaveAttribute("aria-selected", "true");
    const usersCard = (await screen.findByText("Utilisateurs", { selector: ".admin-stat-label" })).closest("li");
    expect(within(usersCard).getByText("3")).toBeInTheDocument();
    expect(within(usersCard).getByText("Administrateur")).toBeInTheDocument();
    expect(screen.getByText("Masquée")).toBeInTheDocument();
    expect(screen.getByText("3 réservations")).toBeInTheDocument();
  });

  test("users: searches, then changes a role after confirmation", async () => {
    api.updateUserRole.mockResolvedValue({ ...users[2], role: "HOST" });
    renderAdmin("/admin?tab=users");
    const table = await screen.findByRole("table", { name: "Utilisateurs (3)" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5);
    // Son propre rôle n'est pas modifiable depuis l'interface.
    expect(screen.getByLabelText("Rôle de Admin")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Rechercher un utilisateur"), { target: { value: " kofi " } });
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    await waitFor(() => expect(api.getAdminUsers).toHaveBeenLastCalledWith({ q: "kofi", role: "", limit: 20, offset: 0 }));

    fireEvent.change(await screen.findByLabelText("Rôle de Kofi"), { target: { value: "HOST" } });
    expect(screen.getByText("Passer Kofi au rôle « Hôte » ?")).toBeInTheDocument();
    expect(api.updateUserRole).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.updateUserRole).toHaveBeenCalledWith("u3", "HOST"));
    expect(await screen.findByText("Kofi a désormais le rôle « Hôte ».")).toBeInTheDocument();
    expect(screen.getByLabelText("Rôle de Kofi")).toHaveValue("HOST");
  });

  test("users: the « last admin » 409 is explained and the role is unchanged", async () => {
    api.updateUserRole.mockRejectedValue(Object.assign(new Error("Impossible de retirer le dernier administrateur"), { status: 409 }));
    api.getAdminUsers.mockResolvedValue({ data: [admin, { ...users[1], role: "ADMIN" }], total: 2 });
    renderAdmin("/admin?tab=users");
    fireEvent.change(await screen.findByLabelText("Rôle de Awa"), { target: { value: "GUEST" } });
    fireEvent.click(screen.getByRole("button", { name: "Oui, confirmer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("il doit rester au moins un administrateur");
    expect(screen.getByLabelText("Rôle de Awa")).toHaveValue("ADMIN");
  });

  test("users: paginates by 20", async () => {
    api.getAdminUsers.mockResolvedValue({ data: users, total: 45 });
    renderAdmin("/admin?tab=users");
    expect(await screen.findByText("1–20 sur 45")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Précédent" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    await waitFor(() => expect(api.getAdminUsers).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20, limit: 20 })));
  });

  test("listings: hides a listing after confirmation and links to its page", async () => {
    api.updateListingStatus.mockResolvedValue({ ...listings[0], status: "HIDDEN" });
    renderAdmin("/admin?tab=listings");
    const link = await screen.findByRole("link", { name: "Villa Lagune" });
    expect(link).toHaveAttribute("href", "/property/l1");
    fireEvent.click(screen.getByRole("button", { name: "Masquer" }));
    expect(screen.getByText("Masquer « Villa Lagune » des résultats ?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.updateListingStatus).toHaveBeenCalledWith("l1", "HIDDEN"));
    expect(await screen.findByText("« Villa Lagune » est masquée.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réactiver" })).toBeInTheDocument();
  });

  test("reviews: deletes a review after confirmation", async () => {
    api.deleteReview.mockResolvedValue({ listing: { id: "l1", rating: 4.5, reviewCount: 1 } });
    renderAdmin("/admin?tab=reviews");
    expect(await screen.findByText("Bruyant")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(api.deleteReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.deleteReview).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("Avis supprimé.")).toBeInTheDocument();
    expect(screen.queryByText("Bruyant")).not.toBeInTheDocument();
  });
});
