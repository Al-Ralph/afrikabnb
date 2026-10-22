import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Dependances lourdes / routage mockes : on verifie uniquement le cablage de App.
jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");
    return {
      BrowserRouter: ({ children }) => React.createElement("div", { "data-testid": "router" }, children),
      Routes: ({ children }) => React.createElement("div", { "data-testid": "routes" }, children),
      Route: ({ path, element }) => (path === "/" ? element : null),
      Link: ({ to, children }) => React.createElement("a", { href: to }, children),
    };
  },
  { virtual: true }
);
jest.mock("./components/Header", () => () => <header>Header</header>);
jest.mock("./components/CookieBanner", () => () => <div>CookieBanner</div>);
jest.mock("./pages/Home", () => () => <div>HomePage</div>);
jest.mock("./pages/PropertyDetails", () => () => <div>PropertyDetailsPage</div>);
jest.mock("./pages/Host", () => () => <div>HostPage</div>);
jest.mock("./pages/Favorites", () => () => <div>FavoritesPage</div>);
jest.mock("./pages/Profile", () => () => <div>ProfilePage</div>);
jest.mock("./pages/MapPage", () => () => <div>MapPage</div>);
jest.mock("./pages/Placeholder", () => () => <div>PlaceholderPage</div>);
jest.mock("./pages/legal/MentionsLegales", () => () => <div>Mentions</div>);
jest.mock("./pages/legal/Confidentialite", () => () => <div>Confidentialite</div>);
jest.mock("./pages/legal/Cookies", () => () => <div>Cookies</div>);
jest.mock("./pages/legal/CGU", () => () => <div>CGU</div>);

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
