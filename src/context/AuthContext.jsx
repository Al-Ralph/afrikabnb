import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../api/client";

const TOKEN_KEY = "afrikabnb_token";
export const OPEN_AUTH_EVENT = "afrikabnb:open-auth";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Fenêtre de connexion partagée : le Header l'affiche, n'importe quel composant peut l'ouvrir.
  const [authOpen, setAuthOpen] = useState(false);
  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  // Les composants hors du contexte (BookingWidget, Host) demandent l'ouverture par événement.
  useEffect(() => {
    window.addEventListener(OPEN_AUTH_EVENT, openAuth);
    return () => window.removeEventListener(OPEN_AUTH_EVENT, openAuth);
  }, [openAuth]);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .getMe()
      .then(({ user: u }) => setUser(u))
      .catch((err) => {
        // Token invalide/expiré uniquement : une panne réseau ou serveur ne déconnecte pas.
        if (err?.status === 401 || err?.status === 403) localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { user: u, token } = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(u);
    return u;
  };

  const register = async (email, password, name) => {
    const { user: u, token } = await api.register(email, password, name);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  // Profil modifié (nom, avatar…) : fusionne la réponse de l'API dans l'utilisateur courant.
  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, updateUser, authOpen, openAuth, closeAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
