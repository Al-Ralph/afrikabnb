import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AmenitiesSection from "./AmenitiesSection";
import AmenityIcon, { AMENITY_ICON_PATHS } from "../AmenityIcon";
import { LanguageProvider } from "../../context/LanguageContext";
import { AMENITIES } from "../../api/client";

const renderSection = (amenities) =>
  render(
    <LanguageProvider>
      <AmenitiesSection amenities={amenities} />
    </LanguageProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
});

describe("AmenitiesSection", () => {
  test("shows 6 amenities in API order, then « see all » opens a modal with every amenity", () => {
    renderSection(["POOL", "WIFI", "GENERATOR", "KITCHEN", "SECURITY", "TV", "MOSQUITO_NETS", "AIR_CONDITIONING"]);
    const section = screen.getByRole("region", { name: "Ce que propose ce logement" });
    const preview = within(section).getAllByRole("listitem");
    expect(preview).toHaveLength(6);
    expect(preview[0]).toHaveTextContent("Wi-Fi");
    expect(preview[1]).toHaveTextContent("Climatisation");
    expect(within(section).queryByText("Moustiquaires")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Voir les 8 équipements" }));
    const dialog = screen.getByRole("dialog", { name: "Ce que propose ce logement" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(8);
    expect(within(dialog).getByText("Groupe électrogène")).toBeInTheDocument();
    expect(within(dialog).getByText("Moustiquaires")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("no « see all » button with 6 amenities or fewer; empty message without amenities", () => {
    const { unmount } = renderSection(["WIFI", "POOL"]);
    expect(screen.queryByRole("button", { name: /Voir les/ })).toBeNull();
    unmount();
    renderSection([]);
    expect(screen.getByText("L'hôte n'a pas encore renseigné les équipements.")).toBeInTheDocument();
  });
});

describe("AmenityIcon", () => {
  test("has a pictogram for every API amenity code", () => {
    AMENITIES.forEach((code) => expect(AMENITY_ICON_PATHS[code]).toBeDefined());
  });

  test("renders a decorative SVG, with a fallback for unknown codes", () => {
    const { container } = render(<AmenityIcon code="NOT_A_CODE" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  });
});
