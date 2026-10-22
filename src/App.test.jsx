import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Dependances lourdes / routage mockes : on verifie uniquement le cablage de App.
vi.mock(
  "react-router-dom",
  async () => {
    const React = await vi.importActual("react");
    return {
      BrowserRouter: ({ children }) => React.createElement("div", { "data-testid": "router" }, children),
      Routes: ({ children }) => React.createElement("div", { "data-testid": "routes" }, children),
      Route: ({ path, element }) => (path === "/" ? element : null),
      Link: ({ to, children }) => React.createElement("a", { href: to }, children),
    };
  }
);
vi.mock("./components/Header", () => ({ default: () => <header>Header</header> }));
vi.mock("./components/CookieBanner", () => ({ default: () => <div>CookieBanner</div> }));
vi.mock("./pages/Home", () => ({ default: () => <div>HomePage</div> }));
vi.mock("./pages/PropertyDetails", () => ({ default: () => <div>PropertyDetailsPage</div> }));
vi.mock("./pages/Host", () => ({ default: () => <div>HostPage</div> }));
vi.mock("./pages/Favorites", () => ({ default: () => <div>FavoritesPage</div> }));
vi.mock("./pages/Profile", () => ({ default: () => <div>ProfilePage</div> }));
vi.mock("./pages/MapPage", () => ({ default: () => <div>MapPage</div> }));
vi.mock("./pages/Placeholder", () => ({ default: () => <div>PlaceholderPage</div> }));
vi.mock("./pages/legal/MentionsLegales", () => ({ default: () => <div>Mentions</div> }));
vi.mock("./pages/legal/Confidentialite", () => ({ default: () => <div>Confidentialite</div> }));
vi.mock("./pages/legal/Cookies", () => ({ default: () => <div>Cookies</div> }));
vi.mock("./pages/legal/CGU", () => ({ default: () => <div>CGU</div> }));

describe("App", () => {
  test("renders header, home page route and cookie banner", () => {
    render(<App />);
    expect(screen.getByText("Header")).toBeInTheDocument();
    expect(screen.getByText("HomePage")).toBeInTheDocument();
    expect(screen.getByText("CookieBanner")).toBeInTheDocument();
  });

  test("does not render the default CRA 'learn react' content", () => {
    render(<App />);
    expect(screen.queryByText(/learn react/i)).not.toBeInTheDocument();
  });
});
