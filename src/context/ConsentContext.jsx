import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "afrikabnb_consent";
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 6 mois
const FONTS_LINK_ID = "afrikabnb-google-fonts";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";

const ConsentContext = createContext(null);

function readStoredConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.choice || !data?.decidedAt) return null;
    if (Date.now() - data.decidedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function loadGoogleFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById(FONTS_LINK_ID)) return;

  if (!document.querySelector('link[href*="fonts.googleapis.com"][rel="preconnect"]')) {
    const pre1 = document.createElement("link");
    pre1.rel = "preconnect";
    pre1.href = "https://fonts.googleapis.com";
    document.head.appendChild(pre1);
    const pre2 = document.createElement("link");
    pre2.rel = "preconnect";
    pre2.href = "https://fonts.gstatic.com";
    pre2.crossOrigin = "anonymous";
    document.head.appendChild(pre2);
  }

  const link = document.createElement("link");
  link.id = FONTS_LINK_ID;
  link.rel = "stylesheet";
  link.href = FONTS_HREF;
  document.head.appendChild(link);
}

function unloadGoogleFonts() {
  if (typeof document === "undefined") return;
  const link = document.getElementById(FONTS_LINK_ID);
  if (link) link.remove();
}

export const ConsentProvider = ({ children }) => {
  const [consent, setConsent] = useState(() => readStoredConsent());
  const [bannerOpen, setBannerOpen] = useState(() => !readStoredConsent());

  const thirdPartyAllowed = consent?.choice === "accepted";

  useEffect(() => {
    if (thirdPartyAllowed) {
      loadGoogleFonts();
    } else {
      unloadGoogleFonts();
    }
  }, [thirdPartyAllowed]);

  const persist = useCallback((choice) => {
    const data = { choice, decidedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setConsent(data);
    setBannerOpen(false);
  }, []);

  const acceptAll = useCallback(() => persist("accepted"), [persist]);
  const refuseAll = useCallback(() => persist("refused"), [persist]);

  const openCookieManager = useCallback(() => {
    setBannerOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      consent,
      hasDecided: !!consent,
      thirdPartyAllowed,
      bannerOpen,
      acceptAll,
      refuseAll,
      openCookieManager,
      setBannerOpen,
    }),
    [consent, thirdPartyAllowed, bannerOpen, acceptAll, refuseAll, openCookieManager]
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
};

export const useConsent = () => {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within ConsentProvider");
  return ctx;
};
