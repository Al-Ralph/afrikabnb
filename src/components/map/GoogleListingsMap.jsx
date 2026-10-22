import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { useCurrency } from "../../context/CurrencyContext";
import MapListingList from "./MapListingList";
import Icon from "../Icons";
import "./GoogleListingsMap.css";

// Afrique de l'Ouest, centrée sur Lomé.
export const LOME_CENTER = { lat: 6.1319, lng: 1.2228 };
const DEFAULT_ZOOM = 6;
const IDLE_DEBOUNCE_MS = 300;

// Marqueur « pastille de prix » dessiné en SVG (pas de dépendance ni de mapId requis).
function priceIcon(g, text, active) {
  const width = Math.max(56, text.length * 8 + 20);
  const fill = active ? "#0b5d46" : "#ffffff";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="30">` +
    `<rect x="1" y="1" width="${width - 2}" height="28" rx="14" fill="${fill}" stroke="#222222" stroke-opacity="0.25"/>` +
    "</svg>";
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.Size(width, 30),
    anchor: new g.Point(width / 2, 15),
    labelOrigin: new g.Point(width / 2, 15),
  };
}

// Carte Google Maps (le script doit déjà être chargé, avec consentement) + liste synchronisée.
const GoogleListingsMap = ({ filters }) => {
  const { t } = useLanguage();
  const { formatAmount } = useCurrency();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const loadRef = useRef(null);
  const filtersRef = useRef(filters);
  const [listings, setListings] = useState([]);
  const [status, setStatus] = useState("loading");
  const [errorKey, setErrorKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Création de la carte et rechargement sur `idle` (debounce), nettoyage complet au démontage.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !containerRef.current) return undefined;
    const map = new g.Map(containerRef.current, {
      center: LOME_CENTER,
      zoom: DEFAULT_ZOOM,
      clickableIcons: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;
    const markers = markersRef.current;
    let disposed = false;
    let timer = null;
    let seq = 0;

    const load = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const requestId = ++seq;
      setStatus("loading");
      api
        .getListingsInBounds(
          { neLat: ne.lat(), neLng: ne.lng(), swLat: sw.lat(), swLng: sw.lng() },
          filtersRef.current
        )
        .then((data) => {
          if (disposed || requestId !== seq) return;
          setListings(data);
          setErrorKey(null);
          setStatus("ready");
        })
        .catch((err) => {
          if (disposed || requestId !== seq) return;
          setErrorKey(err?.status === 429 ? "map.tooManyRequests" : "map.loadError");
          setStatus("error");
        });
    };
    loadRef.current = load;

    const idleListener = map.addListener("idle", () => {
      clearTimeout(timer);
      timer = setTimeout(load, IDLE_DEBOUNCE_MS);
    });
    const clickListener = map.addListener("click", () => setSelectedId(null));

    return () => {
      disposed = true;
      clearTimeout(timer);
      loadRef.current = null;
      g.event.removeListener(idleListener);
      g.event.removeListener(clickListener);
      markers.forEach((marker) => {
        g.event.clearInstanceListeners(marker);
        marker.setMap(null);
      });
      markers.clear();
      g.event.clearInstanceListeners(map);
      mapRef.current = null;
    };
  }, []);

  // Changement des filtres de recherche : recharge la zone visible.
  // (le premier chargement est déclenché par le premier `idle` de la carte).
  const filtersKey = JSON.stringify(filters);
  const lastFiltersKey = useRef(filtersKey);
  useEffect(() => {
    filtersRef.current = filters;
    if (lastFiltersKey.current === filtersKey) return;
    lastFiltersKey.current = filtersKey;
    if (loadRef.current) loadRef.current();
    // filtersKey résume `filters` (objet recréé à chaque rendu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // Synchronise les marqueurs avec la liste (ajout, retrait, mise en avant).
  useEffect(() => {
    const g = window.google?.maps;
    const map = mapRef.current;
    if (!g || !map) return;
    const markers = markersRef.current;
    const visible = listings.filter(
      (l) => Number.isFinite(Number(l.latitude)) && Number.isFinite(Number(l.longitude)) && l.latitude != null && l.longitude != null
    );
    const ids = new Set(visible.map((l) => String(l.id)));
    markers.forEach((marker, id) => {
      if (!ids.has(id)) {
        g.event.clearInstanceListeners(marker);
        marker.setMap(null);
        markers.delete(id);
      }
    });
    visible.forEach((listing) => {
      const id = String(listing.id);
      const active = selectedId != null && String(selectedId) === id;
      const text = formatAmount(listing.price, listing.currency);
      const label = { text, fontSize: "12px", fontWeight: "700", color: active ? "#ffffff" : "#222222" };
      let marker = markers.get(id);
      if (!marker) {
        marker = new g.Marker({
          map,
          position: { lat: Number(listing.latitude), lng: Number(listing.longitude) },
          title: listing.title,
        });
        marker.addListener("click", () => setSelectedId(listing.id));
        markers.set(id, marker);
      }
      marker.setIcon(priceIcon(g, text, active));
      marker.setLabel(label);
      marker.setZIndex(active ? 1000 : 1);
    });
  }, [listings, selectedId, formatAmount]);

  const selectFromList = useCallback((id) => setSelectedId(id), []);

  const selected = listings.find((l) => selectedId != null && String(l.id) === String(selectedId));

  return (
    <div className="gmap-layout">
      <div className="gmap-map-wrap">
        <div ref={containerRef} className="gmap-map" role="region" aria-label={t("map.mapLabel")} />
        {selected && (
          <div className="gmap-preview" role="dialog" aria-label={selected.title}>
            <button
              type="button"
              className="gmap-preview-close"
              onClick={() => setSelectedId(null)}
              aria-label={t("map.closePreview")}
            >
              <Icon name="close" size={18} />
            </button>
            {selected.image && <img src={selected.image} alt="" className="gmap-preview-image" />}
            <div className="gmap-preview-body">
              <p className="gmap-preview-title">{selected.title}</p>
              <p className="gmap-preview-location">{selected.location}</p>
              <p className="gmap-preview-price">
                <strong>{formatAmount(selected.price, selected.currency)}</strong> / {t("common.night")}
              </p>
              <Link to={`/property/${selected.id}`} className="gmap-preview-link">
                {t("map.viewListing")}
              </Link>
            </div>
          </div>
        )}
      </div>
      <section className="gmap-side" aria-label={t("map.listLabel")}>
        <p className="gmap-status" role="status" aria-live="polite">
          {status === "loading" && t("map.loading")}
          {status === "ready" && `${listings.length} ${t("map.resultsInArea")}`}
        </p>
        {status === "error" && (
          <p className="gmap-error" role="alert">
            {t(errorKey)}
          </p>
        )}
        {status === "ready" && listings.length === 0 && <p className="gmap-empty">{t("map.emptyArea")}</p>}
        <MapListingList listings={listings} selectedId={selectedId} onSelect={selectFromList} />
      </section>
    </div>
  );
};

export default GoogleListingsMap;
