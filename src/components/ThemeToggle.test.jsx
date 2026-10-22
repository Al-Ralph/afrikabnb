import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ThemeToggle, { readThemeMode, applyThemeMode, THEME_STORAGE_KEY } from "./ThemeToggle";
import { LanguageProvider } from "../context/LanguageContext";

const renderToggle = () =>
  render(
    <LanguageProvider>
      <ThemeToggle />
    </LanguageProvider>
  );

const menu = () => screen.queryByRole("group", { name: "Thème d’affichage" });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle", () => {
  test("defaults to the system theme without forcing data-theme", () => {
    renderToggle();
    const trigger = screen.getByRole("button", { name: "Thème : Système" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(menu()).toBeNull();
  });

  test("offers light, dark and system; choosing dark applies and remembers it", () => {
    renderToggle();
    const trigger = screen.getByRole("button", { name: "Thème : Système" });
    fireEvent.click(trigger);
    const m = within(menu());
    expect(m.getByRole("button", { name: "Clair" })).toHaveAttribute("aria-pressed", "false");
    expect(m.getByRole("button", { name: "Système" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(m.getByRole("button", { name: "Sombre" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(menu()).toBeNull();
    expect(screen.getByRole("button", { name: "Thème : Sombre" })).toHaveFocus();
  });

  test("restores the stored choice on mount", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    renderToggle();
    expect(screen.getByRole("button", { name: "Thème : Clair" })).toBeInTheDocument();
  });

  test("going back to system removes data-theme and the stored value", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    renderToggle();
    fireEvent.click(screen.getByRole("button", { name: "Thème : Sombre" }));
    fireEvent.click(within(menu()).getByRole("button", { name: "Système" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  test("Escape and a click outside close the menu", () => {
    renderToggle();
    const trigger = screen.getByRole("button", { name: "Thème : Système" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu()).toBeNull();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(menu()).toBeNull();
  });

  test("ignores an invalid stored value and survives an unavailable storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readThemeMode()).toBe("system");

    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readThemeMode()).toBe("system");
    expect(() => applyThemeMode("dark")).not.toThrow();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});
