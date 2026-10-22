import React from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { formatPrice } from "../../utils/format";
import { StarIcon } from "../Icons";
import "./MapListingList.css";

// Liste compacte synchronisée avec la carte (survol/focus = mise en avant du marqueur).
const MapListingList = ({ listings, selectedId, onSelect, defaultCurrency }) => {
  const { t, language } = useLanguage();
  return (
    <ul className="map-list">
      {listings.map((listing) => {
        const active = selectedId != null && String(selectedId) === String(listing.id);
        const currency = listing.currency || defaultCurrency;
        return (
          <li
            key={listing.id}
            className={`map-list-item${active ? " map-list-item--active" : ""}`}
            onMouseEnter={onSelect ? () => onSelect(listing.id) : undefined}
            onFocus={onSelect ? () => onSelect(listing.id) : undefined}
          >
            <Link to={`/property/${listing.id}`} className="map-list-link" aria-current={active ? "true" : undefined}>
              {listing.image ? (
                <img src={listing.image} alt="" className="map-list-image" loading="lazy" />
              ) : (
                <span className="map-list-image map-list-image--empty" aria-hidden="true" />
              )}
              <span className="map-list-body">
                <span className="map-list-title">{listing.title}</span>
                <span className="map-list-location">{listing.location}</span>
                <span className="map-list-meta">
                  <strong>{formatPrice(listing.price, currency, language)}</strong> / {t("common.night")}
                  {listing.rating != null && (
                    <span className="map-list-rating">
                      <StarIcon size={12} />
                      {Number(listing.rating).toFixed(1)}
                      {listing.reviewCount > 0 && ` (${listing.reviewCount})`}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export default MapListingList;
