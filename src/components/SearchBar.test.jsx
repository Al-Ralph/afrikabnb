import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SearchBar from "./SearchBar";
import { LanguageProvider } from "../context/LanguageContext";
import { SearchProvider, useSearch } from "../context/SearchContext";

vi.mock("./PlacesAutocompleteInput", async () => {
  const React = await vi.importActual("react");
  return { default: function MockPlaces({ value, onChange, placeholder }) {
    return React.createElement("input", {
      "aria-label": "Destination",
      placeholder,
      value,
      onChange: (e) => onChange(e.target.value),
    });
  } };
});

vi.mock("./DatePickerPanel", async () => {
  const React = await vi.importActual("react");
  return { default: function MockDatePicker({ onCheckInChange, onCheckOutChange }) {
    return React.createElement(
      "div",
      { "data-testid": "date-picker" },
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            onCheckInChange(new Date(2024, 0, 5));
            onCheckOutChange(new Date(2024, 0, 12));
          },
        },
        "pick-dates"
      )
    );
  } };
});

// Sonde pour lire l'etat du contexte.
const Probe = () => {
  const { searchParams } = useSearch();
  return <pre data-testid="probe">{JSON.stringify(searchParams)}</pre>;
};

const renderBar = () =>
  render(
    <LanguageProvider>
      <SearchProvider>
        <SearchBar />
        <Probe />
      </SearchProvider>
    </LanguageProvider>
  );

const state = () => JSON.parse(screen.getByTestId("probe").textContent);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
});

describe("SearchBar", () => {
  test("shows translated placeholders by default", () => {
    renderBar();
    expect(screen.getByPlaceholderText("Où allez-vous ?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rechercher/i })).toBeInTheDocument();
  });

  test("typing a destination updates the search context", () => {
    renderBar();
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Lomé" } });
    expect(state().where).toBe("Lomé");
  });

  test("date panel is closed initially and opens on click", () => {
    renderBar();
    expect(screen.queryByTestId("date-picker")).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { expanded: false });
    fireEvent.click(buttons[0]);
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
  });

  test("selecting dates updates the label with formatted short dates", () => {
    renderBar();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    fireEvent.click(screen.getByText("pick-dates"));
    expect(screen.getByText("5 janv. - 12 janv.")).toBeInTheDocument();
  });

  test("guests panel opens and increments adults, label shows singular then plural", () => {
    renderBar();
    const toggles = screen.getAllByRole("button", { expanded: false });
    fireEvent.click(toggles[1]);
    fireEvent.click(screen.getByLabelText("Augmenter : Adultes"));
    expect(screen.getByText("1 adulte")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Augmenter : Adultes"));
    expect(screen.getByText("2 adultes")).toBeInTheDocument();
  });

  test("guest summary combines categories", () => {
    renderBar();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[1]);
    fireEvent.click(screen.getByLabelText("Augmenter : Adultes"));
    fireEvent.click(screen.getByLabelText("Augmenter : Enfants"));
    fireEvent.click(screen.getByLabelText("Augmenter : Animaux de compagnie"));
    expect(screen.getByText("1 adulte, 1 enfant, 1 animal")).toBeInTheDocument();
  });

  test("opening guests closes the dates panel", () => {
    renderBar();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    expect(screen.queryByTestId("date-picker")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nombre de voyageurs" })).toBeInTheDocument();
  });

  test("clicking outside closes open panels", () => {
    renderBar();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[1]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("submitting the form closes the panels without reloading", () => {
    renderBar();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[1]);
    fireEvent.click(screen.getByRole("button", { name: /Rechercher/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("English: labels, date order and singular/plural summary", () => {
    localStorage.setItem("afrikabnb_lang", "en");
    renderBar();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    fireEvent.click(screen.getByText("pick-dates"));
    expect(screen.getByText("Jan 5 - Jan 12")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    fireEvent.click(screen.getByLabelText("Increase: Adults"));
    expect(screen.getByText("1 adult")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Increase: Adults"));
    fireEvent.click(screen.getByLabelText("Increase: Children"));
    expect(screen.getByText("2 adults, 1 child")).toBeInTheDocument();
  });
});
