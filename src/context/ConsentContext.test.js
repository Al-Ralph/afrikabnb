import React from "react";
import { renderHook, act } from "@testing-library/react";
import { ConsentProvider, useConsent } from "./ConsentContext";

const KEY = "afrikabnb_consent";
const DAY = 24 * 60 * 60 * 1000;
const wrapper = ({ children }) => <ConsentProvider>{children}</ConsentProvider>;

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = "";
});

describe("ConsentContext", () => {
  test("throws outside the provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useConsent())).toThrow(/ConsentProvider/);
    spy.mockRestore();
  });

  test("opens the banner and has no decision when nothing is stored", () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.bannerOpen).toBe(true);
    expect(result.current.hasDecided).toBe(false);
    expect(result.current.thirdPartyAllowed).toBe(false);
  });

  test("acceptAll persists, closes banner, allows third parties", () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    act(() => result.current.acceptAll());
    expect(result.current.thirdPartyAllowed).toBe(true);
    expect(result.current.bannerOpen).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)).choice).toBe("accepted");
  });

  test("refuseAll persists and keeps third parties blocked", () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    act(() => result.current.refuseAll());
    expect(result.current.hasDecided).toBe(true);
    expect(result.current.thirdPartyAllowed).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)).choice).toBe("refused");
  });

  test("restores a recent stored decision without showing the banner", () => {
    localStorage.setItem(KEY, JSON.stringify({ choice: "accepted", decidedAt: Date.now() - DAY }));
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.bannerOpen).toBe(false);
    expect(result.current.thirdPartyAllowed).toBe(true);
  });

  test("discards a decision older than 6 months and re-opens the banner", () => {
    localStorage.setItem(KEY, JSON.stringify({ choice: "accepted", decidedAt: Date.now() - 181 * DAY }));
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.bannerOpen).toBe(true);
    expect(result.current.hasDecided).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("ignores corrupted JSON", () => {
    localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.hasDecided).toBe(false);
    expect(result.current.bannerOpen).toBe(true);
  });

  test("ignores stored data missing decidedAt", () => {
    localStorage.setItem(KEY, JSON.stringify({ choice: "accepted" }));
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.hasDecided).toBe(false);
  });

  test("openCookieManager re-opens the banner after a decision", () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    act(() => result.current.refuseAll());
    act(() => result.current.openCookieManager());
    expect(result.current.bannerOpen).toBe(true);
  });

  test("loads Google Fonts only after acceptance", () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(document.getElementById("afrikabnb-google-fonts")).toBeNull();
    act(() => result.current.acceptAll());
    expect(document.getElementById("afrikabnb-google-fonts")).not.toBeNull();
  });

  test("removes Google Fonts when consent is later refused", () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    act(() => result.current.acceptAll());
    act(() => result.current.refuseAll());
    expect(document.getElementById("afrikabnb-google-fonts")).toBeNull();
  });

  test("does not duplicate the fonts link when accepted twice", () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    act(() => result.current.acceptAll());
    act(() => result.current.acceptAll());
    expect(document.querySelectorAll("#afrikabnb-google-fonts")).toHaveLength(1);
  });
});
