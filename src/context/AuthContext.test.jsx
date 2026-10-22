import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth, OPEN_AUTH_EVENT, SESSION_EXPIRED_EVENT } from "./AuthContext";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: { refreshSession: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() },
}));

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
const alice = { id: 1, email: "a@b.c", name: "Alice" };
const noSession = () => Object.assign(new Error("Session absente"), { status: 401 });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  api.refreshSession.mockRejectedValue(noSession());
});

async function renderLoggedOut() {
  const view = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe("AuthContext", () => {
  test("throws outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
    spy.mockRestore();
  });

  test("the open-auth window event opens the login modal", async () => {
    const { result } = await renderLoggedOut();
    expect(result.current.authOpen).toBe(false);
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT));
    });
    expect(result.current.authOpen).toBe(true);
  });

  test("on mount: restores the session from the refresh cookie (loading until it answers)", async () => {
    let resolve;
    api.refreshSession.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
    await act(async () => resolve({ token: "acc", user: alice }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(alice);
    expect(api.refreshSession).toHaveBeenCalledTimes(1);
  });

  test("on mount without a session (401): anonymous, nothing stored", async () => {
    const { result } = await renderLoggedOut();
    expect(result.current.user).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  test("on mount with the API unreachable: anonymous, not stuck loading", async () => {
    api.refreshSession.mockRejectedValue(Object.assign(new Error("API injoignable"), { network: true }));
    const { result } = await renderLoggedOut();
    expect(result.current.user).toBeNull();
  });

  test("login sets the user and returns it, without touching web storage", async () => {
    api.login.mockResolvedValue({ user: alice, token: "t1" });
    const { result } = await renderLoggedOut();
    let returned;
    await act(async () => {
      returned = await result.current.login("a@b.c", "pw");
    });
    expect(api.login).toHaveBeenCalledWith("a@b.c", "pw");
    expect(returned).toEqual(alice);
    expect(result.current.user).toEqual(alice);
    expect(localStorage.getItem("afrikabnb_token")).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  test("failed login rejects and leaves state untouched", async () => {
    api.login.mockRejectedValue(new Error("Bad credentials"));
    const { result } = await renderLoggedOut();
    await act(async () => {
      await expect(result.current.login("a", "b")).rejects.toThrow("Bad credentials");
    });
    expect(result.current.user).toBeNull();
  });

  test("register sets the user", async () => {
    api.register.mockResolvedValue({ user: alice, token: "t2" });
    const { result } = await renderLoggedOut();
    await act(async () => {
      await result.current.register("a@b.c", "pw", "Alice");
    });
    expect(api.register).toHaveBeenCalledWith("a@b.c", "pw", "Alice");
    expect(result.current.user).toEqual(alice);
  });

  test("logout clears the user and calls the API (even if it fails)", async () => {
    api.refreshSession.mockResolvedValue({ token: "acc", user: alice });
    api.logout.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(alice));
    act(() => result.current.logout());
    expect(result.current.user).toBeNull();
    await waitFor(() => expect(api.logout).toHaveBeenCalledTimes(1));
  });

  test("logoutAll calls the API then clears the user; an API error keeps the session", async () => {
    api.refreshSession.mockResolvedValue({ token: "acc", user: alice });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(alice));
    api.logoutAll.mockRejectedValueOnce(Object.assign(new Error("Erreur serveur"), { status: 500 }));
    await act(async () => {
      await expect(result.current.logoutAll()).rejects.toThrow("Erreur serveur");
    });
    expect(result.current.user).toEqual(alice);
    api.logoutAll.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.logoutAll();
    });
    expect(api.logoutAll).toHaveBeenCalledTimes(2);
    expect(result.current.user).toBeNull();
  });

  test("the session-expired event from the API client logs the user out", async () => {
    api.refreshSession.mockResolvedValue({ token: "acc", user: alice });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(alice));
    act(() => {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    });
    expect(result.current.user).toBeNull();
  });
});

describe("AuthContext — auth modal mode", () => {
  test("openAuth(mode) and the open-auth event (detail.mode) choose the screen; default is login", () => {
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
