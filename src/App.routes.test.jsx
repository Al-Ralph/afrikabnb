import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Chaque <Route> rend son chemin et son élément : on vérifie le câblage des pages.
vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return {
    BrowserRouter: ({ children }) => React.createElement("div", null, children),
    Routes: ({ children }) => React.createElement("div", null, children),
    Route: ({ path, element }) => React.createElement("section", { "data-path": path }, element),
    Link: ({ to, children }) => React.createElement("a", { href: to }, children),
  };
});
vi.mock("./components/Header", () => ({ default: () => <header>Header</header> }));
vi.mock("./components/CookieBanner", () => ({ default: () => null }));
vi.mock("./pages/Home", () => ({ default: () => null }));
vi.mock("./pages/PropertyDetails", () => ({ default: () => null }));
vi.mock("./pages/Host", () => ({ default: () => null }));
vi.mock("./pages/Favorites", () => ({ default: () => null }));
vi.mock("./pages/Profile", () => ({ default: () => null }));
vi.mock("./pages/MapPage", () => ({ default: () => null }));
vi.mock("./pages/Placeholder", () => ({ default: () => null }));
vi.mock("./pages/legal/MentionsLegales", () => ({ default: () => null }));
vi.mock("./pages/legal/Confidentialite", () => ({ default: () => null }));
vi.mock("./pages/legal/Cookies", () => ({ default: () => null }));
vi.mock("./pages/legal/CGU", () => ({ default: () => null }));
vi.mock("./pages/ResetPassword", () => ({ default: () => <div>ResetPasswordPage</div> }));
vi.mock("./pages/Admin", () => ({ default: () => <div>AdminPage</div> }));
vi.mock("./pages/Checkout", () => ({ default: () => <div>CheckoutPage</div> }));
vi.mock("./pages/GuestBooking", () => ({ default: () => <div>GuestBookingPage</div> }));
vi.mock("./pages/PaymentReturn", () => ({ default: () => <div>PaymentReturnPage</div> }));

const routeElement = (path) => document.querySelector(`[data-path="${path}"]`);

describe("App routes (wave 3)", () => {
  test("/reinitialiser-mot-de-passe renders the reset password page", async () => {
    render(<App />);
    await screen.findByText("ResetPasswordPage");
    expect(routeElement("/reinitialiser-mot-de-passe")).toHaveTextContent("ResetPasswordPage");
  });

  test("/admin renders the administration page", async () => {
    render(<App />);
    await screen.findByText("AdminPage");
    expect(routeElement("/admin")).toHaveTextContent("AdminPage");
    expect(screen.getByText("Header")).toBeInTheDocument();
  });

  test("booking step and guest booking tracking pages are wired (lazy)", async () => {
    render(<App />);
    await screen.findByText("CheckoutPage");
    expect(routeElement("/reserver/:id")).toHaveTextContent("CheckoutPage");
    expect(routeElement("/reservation/:token")).toHaveTextContent("GuestBookingPage");
    expect(routeElement("/reservation")).toHaveTextContent("GuestBookingPage");
  });

  test("payment return page is wired (lazy)", async () => {
    render(<App />);
    await screen.findByText("PaymentReturnPage");
    expect(routeElement("/paiement/retour")).toHaveTextContent("PaymentReturnPage");
  });
});
