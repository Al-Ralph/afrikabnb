import React from "react";
import { renderHook, act } from "@testing-library/react";
import { SearchProvider, useSearch, searchToQuery, searchFromQuery, DEFAULT_APPLIED_SEARCH } from "./SearchContext";

const wrapper = ({ children }) => <SearchProvider>{children}</SearchProvider>;

describe("SearchContext", () => {
  test("throws outside the provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSearch())).toThrow(/SearchProvider/);
    spy.mockRestore();
  });

  test("exposes default search params", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    expect(result.current.searchParams).toEqual({
      where: "",
      checkIn: null,
      checkOut: null,
      flexibility: "exact",
      adults: 0,
      children: 0,
      babies: 0,
      pets: 0,
    });
  });

  test("setSearchParams accepts an updater function", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    act(() => result.current.setSearchParams((p) => ({ ...p, where: "Lomé" })));
    expect(result.current.searchParams.where).toBe("Lomé");
    expect(result.current.searchParams.flexibility).toBe("exact");
  });

  test("setSearchParams accepts a full replacement object", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    act(() => result.current.setSearchParams({ where: "Accra" }));
    expect(result.current.searchParams).toEqual({ where: "Accra" });
  });

  test("consecutive functional updates compose", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    act(() => {
      result.current.setSearchParams((p) => ({ ...p, adults: p.adults + 1 }));
      result.current.setSearchParams((p) => ({ ...p, adults: p.adults + 1 }));
    });
    expect(result.current.searchParams.adults).toBe(2);
  });

  test("exposes an empty applied search by default", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    expect(result.current.appliedSearch).toEqual(DEFAULT_APPLIED_SEARCH);
  });

  test("editing the draft does not change the applied search until applySearch", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    act(() => result.current.setSearchParams((p) => ({ ...p, where: " Lomé ", adults: 2, pets: 1 })));
    expect(result.current.appliedSearch.where).toBe("");
    act(() => result.current.applySearch());
    expect(result.current.appliedSearch).toMatchObject({ where: "Lomé", adults: 2, pets: 1, categoryId: null });
  });

  test("toggleCategory selects, switches and deselects on re-click", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    act(() => result.current.toggleCategory("safari"));
    expect(result.current.appliedSearch.categoryId).toBe("safari");
    act(() => result.current.toggleCategory("iles"));
    expect(result.current.appliedSearch.categoryId).toBe("iles");
    act(() => result.current.toggleCategory("iles"));
    expect(result.current.appliedSearch.categoryId).toBeNull();
  });

  test("applySearch keeps the selected category", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    act(() => result.current.toggleCategory("safari"));
    act(() => result.current.setSearchParams((p) => ({ ...p, where: "Accra" })));
    act(() => result.current.applySearch());
    expect(result.current.appliedSearch).toMatchObject({ where: "Accra", categoryId: "safari" });
  });

  test("resetSearch clears both draft and applied search", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    act(() => result.current.setSearchParams((p) => ({ ...p, where: "Accra" })));
    act(() => result.current.applySearch());
    act(() => result.current.toggleCategory("safari"));
    act(() => result.current.resetSearch());
    expect(result.current.appliedSearch).toEqual(DEFAULT_APPLIED_SEARCH);
    expect(result.current.searchParams.where).toBe("");
  });
});

describe("search <-> URL query", () => {
  test("omits empty values", () => {
    expect(searchToQuery(DEFAULT_APPLIED_SEARCH)).toBe("");
  });

  test("round-trips where, category, dates and counts", () => {
    const applied = {
      ...DEFAULT_APPLIED_SEARCH,
      where: "Lomé",
      categoryId: "bord-mer",
      checkIn: new Date(2026, 0, 5),
      checkOut: new Date(2026, 0, 9),
      adults: 2,
      pets: 1,
    };
    const parsed = searchFromQuery(searchToQuery(applied));
    expect(parsed).toEqual(applied);
  });

  test("ignores invalid values from the URL", () => {
    const parsed = searchFromQuery("checkIn=2026-13-99x&adults=-3&children=abc");
    expect(parsed.checkIn).toBeNull();
    expect(parsed.adults).toBe(0);
    expect(parsed.children).toBe(0);
  });
});
