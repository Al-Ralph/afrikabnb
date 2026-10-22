import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "../api/client";
import { listings as mockListings } from "../data/listings";
import { useAuth } from "./AuthContext";

// Annonces de démonstration (API injoignable) : favoris gardés en mémoire, jamais envoyés à l'API.
const MOCK_IDS = new Set(mockListings.map((l) => String(l.id)));

const FavoritesContext = createContext(null);

export const FavoritesProvider = ({ children }) => {
  const { user, openAuth } = useAuth();
  const userId = user?.id ?? null;
  const [favorites, setFavorites] = useState([]);
  const [localIds, setLocalIds] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;
  const localIdsRef = useRef(localIds);
  localIdsRef.current = localIds;
  const pending = useRef(new Set());
  const loadSeq = useRef(0);

  const reload = useCallback(() => {
    const seq = ++loadSeq.current;
    if (!userId) {
      setFavorites([]);
      setLoading(false);
      setError(null);
      return Promise.resolve();
    }
    setLoading(true);
    setError(null);
    return api
      .getFavorites()
      .then((data) => {
        if (seq === loadSeq.current) setFavorites(data);
      })
      .catch((err) => {
        if (seq === loadSeq.current) setError(err);
      })
      .finally(() => {
        if (seq === loadSeq.current) setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const ids = useMemo(() => new Set(favorites.map((f) => String(f.id))), [favorites]);

  const isFavorite = useCallback(
    (id) => {
      const key = String(id);
      return MOCK_IDS.has(key) ? localIds.has(key) : ids.has(key);
    },
    [ids, localIds]
  );

  // Mise à jour optimiste, annulée si l'API refuse. Renvoie le nouvel état (booléen).
  const toggleFavorite = useCallback(
    async (listing) => {
      const id = String(listing.id);
      if (MOCK_IDS.has(id)) {
        const next = !localIdsRef.current.has(id);
        setLocalIds((prev) => {
          const copy = new Set(prev);
          if (next) copy.add(id);
          else copy.delete(id);
          return copy;
        });
        return next;
      }
      if (!userId) {
        openAuth();
        return false;
      }
      const original = favoritesRef.current.find((f) => String(f.id) === id);
      if (pending.current.has(id)) return Boolean(original);
      pending.current.add(id);
      const wasFavorite = Boolean(original);
      const without = (list) => list.filter((f) => String(f.id) !== id);
      setFavorites((prev) =>
        wasFavorite ? without(prev) : [{ ...listing, isFavorite: true }, ...without(prev)]
      );
      try {
        if (wasFavorite) await api.removeFavorite(id);
        else await api.addFavorite(id);
        setError(null);
        return !wasFavorite;
      } catch (err) {
        setFavorites((prev) => (wasFavorite ? [original, ...without(prev)] : without(prev)));
        setError(err);
        if (err?.status === 401) openAuth();
        return wasFavorite;
      } finally {
        pending.current.delete(id);
      }
    },
    [userId, openAuth]
  );

  const value = useMemo(
    () => ({ favorites, loading, error, isFavorite, toggleFavorite, reload }),
    [favorites, loading, error, isFavorite, toggleFavorite, reload]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
};

// Renvoie null hors du provider : les composants peuvent alors garder un état local.
export const useFavorites = () => useContext(FavoritesContext);
