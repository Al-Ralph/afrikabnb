import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import { FavoritesProvider, useFavorites } from "./FavoritesContext";
import { api } from "../api/client";

jest.mock("../api/client", () => ({
  api: {
    getMe: jest.fn(),
    getFavorites: jest.fn(),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
  },
}));

const wrapper = ({ children }) => (
  <AuthProvider>
    <FavoritesProvider>{children}</FavoritesProvider>
  </AuthProvider>
);
const useBoth = () => ({ fav: useFavorites(), auth: useAuth() });

const villa = { id: "ck-villa", title: "Villa", location: "Lomé", price: 45000, image: "https://img/v.jpg" };
const lodge = { id: "ck-lodge", title: "Lodge", location: "Kpalimé", price: 30000, image: "https://img/l.jpg" };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderLoggedIn(initialFavorites = []) {
  localStorage.setItem("afrikabnb_token", "tok");
  api.getMe.mockResolvedValue({ user: { id: "u1", email: "kofi@afrikabnb.com", name: "Kofi" } });
  api.getFavorites.mockResolvedValue(initialFavorites);
  const view = renderHook(useBoth, { wrapper });
  await waitFor(() => expect(view.result.current.auth.user).not.toBeNull());
  await waitFor(() => expect(view.result.current.fav.loading).toBe(false));
  return view;
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe("FavoritesContext", () => {
  test("returns null outside the provider (cards fall back to local state)", () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current).toBeNull();
  });

  test("loads the favourites of the logged-in user", async () => {
    const { result } = await renderLoggedIn([villa]);
    expect(api.getFavorites).toHaveBeenCalledTimes(1);
    expect(result.current.fav.favorites).toEqual([villa]);
    expect(result.current.fav.isFavorite("ck-villa")).toBe(true);
    expect(result.current.fav.isFavorite("ck-lodge")).toBe(false);
  });

  test("logged out: toggling opens the login modal without calling the API", async () => {
    const { result } = renderHook(useBoth, { wrapper });
    await waitFor(() => expect(result.current.auth.loading).toBe(false));
    expect(api.getFavorites).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.fav.toggleFavorite(villa);
    });
    expect(result.current.auth.authOpen).toBe(true);
    expect(api.addFavorite).not.toHaveBeenCalled();
    expect(result.current.fav.isFavorite("ck-villa")).toBe(false);
  });

  test("adding is optimistic: the heart is filled before the API answers", async () => {
    const { result } = await renderLoggedIn([]);
    const pending = deferred();
    api.addFavorite.mockReturnValue(pending.promise);
    let toggle;
    act(() => {
      toggle = result.current.fav.toggleFavorite(lodge);
    });
    expect(result.current.fav.isFavorite("ck-lodge")).toBe(true);
    expect(api.addFavorite).toHaveBeenCalledWith("ck-lodge");
    await act(async () => {
      pending.resolve({ listingId: "ck-lodge", isFavorite: true });
      await expect(toggle).resolves.toBe(true);
    });
    expect(result.current.fav.isFavorite("ck-lodge")).toBe(true);
    expect(result.current.fav.favorites[0]).toMatchObject({ id: "ck-lodge", isFavorite: true });
    expect(result.current.fav.error).toBeNull();
  });

  test("adding is rolled back when the API fails", async () => {
    const { result } = await renderLoggedIn([]);
    const pending = deferred();
    api.addFavorite.mockReturnValue(pending.promise);
    let toggle;
    act(() => {
      toggle = result.current.fav.toggleFavorite(lodge);
    });
    expect(result.current.fav.isFavorite("ck-lodge")).toBe(true);
    await act(async () => {
      pending.reject(Object.assign(new Error("Annonce introuvable"), { status: 404 }));
      await expect(toggle).resolves.toBe(false);
    });
    expect(result.current.fav.isFavorite("ck-lodge")).toBe(false);
    expect(result.current.fav.favorites).toEqual([]);
    expect(result.current.fav.error).toMatchObject({ status: 404 });
  });

  test("removing is optimistic and restored on failure", async () => {
    const { result } = await renderLoggedIn([villa, lodge]);
    const pending = deferred();
    api.removeFavorite.mockReturnValue(pending.promise);
    let toggle;
    act(() => {
      toggle = result.current.fav.toggleFavorite(villa);
    });
    expect(result.current.fav.isFavorite("ck-villa")).toBe(false);
    expect(api.removeFavorite).toHaveBeenCalledWith("ck-villa");
    await act(async () => {
      pending.reject(new Error("boom"));
      await toggle;
    });
    expect(result.current.fav.isFavorite("ck-villa")).toBe(true);
    expect(result.current.fav.favorites.map((f) => f.id).sort()).toEqual(["ck-lodge", "ck-villa"]);
  });

  test("a successful removal keeps the listing out", async () => {
    const { result } = await renderLoggedIn([villa]);
    api.removeFavorite.mockResolvedValue({ listingId: "ck-villa", isFavorite: false });
    await act(async () => {
      await result.current.fav.toggleFavorite(villa);
    });
    expect(result.current.fav.isFavorite("ck-villa")).toBe(false);
    expect(result.current.fav.favorites).toEqual([]);
  });

  test("demo listings (ids 1..6) toggle locally, never through the API", async () => {
    const { result } = renderHook(useBoth, { wrapper });
    await waitFor(() => expect(result.current.auth.loading).toBe(false));
    await act(async () => {
      await result.current.fav.toggleFavorite({ id: "3", title: "Bungalow" });
    });
    expect(result.current.fav.isFavorite("3")).toBe(true);
    expect(result.current.auth.authOpen).toBe(false);
    expect(api.addFavorite).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.fav.toggleFavorite({ id: "3", title: "Bungalow" });
    });
    expect(result.current.fav.isFavorite("3")).toBe(false);
    expect(api.removeFavorite).not.toHaveBeenCalled();
  });

  test("a load error is exposed and reload retries", async () => {
    localStorage.setItem("afrikabnb_token", "tok");
    api.getMe.mockResolvedValue({ user: { id: "u1", email: "k@a.com" } });
    api.getFavorites.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([villa]);
    const { result } = renderHook(useBoth, { wrapper });
    await waitFor(() => expect(result.current.fav.error).not.toBeNull());
    await act(async () => {
      await result.current.fav.reload();
    });
    expect(result.current.fav.error).toBeNull();
    expect(result.current.fav.favorites).toEqual([villa]);
  });

  test("logout clears the favourites", async () => {
    const { result } = await renderLoggedIn([villa]);
    act(() => result.current.auth.logout());
    await waitFor(() => expect(result.current.fav.favorites).toEqual([]));
    expect(result.current.fav.isFavorite("ck-villa")).toBe(false);
  });
});
