import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GuestsPanel from "./GuestsPanel";

const setup = (props = {}) => {
  const onChange = jest.fn();
  render(<GuestsPanel adults={1} children={0} babies={0} pets={0} onChange={onChange} {...props} />);
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
    fireEvent.click(screen.getByLabelText("Plus de Adultes"));
    expect(onChange).toHaveBeenCalledWith({ adults: 2, children: 2, babies: 0, pets: 0 });
  });

  test("decrement calls onChange with the decremented value", () => {
    const onChange = setup({ adults: 3 });
    fireEvent.click(screen.getByLabelText("Moins de Adultes"));
    expect(onChange).toHaveBeenCalledWith({ adults: 2, children: 0, babies: 0, pets: 0 });
  });

  test("decrement button is disabled at zero", () => {
    setup({ children: 0 });
    expect(screen.getByLabelText("Moins de Enfants")).toBeDisabled();
  });

  test("decrement button is enabled above zero", () => {
    setup({ babies: 1 });
    expect(screen.getByLabelText("Moins de Bébés")).toBeEnabled();
  });

  test("never emits a negative value", () => {
    const onChange = setup({ pets: 0 });
    fireEvent.click(screen.getByLabelText("Moins de Animaux de compagnie"));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("exposes an accessible dialog label", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Nombre de voyageurs" })).toBeInTheDocument();
  });
});
