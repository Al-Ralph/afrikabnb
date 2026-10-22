import React from "react";
import { render, screen } from "@testing-library/react";
import Checkout from "./Checkout";
import { LanguageProvider } from "../context/LanguageContext";
import { api } from "../api/client";

// Devise d'affichage convertie (EUR) : le total est indicatif, le montant FCFA réellement facturé est rappelé.
const nextYear = new Date().getFullYear() + 1;
vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return {
    useParams: () => ({ id: "7" }),
    useSearchParams: () => [new URLSearchParams(`checkIn=${nextYear}-06-10&checkOut=${nextYear}-06-13&guests=2`)],
    useLocation: () => ({ state: null }),
    Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children),
  };
});
vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return { ...actual, api: { getListing: vi.fn(), createBooking: vi.fn() } };
});
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null, openAuth: vi.fn() }) }));
vi.mock("../context/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (amount) => `≈ ${Math.round(amount / 655.957)} €`,
    isConverted: (source) => source === "XOF",
  }),
}));

test("converted total also shows the exact amount charged in XOF", async () => {
  localStorage.setItem("afrikabnb_lang", "fr");
  api.getListing.mockResolvedValue({
    id: "7", title: "Villa Lomé", location: "Lomé, Togo", pricePerNight: 45000, currency: "XOF", maxGuests: 4, hostId: "h", instantBook: true,
  });
  render(
    <LanguageProvider>
      <Checkout />
    </LanguageProvider>
  );
  expect(await screen.findByTestId("checkout-total")).toHaveTextContent("≈ 206 €");
  const xof = new Intl.NumberFormat("fr", { style: "currency", currency: "XOF" }).format(135000);
  expect(screen.getByTestId("checkout-charged").textContent).toBe(`Montant de référence : ${xof} (seul montant facturé)`);
});
