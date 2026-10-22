import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GuestsPanel from "./GuestsPanel";
import { LanguageProvider } from "../context/LanguageContext";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
});

const setup = (props = {}) => {
  const onChange = vi.fn();
  render(
    <LanguageProvider>
      <GuestsPanel adults={1} children={0} babies={0} pets={0} onChange={onChange} {...props} />
    </LanguageProvider>
  );
  return onChange;
};

describe("GuestsPanel", () => {
  test("renders the four traveller categories with their current values", () => {
    setup({ adults: 2, children: 3, babies: 1, pets: 4 });
    expect(screen.getByText("Adultes")).toBeInTheDocument();
    expect(screen.getByText("Enfants")).toBeInTheDocument();
    expect(screen.getByText("Bébés")).toBeInTheDocument();
    expect(screen.getByText("Animaux de compagnie")).toBeInTheDocument();
    ["2", "3", "1", "4"].forEach((v) => expect(screen.getByText(v)).toBeInTheDocument());
  });

  test("increment calls onChange with all values and the incremented one", () => {
    const onChange = setup({ adults: 1, children: 2 });
    fireEvent.click(screen.getByLabelText("Augmenter : Adultes"));
    expect(onChange).toHaveBeenCalledWith({ adults: 2, children: 2, babies: 0, pets: 0 });
  });

  test("decrement calls onChange with the decremented value", () => {
    const onChange = setup({ adults: 3 });
    fireEvent.click(screen.getByLabelText("Diminuer : Adultes"));
    expect(onChange).toHaveBeenCalledWith({ adults: 2, children: 0, babies: 0, pets: 0 });
  });

  test("decrement button is disabled at zero", () => {
    setup({ children: 0 });
    expect(screen.getByLabelText("Diminuer : Enfants")).toBeDisabled();
  });

  test("decrement button is enabled above zero", () => {
    setup({ babies: 1 });
    expect(screen.getByLabelText("Diminuer : Bébés")).toBeEnabled();
  });

  test("never emits a negative value", () => {
    const onChange = setup({ pets: 0 });
    fireEvent.click(screen.getByLabelText("Diminuer : Animaux de compagnie"));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("exposes an accessible dialog label", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Nombre de voyageurs" })).toBeInTheDocument();
  });

  test("renders English labels when the language is English", () => {
    localStorage.setItem("afrikabnb_lang", "en");
    setup();
    expect(screen.getByText("Adults")).toBeInTheDocument();
    expect(screen.getByText("Ages 13 or above")).toBeInTheDocument();
    expect(screen.getByLabelText("Increase: Adults")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Number of guests" })).toBeInTheDocument();
  });

  test("renders German labels when the language is German", () => {
    localStorage.setItem("afrikabnb_lang", "de");
    setup();
    expect(screen.getByText("Erwachsene")).toBeInTheDocument();
    expect(screen.getByLabelText("Erhöhen: Haustiere")).toBeInTheDocument();
  });
});
