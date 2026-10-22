import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

const SearchContext = createContext(null);

const DEFAULT_DRAFT = {
  where: "",
  checkIn: null,
  checkOut: null,
  flexibility: "exact",
  adults: 0,
  children: 0,
  babies: 0,
  pets: 0,
};

// Recherche « appliquée » : celle qui pilote réellement la liste d'annonces
// (mise à jour au submit de la barre de recherche ou au clic sur une catégorie).
export const DEFAULT_APPLIED_SEARCH = {
  where: "",
  checkIn: null,
  checkOut: null,
  adults: 0,
  children: 0,
  babies: 0,
  pets: 0,
  categoryId: null,
};

const COUNT_KEYS = ["adults", "children", "babies", "pets"];

function toIsoDay(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromIsoDay(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Recherche appliquée -> query string d'URL (paramètres vides omis).
export function searchToQuery(applied) {
  const params = new URLSearchParams();
  if (applied.where?.trim()) params.set("where", applied.where.trim());
  if (applied.categoryId) params.set("categoryId", applied.categoryId);
  const checkIn = toIsoDay(applied.checkIn);
  const checkOut = toIsoDay(applied.checkOut);
  if (checkIn) params.set("checkIn", checkIn);
  if (checkOut) params.set("checkOut", checkOut);
  COUNT_KEYS.forEach((k) => {
    if (applied[k] > 0) params.set(k, String(applied[k]));
  });
  return params.toString();
}

// Query string d'URL -> recherche appliquée (valeurs invalides ignorées).
export function searchFromQuery(query) {
  const params = new URLSearchParams(query);
  const result = { ...DEFAULT_APPLIED_SEARCH };
  result.where = params.get("where") || "";
  result.categoryId = params.get("categoryId") || null;
  result.checkIn = fromIsoDay(params.get("checkIn"));
  result.checkOut = fromIsoDay(params.get("checkOut"));
  COUNT_KEYS.forEach((k) => {
    const n = parseInt(params.get(k), 10);
    result[k] = Number.isFinite(n) && n > 0 ? n : 0;
  });
  return result;
}

function initialAppliedSearch() {
  if (typeof window === "undefined" || window.location.pathname !== "/") return DEFAULT_APPLIED_SEARCH;
  return searchFromQuery(window.location.search);
}

export const SearchProvider = ({ children }) => {
  const [appliedSearch, setAppliedSearch] = useState(initialAppliedSearch);
  const [searchParams, setSearchParamsState] = useState(() => {
    const { categoryId, ...fromUrl } = appliedSearch;
    return { ...DEFAULT_DRAFT, ...fromUrl };
  });

  const setSearchParams = useCallback((updater) => {
    setSearchParamsState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  // Copie le brouillon de la barre de recherche dans la recherche appliquée.
  const applySearch = useCallback(() => {
    setAppliedSearch((prev) => {
      const next = { ...prev };
      ["where", "checkIn", "checkOut", ...COUNT_KEYS].forEach((k) => {
        next[k] = searchParams[k] ?? DEFAULT_APPLIED_SEARCH[k];
      });
      next.where = (next.where || "").trim();
      return next;
    });
  }, [searchParams]);

  // Re-clic sur la catégorie active = désélection.
  const toggleCategory = useCallback((categoryId) => {
    setAppliedSearch((prev) => ({
      ...prev,
      categoryId: prev.categoryId === categoryId ? null : categoryId,
    }));
  }, []);

  const resetSearch = useCallback(() => {
    setSearchParamsState(DEFAULT_DRAFT);
    setAppliedSearch(DEFAULT_APPLIED_SEARCH);
  }, []);

  const value = useMemo(
    () => ({ searchParams, setSearchParams, appliedSearch, applySearch, toggleCategory, resetSearch }),
    [searchParams, setSearchParams, appliedSearch, applySearch, toggleCategory, resetSearch]
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
};

export const useSearch = () => {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within SearchProvider");
  return ctx;
};
