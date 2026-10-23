import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import Profile from "./Profile";
import { LanguageProvider } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { api, toIsoDay } from "../api/client";

vi.mock(
  "react-router-dom",
  async () => {
    const React = await vi.importActual("react");
    return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
  }
);
vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    api: { getMyBookings: vi.fn(), cancelBooking: vi.fn(), createReview: vi.fn(), updateProfile: vi.fn() },
  };
});
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../components/Footer", () => ({ default: () => <footer>Footer</footer> }));

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toIsoDay(d);
};
const listing = (id, title, location = "Lomé, Togo") => ({
  id,
  title,
  location,
  image: `https://img/${id}.jpg`,
  currency: "XOF",
});

const upcoming = {
  id: "b-up",
  listingId: "l1",
  checkIn: day(10),
  checkOut: day(13),
  nights: 3,
  guests: 2,
  totalPrice: 135000,
  currency: "XOF",
  status: "CONFIRMED",
  hasReview: false,
  canReview: false,
  listing: listing("l1", "Villa Upcoming"),
};
const pastToReview = {
  id: "b-past",
  listingId: "l2",
  checkIn: day(-10),
  checkOut: day(-7),
  nights: 3,
  guests: 1,
  totalPrice: 90000,
  currency: "XOF",
  status: "CONFIRMED",
  hasReview: false,
  canReview: true,
  listing: listing("l2", "Lodge Past", "Kpalimé, Togo"),
};
const pastReviewed = {
  ...pastToReview,
  id: "b-reviewed",
  listingId: "l3",
  hasReview: true,
  canReview: false,
  listing: listing("l3", "Case Reviewed"),
};
const cancelled = {
  ...upcoming,
  id: "b-cancel",
  listingId: "l4",
  status: "CANCELLED",
  listing: listing("l4", "Studio Cancelled"),
};

const kofi = { id: "u1", email: "kofi@afrikabnb.com", name: "Kofi", avatar: null };

function setup({ user = kofi, bookings = [upcoming, pastToReview, pastReviewed, cancelled] } = {}) {
  const auth = { user, loading: false, openAuth: vi.fn(), updateUser: vi.fn(), logoutAll: vi.fn() };
  useAuth.mockReturnValue(auth);
  api.getMyBookings.mockResolvedValue(bookings);
  render(
    <LanguageProvider>
      <Profile />
    </LanguageProvider>
  );
  return auth;
}

const section = (name) => screen.getByRole("region", { name: new RegExp(`^${name}`) });
const item = (title) =>
  screen.getAllByRole("listitem").find((li) => within(li).queryByRole("link", { name: title }));

// Attend la fin du chargement des réservations (évite les mises à jour hors act).
const bookingsLoaded = () => screen.findByText("Aucune réservation pour le moment.");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
});

