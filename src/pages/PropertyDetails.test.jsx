import React from "react";
import { render, screen } from "@testing-library/react";
import PropertyDetails from "./PropertyDetails";
import { LanguageProvider } from "../context/LanguageContext";
import { SearchProvider } from "../context/SearchContext";
import { api } from "../api/client";
import { listings as mockListings } from "../data/listings";

let mockId = "42";
vi.mock(
  "react-router-dom",
  async () => {
    const React = await vi.importActual("react");
    return {
      Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children),
      useParams: () => ({ id: mockId }),
    };
  }
);

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    api: { getListing: vi.fn(), getAvailability: vi.fn(), getReviews: vi.fn(), createBooking: vi.fn() },
  };
});
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

const renderPage = () =>
  render(
    <LanguageProvider>
      <SearchProvider>
        <PropertyDetails />
      </SearchProvider>
    </LanguageProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getAvailability.mockResolvedValue({ booked: [] });
  api.getReviews.mockResolvedValue({ data: [], total: 0, rating: null, reviewCount: 0 });
});

describe("PropertyDetails", () => {
  test("shows capacity, rating, host (no email) and the booking widget for an API listing", async () => {
    mockId = "42";
    api.getListing.mockResolvedValue({
      id: "42",
      title: "Villa Lagune",
      location: "Lomé, Togo",
      price: 45000,
      currency: "XOF",
      maxGuests: 4,
      bedrooms: 2,
      rating: 4.5,
      reviewCount: 3,
      image: "https://img.test/v.jpg",
      host: { id: "h1", name: "Awa", avatar: null },
    });
    renderPage();
    expect(await screen.findByText("Villa Lagune")).toBeInTheDocument();
    expect(screen.getByText("4 voyageurs")).toBeInTheDocument();
    expect(screen.getByText("2 chambres")).toBeInTheDocument();
    // L'étoile est une icône SVG décorative ; le texte porte la note et le nombre d'avis.
    expect(screen.getByText("4.5 · 3 avis")).toBeInTheDocument();
    expect(screen.getByText("Awa")).toBeInTheDocument();
    expect(await screen.findByText("Aucun avis pour le moment.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Réserver" }).length).toBeGreaterThan(0);
  });

  test("demo listing (API unreachable) disables booking", async () => {
    mockId = mockListings[0].id;
    api.getListing.mockRejectedValue(Object.assign(new Error("API injoignable"), { network: true }));
    renderPage();
    expect(await screen.findByText(mockListings[0].title)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Réservation indisponible en mode démo");
    expect(api.getReviews).not.toHaveBeenCalled();
    expect(api.getAvailability).not.toHaveBeenCalled();
  });

  test("API listing: photo gallery, amenities and « on request » badge", async () => {
    mockId = "42";
    api.getListing.mockResolvedValue({
      id: "42",
      title: "Villa Lagune",
      location: "Lomé, Togo",
      price: 45000,
      currency: "XOF",
      maxGuests: 4,
      image: "https://img.test/1.jpg",
      images: [
        { id: "i2", url: "https://img.test/2.jpg", alt: "Terrasse", position: 1 },
        { id: "i1", url: "https://img.test/1.jpg", alt: "Façade", position: 0 },
      ],
      amenities: ["WIFI", "GENERATOR"],
      instantBook: false,
    });
    renderPage();
    expect(await screen.findByText("Villa Lagune")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agrandir la photo 1 sur 2" })).toContainElement(
      screen.getByRole("img", { name: "Façade" })
    );
    expect(screen.getByText("Sur demande")).toBeInTheDocument();
    expect(screen.getByText("Groupe électrogène")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Demande de réservation" }).length).toBeGreaterThan(0);
  });

  test("instant booking badge; a listing without images falls back on its cover photo", async () => {
    mockId = "43";
    api.getListing.mockResolvedValue({
      id: "43",
      title: "Case Plage",
      location: "Aného, Togo",
      price: 30000,
      currency: "XOF",
      imageUrl: "https://img.test/cover.jpg",
    });
    renderPage();
    expect(await screen.findByText("Case Plage")).toBeInTheDocument();
    expect(screen.getByText("Réservation instantanée")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Case Plage" })).toHaveAttribute("src", "https://img.test/cover.jpg");
  });
});
