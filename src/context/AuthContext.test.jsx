import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth, OPEN_AUTH_EVENT } from "./AuthContext";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: { getMe: vi.fn(), login: vi.fn(), register: vi.fn() },
}));

const KEY = "afrikabnb_token";
const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
const alice = { id: 1, email: "a@b.c", name: "Alice" };

beforeEach(() => {
  localStorage.clear();
});

describe("AuthContext", () => {
  test("throws outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
    spy.mockRestore();
  });

  test("the open-auth window event opens the login modal", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.authOpen).toBe(false);
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT));
    });
    expect(result.current.authOpen).toBe(true);
  });

  test("without a token: not loading, no user, no API call", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(api.getMe).not.toHaveBeenCalled();
  });

  test("with a valid token: loads the user via getMe", async () => {
    localStorage.setItem(KEY, "tok");
    api.getMe.mockResolvedValue({ user: alice });
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(alice);
  });

  test("with an invalid token: removes it and stays logged out", async () => {
    localStorage.setItem(KEY, "bad");
    // Le client API attache le statut HTTP aux erreurs (err.status).
    api.getMe.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("with a 403 on getMe: removes the token", async () => {
    localStorage.setItem(KEY, "bad");
    api.getMe.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("on a network/server error: keeps the token (no forced logout)", async () => {
    localStorage.setItem(KEY, "tok");
    api.getMe.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("tok");
  });

  test("login stores the token, sets the user and returns it", async () => {
    api.login.mockResolvedValue({ user: alice, token: "t1" });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let returned;
    await act(async () => {
      returned = await result.current.login("a@b.c", "pw");
    });
    expect(api.login).toHaveBeenCalledWith("a@b.c", "pw");
    expect(returned).toEqual(alice);
    expect(result.current.user).toEqual(alice);
    expect(localStorage.getItem(KEY)).toBe("t1");
  });

  test("failed login rejects and leaves state untouched", async () => {
    api.login.mockRejectedValue(new Error("Bad credentials"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.login("a", "b")).rejects.toThrow("Bad credentials");
    });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("register stores the token and sets the user", async () => {
    api.register.mockResolvedValue({ user: alice, token: "t2" });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.register("a@b.c", "pw", "Alice");
    });
    expect(api.register).toHaveBeenCalledWith("a@b.c", "pw", "Alice");
    expect(result.current.user).toEqual(alice);
    expect(localStorage.getItem(KEY)).toBe("t2");
  });

  test("logout clears the token and the user", async () => {
    api.login.mockResolvedValue({ user: alice, token: "t1" });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.login("a", "b");
    });
    act(() => result.current.logout());
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("AuthContext — auth modal mode", () => {
  test("openAuth(mode) and the open-auth event (detail.mode) choose the screen; default is login", () => {
    localStorage.removeItem("afrikabnb_token");
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => result.current.openAuth("forgot"));
    expect(result.current.authOpen).toBe(true);
    expect(result.current.authMode).toBe("forgot");
    act(() => result.current.closeAuth());
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT, { detail: { mode: "register" } }));
    });
    expect(result.current.authMode).toBe("register");
    // Appelé comme gestionnaire de clic (reçoit un événement) : écran de connexion.
    act(() => result.current.openAuth({ type: "click" }));
    expect(result.current.authMode).toBe("login");
  });
});
