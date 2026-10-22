import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import MapPage from "./MapPage";
import { LanguageProvider } from "../context/LanguageContext";
import { SearchProvider } from "../context/SearchContext";
import { useConsent } from "../context/ConsentContext";
import { useGoogleMapsScript } from "../hooks/useGoogleMapsScript";
import { api } from "../api/client";
import { listings as mockListings } from "../data/listings";

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
  return { ...actual, api: { getListings: jest.fn(), getListingsInBounds: jest.fn() } };
});
jest.mock("../context/ConsentContext", () => ({ useConsent: jest.fn() }));
jest.mock("../hooks/useGoogleMapsScript", () => ({ useGoogleMapsScript: jest.fn() }));
jest.mock("../components/Footer", () => () => <footer>Footer</footer>);

const apiListing = {
  id: "11",
  title: "Case de Lomé",
  location: "Lomé, Togo",
  price: 30000,
  currency: "XOF",
  latitude: 6.13,
  longitude: 1.22,
  rating: 4.5,
  reviewCount: 2,
  image: "https://img.test/a.jpg",
};

const renderPage = () =>
  render(
    <LanguageProvider>
      <SearchProvider>
        <MapPage />
      </SearchProvider>
    </LanguageProvider>
  );

const ORIGINAL_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
let openCookieManager;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  openCookieManager = jest.fn();
  useConsent.mockReturnValue({ thirdPartyAllowed: false, openCookieManager });
  useGoogleMapsScript.mockReturnValue({ loaded: false, error: null, hasKey: false });
  api.getListings.mockReset().mockResolvedValue({ data: [apiListing], total: 1 });
  api.getListingsInBounds.mockReset();
  delete process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  delete window.google;
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  else process.env.REACT_APP_GOOGLE_MAPS_API_KEY = ORIGINAL_KEY;
});

describe("MapPage without Google Maps", () => {
  test("without consent: explains why, offers the cookie manager and lists the API listings", async () => {
    renderPage();
    expect(screen.getByRole("note")).toHaveTextContent("n’est chargée qu’avec votre accord");
    fireEvent.click(screen.getByRole("button", { name: "Gérer mes cookies" }));
    expect(openCookieManager).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Case de Lomé")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Case de Lomé/ })).toHaveAttribute("href", "/property/11");
    expect(api.getListingsInBounds).not.toHaveBeenCalled();
  });

  test("with consent but no API key: explains the missing configuration", async () => {
    useConsent.mockReturnValue({ thirdPartyAllowed: true, openCookieManager });
    renderPage();
    expect(screen.getByRole("note")).toHaveTextContent("La carte n’est pas configurée");
    expect(screen.queryByRole("button", { name: "Gérer mes cookies" })).not.toBeInTheDocument();
    expect(await screen.findByText("Case de Lomé")).toBeInTheDocument();
  });

  test("falls back to the demo listings when the API is unreachable", async () => {
    api.getListings.mockRejectedValue(Object.assign(new Error("API injoignable"), { network: true }));
    renderPage();
    expect(await screen.findByText(mockListings[0].title)).toBeInTheDocument();
    expect(screen.getByText(/Données de démonstration/)).toBeInTheDocument();
  });
});

describe("MapPage with Google Maps", () => {
  let mapInstance;
  let markers;
  let removeListener;

  const installGoogleMock = () => {
    markers = [];
    removeListener = jest.fn();
    class FakeMap {
      constructor(el, options) {
        this.options = options;
        this.listeners = {};
        mapInstance = this;
      }
      addListener(event, cb) {
        this.listeners[event] = cb;
        return { event };
      }
      getBounds() {
        const latLng = (lat, lng) => ({ lat: () => lat, lng: () => lng });
        return { getNorthEast: () => latLng(10, 5), getSouthWest: () => latLng(4, -2) };
      }
    }
    class FakeMarker {
      constructor(options) {
        this.options = options;
        this.setMap = jest.fn();
        this.setIcon = jest.fn();
        this.setLabel = jest.fn();
        this.setZIndex = jest.fn();
        this.listeners = {};
        markers.push(this);
      }
      addListener(event, cb) {
        this.listeners[event] = cb;
      }
    }
    window.google = {
      maps: {
        Map: FakeMap,
        Marker: FakeMarker,
        Size: function Size(w, h) { return { w, h }; },
        Point: function Point(x, y) { return { x, y }; },
        event: { removeListener, clearInstanceListeners: jest.fn() },
        places: {},
      },
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY = "test-key";
    useConsent.mockReturnValue({ thirdPartyAllowed: true, openCookieManager });
    useGoogleMapsScript.mockReturnValue({ loaded: true, error: null, hasKey: true });
    installGoogleMock();
    api.getListingsInBounds.mockResolvedValue([apiListing]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("loads listings in bounds on idle (debounced), shows price markers and cleans up on unmount", async () => {
    const { unmount } = renderPage();
    expect(mapInstance.options.center).toEqual({ lat: 6.1319, lng: 1.2228 });
    act(() => {
      mapInstance.listeners.idle();
      mapInstance.listeners.idle();
    });
    expect(api.getListingsInBounds).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(api.getListingsInBounds).toHaveBeenCalledTimes(1);
    expect(api.getListingsInBounds).toHaveBeenCalledWith(
      { neLat: 10, neLng: 5, swLat: 4, swLng: -2 },
      { categoryId: null, pets: false, guests: 0, checkIn: "", checkOut: "" }
    );
    await waitFor(() => expect(markers).toHaveLength(1));
    expect(screen.getByText("Case de Lomé")).toBeInTheDocument();

    act(() => markers[0].listeners.click());
    expect(screen.getByRole("dialog", { name: "Case de Lomé" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir l’annonce" })).toHaveAttribute("href", "/property/11");

    unmount();
    expect(markers[0].setMap).toHaveBeenCalledWith(null);
    expect(removeListener).toHaveBeenCalledTimes(2);
  });
});