describe("Profile page", () => {
  test("logged out: invites to log in", () => {
    const auth = setup({ user: null });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(auth.openAuth).toHaveBeenCalled();
    expect(api.getMyBookings).not.toHaveBeenCalled();
  });

  describe("bookings", () => {
    test("groups bookings into upcoming, past and cancelled with photo, city, dates, guests and price", async () => {
      setup();
      await screen.findByRole("link", { name: "Villa Upcoming" });
      expect(within(section("À venir")).getByRole("link", { name: "Villa Upcoming" })).toBeInTheDocument();
      expect(within(section("Passées")).getByRole("link", { name: "Lodge Past" })).toBeInTheDocument();
      expect(within(section("Passées")).getByRole("link", { name: "Case Reviewed" })).toBeInTheDocument();
      expect(within(section("Annulées")).getByRole("link", { name: "Studio Cancelled" })).toBeInTheDocument();

      const villa = item("Villa Upcoming");
      expect(within(villa).getByRole("presentation", { hidden: true })).toHaveAttribute("src", "https://img/l1.jpg");
      expect(within(villa).getByText("Lomé, Togo")).toBeInTheDocument();
      expect(within(villa).getByText(/3 nuits · 2 voyageurs/)).toBeInTheDocument();
      // XOF : pas de décimales.
      const price = within(villa).getByText(/135/);
      expect(price.textContent).toMatch(/^135\s000\s?F\s?CFA$/);
      expect(within(villa).getByText("Confirmée")).toBeInTheDocument();
      expect(within(item("Lodge Past")).getByText(/1 voyageur$/)).toBeInTheDocument();
    });

    test("only upcoming stays can be cancelled, only past unreviewed stays can be reviewed", async () => {
      setup();
      await screen.findByRole("link", { name: "Villa Upcoming" });
      expect(within(item("Villa Upcoming")).getByRole("button", { name: "Annuler la réservation" })).toBeInTheDocument();
      expect(within(item("Lodge Past")).queryByRole("button", { name: "Annuler la réservation" })).toBeNull();
      expect(within(item("Studio Cancelled")).queryByRole("button", { name: "Annuler la réservation" })).toBeNull();
      expect(within(item("Lodge Past")).getByRole("button", { name: "Laisser un avis" })).toBeInTheDocument();
      expect(within(item("Case Reviewed")).queryByRole("button", { name: "Laisser un avis" })).toBeNull();
      expect(within(item("Villa Upcoming")).queryByRole("button", { name: "Laisser un avis" })).toBeNull();
    });

    test("cancelling asks for confirmation then moves the stay to cancelled", async () => {
      setup();
      api.cancelBooking.mockResolvedValue({ ...upcoming, status: "CANCELLED" });
      await screen.findByRole("link", { name: "Villa Upcoming" });
      fireEvent.click(within(item("Villa Upcoming")).getByRole("button", { name: "Annuler la réservation" }));
      expect(api.cancelBooking).not.toHaveBeenCalled();
      expect(screen.getByText("Voulez-vous vraiment annuler ce séjour ?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
      expect(api.cancelBooking).toHaveBeenCalledWith("b-up");
      await waitFor(() =>
        expect(within(section("Annulées")).getByRole("link", { name: "Villa Upcoming" })).toBeInTheDocument()
      );
      expect(within(section("À venir")).getByText("Aucune réservation dans cette catégorie.")).toBeInTheDocument();
    });

    test("the confirmation can be dismissed", async () => {
      setup();
      await screen.findByRole("link", { name: "Villa Upcoming" });
      fireEvent.click(screen.getByRole("button", { name: "Annuler la réservation" }));
      fireEvent.click(screen.getByRole("button", { name: "Non, garder" }));
      expect(screen.queryByText("Voulez-vous vraiment annuler ce séjour ?")).toBeNull();
      expect(api.cancelBooking).not.toHaveBeenCalled();
    });

    test("a 409 on cancel shows that the stay has already started", async () => {
      setup();
      api.cancelBooking.mockRejectedValue(Object.assign(new Error("Conflit"), { status: 409 }));
      await screen.findByRole("link", { name: "Villa Upcoming" });
      fireEvent.click(screen.getByRole("button", { name: "Annuler la réservation" }));
      fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Ce séjour a déjà commencé");
      expect(within(section("À venir")).getByRole("link", { name: "Villa Upcoming" })).toBeInTheDocument();
    });

    test("leaving a review sends the rating and comment, then hides the form", async () => {
      setup();
      api.createReview.mockResolvedValue({ id: "r1", rating: 4, comment: "Super séjour" });
      await screen.findByRole("link", { name: "Lodge Past" });
      const lodge = item("Lodge Past");
      fireEvent.click(within(lodge).getByRole("button", { name: "Laisser un avis" }));
      fireEvent.click(within(lodge).getByRole("radio", { name: "4 sur 5" }));
      expect(within(lodge).getByRole("radio", { name: "4 sur 5" })).toBeChecked();
      fireEvent.change(within(lodge).getByLabelText("Commentaire"), { target: { value: "  Super séjour " } });
      fireEvent.click(within(lodge).getByRole("button", { name: "Publier l’avis" }));
      expect(api.createReview).toHaveBeenCalledWith("b-past", { rating: 4, comment: "Super séjour" });
      expect(await within(lodge).findByText("Merci pour votre avis !")).toBeInTheDocument();
      expect(within(lodge).queryByRole("button", { name: "Laisser un avis" })).toBeNull();
      expect(within(lodge).queryByLabelText("Commentaire")).toBeNull();
    });

    test("a review without rating is refused locally", async () => {
      setup();
      await screen.findByRole("link", { name: "Lodge Past" });
      const lodge = item("Lodge Past");
      fireEvent.click(within(lodge).getByRole("button", { name: "Laisser un avis" }));
      fireEvent.change(within(lodge).getByLabelText("Commentaire"), { target: { value: "Bien" } });
      fireEvent.click(within(lodge).getByRole("button", { name: "Publier l’avis" }));
      expect(within(lodge).getByRole("alert")).toHaveTextContent("Choisissez une note de 1 à 5.");
      expect(api.createReview).not.toHaveBeenCalled();
    });

    test("a 409 on review means it was already reviewed", async () => {
      setup();
      api.createReview.mockRejectedValue(Object.assign(new Error("Avis déjà donné"), { status: 409 }));
      await screen.findByRole("link", { name: "Lodge Past" });
      const lodge = item("Lodge Past");
      fireEvent.click(within(lodge).getByRole("button", { name: "Laisser un avis" }));
      fireEvent.click(within(lodge).getByRole("radio", { name: "5 sur 5" }));
      fireEvent.change(within(lodge).getByLabelText("Commentaire"), { target: { value: "Top" } });
      fireEvent.click(within(lodge).getByRole("button", { name: "Publier l’avis" }));
      expect(await within(lodge).findByText("Vous avez déjà laissé un avis pour ce séjour.")).toBeInTheDocument();
      expect(within(lodge).queryByRole("button", { name: "Laisser un avis" })).toBeNull();
    });

    test("server validation details are displayed on review errors", async () => {
      setup();
      api.createReview.mockRejectedValue(
        Object.assign(new Error("Données invalides"), {
          status: 400,
          details: [{ path: "comment", message: "Commentaire trop long" }],
        })
      );
      await screen.findByRole("link", { name: "Lodge Past" });
      const lodge = item("Lodge Past");
      fireEvent.click(within(lodge).getByRole("button", { name: "Laisser un avis" }));
      fireEvent.click(within(lodge).getByRole("radio", { name: "3 sur 5" }));
      fireEvent.change(within(lodge).getByLabelText("Commentaire"), { target: { value: "x" } });
      fireEvent.click(within(lodge).getByRole("button", { name: "Publier l’avis" }));
      expect(await within(lodge).findByRole("alert")).toHaveTextContent("Commentaire trop long");
    });

    test("empty state", async () => {
      setup({ bookings: [] });
      expect(await screen.findByText("Aucune réservation pour le moment.")).toBeInTheDocument();
    });

    test("load error offers a retry", async () => {
      useAuth.mockReturnValue({ user: kofi, loading: false, openAuth: vi.fn(), updateUser: vi.fn() });
      api.getMyBookings.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([upcoming]);
      render(
        <LanguageProvider>
          <Profile />
        </LanguageProvider>
      );
      expect(await screen.findByText("Impossible de charger vos réservations.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
      expect(await screen.findByRole("link", { name: "Villa Upcoming" })).toBeInTheDocument();
    });
  });

  describe("profile forms", () => {
    test("shows the read-only email and saves name/avatar, updating AuthContext", async () => {
      const auth = setup({ bookings: [] });
      await bookingsLoaded();
      const updated = { ...kofi, name: "Kofi Mensah", avatar: "https://img/k.jpg" };
      api.updateProfile.mockResolvedValue(updated);
      expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
      expect(screen.getByLabelText("Email")).toHaveValue("kofi@afrikabnb.com");
      fireEvent.change(screen.getByLabelText("Nom"), { target: { value: " Kofi Mensah " } });
      fireEvent.change(screen.getByLabelText("Photo de profil (URL https)"), {
        target: { value: "https://img/k.jpg" },
      });
      expect(screen.getByAltText("Aperçu de la photo de profil")).toHaveAttribute("src", "https://img/k.jpg");
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
      expect(api.updateProfile).toHaveBeenCalledWith({ name: "Kofi Mensah", avatar: "https://img/k.jpg" });
      expect(await screen.findByText("Profil mis à jour.")).toBeInTheDocument();
      expect(auth.updateUser).toHaveBeenCalledWith(updated);
    });

    test("refuses a non-https avatar without calling the API", async () => {
      setup({ bookings: [] });
      await bookingsLoaded();
      fireEvent.change(screen.getByLabelText("Photo de profil (URL https)"), {
        target: { value: "http://img/k.jpg" },
      });
      expect(screen.queryByAltText("Aperçu de la photo de profil")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
      expect(screen.getByRole("alert")).toHaveTextContent("https://");
      expect(api.updateProfile).not.toHaveBeenCalled();
    });

    test("password change: length and confirmation are checked locally", async () => {
      setup({ bookings: [] });
      await bookingsLoaded();
      fireEvent.change(screen.getByLabelText("Mot de passe actuel"), { target: { value: "demo1234" } });
      fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: "court" } });
      fireEvent.change(screen.getByLabelText("Confirmer le nouveau mot de passe"), { target: { value: "court" } });
      fireEvent.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
      expect(screen.getByRole("alert")).toHaveTextContent("entre 8 et 72 caractères");
      fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: "nouveau123" } });
      fireEvent.change(screen.getByLabelText("Confirmer le nouveau mot de passe"), { target: { value: "nouveau124" } });
      fireEvent.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
      expect(screen.getByRole("alert")).toHaveTextContent("ne correspondent pas");
      expect(api.updateProfile).not.toHaveBeenCalled();
    });

    test("password change: 401 means the current password is wrong", async () => {
      setup({ bookings: [] });
      await bookingsLoaded();
      api.updateProfile.mockRejectedValue(Object.assign(new Error("Mot de passe actuel incorrect"), { status: 401 }));
      fireEvent.change(screen.getByLabelText("Mot de passe actuel"), { target: { value: "faux" } });
      fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: "nouveau123" } });
      fireEvent.change(screen.getByLabelText("Confirmer le nouveau mot de passe"), { target: { value: "nouveau123" } });
      fireEvent.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
      expect(api.updateProfile).toHaveBeenCalledWith({ currentPassword: "faux", newPassword: "nouveau123" });
      expect(await screen.findByRole("alert")).toHaveTextContent("Mot de passe actuel incorrect.");
    });

    test("password change success clears the fields", async () => {
      setup({ bookings: [] });
      await bookingsLoaded();
      api.updateProfile.mockResolvedValue(kofi);
      fireEvent.change(screen.getByLabelText("Mot de passe actuel"), { target: { value: "demo1234" } });
      fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: "nouveau123" } });
      fireEvent.change(screen.getByLabelText("Confirmer le nouveau mot de passe"), { target: { value: "nouveau123" } });
      fireEvent.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
      expect(await screen.findByText("Mot de passe modifié.")).toBeInTheDocument();
      expect(screen.getByLabelText("Mot de passe actuel")).toHaveValue("");
    });

    test("sessions: 'log out of all devices' asks for confirmation then calls logoutAll", async () => {
      const auth = setup({ bookings: [] });
      await bookingsLoaded();
      const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
      const button = screen.getByRole("button", { name: "Se déconnecter de tous les appareils" });
      fireEvent.click(button);
      expect(confirm).toHaveBeenCalledWith("Se déconnecter de tous les appareils, y compris celui-ci ?");
      expect(auth.logoutAll).not.toHaveBeenCalled();
      auth.logoutAll.mockResolvedValue(undefined);
      fireEvent.click(button);
      await waitFor(() => expect(auth.logoutAll).toHaveBeenCalledTimes(1));
      confirm.mockRestore();
    });

    test("sessions: an API error is shown and the button is enabled again", async () => {
      const auth = setup({ bookings: [] });
      await bookingsLoaded();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      auth.logoutAll.mockRejectedValue(Object.assign(new Error("Erreur serveur"), { status: 500 }));
      fireEvent.click(screen.getByRole("button", { name: "Se déconnecter de tous les appareils" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de fermer les sessions");
      expect(screen.getByRole("button", { name: "Se déconnecter de tous les appareils" })).toBeEnabled();
      confirm.mockRestore();
    });
  });
});
