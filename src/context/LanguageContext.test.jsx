import React from "react";
import { renderHook, act } from "@testing-library/react";
import { LanguageProvider, useLanguage } from "./LanguageContext";

const wrapper = ({ children }) => <LanguageProvider>{children}</LanguageProvider>;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "";
});

describe("LanguageContext", () => {
  test("throws when useLanguage is used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useLanguage())).toThrow(/LanguageProvider/);
    spy.mockRestore();
  });

  test("uses the stored language when valid", () => {
    localStorage.setItem("afrikabnb_lang", "de");
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe("de");
  });

  test("ignores an unsupported stored language and falls back to a supported one", () => {
    localStorage.setItem("afrikabnb_lang", "xx");
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.languageCodes).toContain(result.current.language);
  });

  test("falls back to the browser language when supported", () => {
    const spy = vi.spyOn(window.navigator, "language", "get").mockReturnValue("es-ES");
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe("es");
    spy.mockRestore();
  });

  test("falls back to fr when the browser language is unsupported", () => {
    const spy = vi.spyOn(window.navigator, "language", "get").mockReturnValue("ja-JP");
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe("fr");
    spy.mockRestore();
  });

  test("setLanguage updates state, localStorage and html lang", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    act(() => result.current.setLanguage("en"));
    expect(result.current.language).toBe("en");
    expect(localStorage.getItem("afrikabnb_lang")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  test("setLanguage ignores unsupported codes", () => {
    localStorage.setItem("afrikabnb_lang", "fr");
    const { result } = renderHook(() => useLanguage(), { wrapper });
    act(() => result.current.setLanguage("zz"));
    expect(result.current.language).toBe("fr");
  });

  test("t resolves nested keys in the current language", () => {
    localStorage.setItem("afrikabnb_lang", "fr");
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.t("cookies.acceptAll")).toBe("Tout accepter");
    act(() => result.current.setLanguage("en"));
    expect(result.current.t("common.night")).toBe("night");
  });

  test("t returns the key itself when missing", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.t("does.not.exist")).toBe("does.not.exist");
  });

  test("t returns a string even when the key points to a sub-object", () => {
    // Attendu : toujours une chaine (sinon React plante au rendu d'un objet).
    localStorage.setItem("afrikabnb_lang", "fr");
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(typeof result.current.t("cookies")).toBe("string");
  });
});
