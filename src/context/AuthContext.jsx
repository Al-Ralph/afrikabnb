import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../api/client";

export const OPEN_AUTH_EVENT = "afrikabnb:open-auth";
// Émis par le client API quand la session ne peut plus être renouvelée (même valeur que
// SESSION_EXPIRED_EVENT dans api/client.js).
export const SESSION_EXPIRED_EVENT = "afrikabnb:session-expired";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Fenêtre de connexion partagée : le Header l'affiche, n'importe quel composant peut l'ouvrir.
  const [authOpen, setAuthOpen] = useState(false);
  // Écran affiché à l'ouverture : "login", "register" ou "forgot" (mot de passe oublié).
  const [authMode, setAuthMode] = useState("login");
  const openAuth = useCallback((mode) => {
    setAuthMode(typeof mode === "string" ? mode : "login");
    setAuthOpen(true);
  }, []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  // Les composants hors du contexte (BookingWidget, Host) demandent l'ouverture par événement
  // (detail.mode facultatif).
  useEffect(() => {
    const onOpen = (e) => openAuth(e?.detail?.mode);
    window.addEventListener(OPEN_AUTH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AUTH_EVENT, onOpen);
  }, [openAuth]);

  // Restauration de la session au chargement : le cookie httpOnly de renouvellement donne un
  // nouveau jeton d'accès (gardé en mémoire par le client API). « loading » reste vrai pendant
  // l'appel : pas d'affichage furtif du bouton de connexion.
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => api.refreshSession())
      .then((data) => {
        if (active && data?.user) setUser(data.user);
      })
      .catch(() => {
        // Pas de session (401) ou API injoignable : visiteur anonyme.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Renouvellement impossible pendant la navigation (session révoquée ou expirée) : déconnexion.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Le client API garde le jeton d'accès en mémoire ; le cookie de renouvellement est posé par l'API.
  const login = async (email, password) => {
    const { user: u } = await api.login(email, password);
    setUser(u);
    return u;
  };

  const register = async (email, password, name) => {
    const { user: u } = await api.register(email, password, name);
    setUser(u);
    return u;
  };

  // Déconnexion locale immédiate ; la révocation côté API se fait en arrière-plan (échec ignoré).
  const logout = useCallback(() => {
    setUser(null);
    Promise.resolve()
      .then(() => api.logout())
      .catch(() => {});
  }, []);

  // Déconnexion de tous les appareils : rejette si l'API refuse (l'appelant affiche l'erreur).
  const logoutAll = useCallback(async () => {
    await api.logoutAll();
    setUser(null);
  }, []);

  // Profil modifié (nom, avatar…) : fusionne la réponse de l'API dans l'utilisateur courant.
  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, logoutAll, updateUser, authOpen, authMode, openAuth, closeAuth }}
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
