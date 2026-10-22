import React, { useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useSearch } from "../context/SearchContext";
import { useConsent } from "../context/ConsentContext";
import { useGoogleMapsScript } from "../hooks/useGoogleMapsScript";
import { api, isApiUnreachable, toIsoDay } from "../api/client";
import { listings as mockListings } from "../data/listings";
import GoogleListingsMap from "../components/map/GoogleListingsMap";
import MapListingList from "../components/map/MapListingList";
import Footer from "../components/Footer";
import "./MapPage.css";

// Liste de repli quand la carte Google n'est pas disponible (aucune requête Google).
const FallbackList = ({ where, filters }) => {
  const { t } = useLanguage();
  const [listings, setListings] = useState([]);
  const [status, setStatus] = useState("loading");
  const [demo, setDemo] = useState(false);
  const filtersKey = JSON.stringify({ where, ...filters });

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api
      .getListings(JSON.parse(filtersKey))
      .then(({ data }) => {
        if (cancelled) return;
        setListings(data);
        setDemo(false);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (isApiUnreachable(err)) {
          setListings(mockListings);
          setDemo(true);
          setStatus("ready");
        } else {
          setListings([]);
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filtersKey]);

  if (status === "loading") {
    return (
      <p className="map-page-status" role="status">
        {t("map.loading")}
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="map-page-error" role="alert">
        {t("map.loadError")}
      </p>
    );
  }
  return (
    <>
      {demo && (
        <p className="map-page-demo" role="note">
          {t("home.demoBanner")}
        </p>
      )}
      {listings.length === 0 ? (
        <p className="map-page-status">{t("home.empty")}</p>
      ) : (
        <MapListingList listings={listings} defaultCurrency={demo ? "USD" : undefined} />
      )}
    </>
  );
};

const MapPage = () => {
  const { t } = useLanguage();
  const { appliedSearch } = useSearch();
  const { thirdPartyAllowed, openCookieManager } = useConsent();
  const { loaded, error } = useGoogleMapsScript();
  const keyConfigured = !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapReady = thirdPartyAllowed && keyConfigured && loaded && !error && !!window.google?.maps?.Map;
  const mapLoading = thirdPartyAllowed && keyConfigured && !loaded && !error;

  // Filtres de la recherche appliquée (dates en "YYYY-MM-DD" pour des dépendances stables).
  // Le texte « où » n'est pas appliqué à la carte : c'est la zone visible qui fait office de lieu.
  const filters = {
    categoryId: appliedSearch.categoryId || null,
    pets: appliedSearch.pets > 0,
    guests: (appliedSearch.adults || 0) + (appliedSearch.children || 0),
    checkIn: toIsoDay(appliedSearch.checkIn),
    checkOut: toIsoDay(appliedSearch.checkOut),
  };

  let reasonKey = null;
  if (!thirdPartyAllowed) reasonKey = "map.noConsent";
  else if (!keyConfigured) reasonKey = "map.noKey";
  else if (error) reasonKey = "map.scriptError";

  return (
    <>
      <main className="map-page">
        <h1 className="map-page-title">{t("map.title")}</h1>
        {mapReady && <GoogleListingsMap filters={filters} />}
        {mapLoading && (
          <p className="map-page-status" role="status">
            {t("map.loadingMap")}
          </p>
        )}
        {reasonKey && (
          <>
            <div className="map-page-fallback" role="note">
              <p>{t(reasonKey)}</p>
              {!thirdPartyAllowed && openCookieManager && (
                <button type="button" className="map-page-cookies-btn" onClick={openCookieManager}>
                  {t("map.manageCookies")}
                </button>
              )}
            </div>
            <section className="map-page-fallback-list" aria-label={t("map.listLabel")}>
              <FallbackList where={appliedSearch.where || ""} filters={filters} />
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
};

export default MapPage;
