import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useFavorites } from "../context/FavoritesContext";
import { formatPrice } from "../utils/format";
import { StarIcon } from "./Icons";
import "./PropertyCard.css";

const HeartIcon = ({ filled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);

const PropertyCard = ({ id, location, title, price, pricePerNight, currency, rating, reviewCount, image, imageUrl }) => {
  const { t, language } = useLanguage();
  const displayPrice = price != null ? price : pricePerNight;
  const displayImage = image || imageUrl;
  const favorites = useFavorites();
  // Hors FavoritesProvider (tests isolés) : simple état local.
  const [localFavorite, setLocalFavorite] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const favorite = favorites ? favorites.isFavorite(id) : localFavorite;

  const handleFavorite = () => {
    if (favorites) {
      favorites.toggleFavorite({ id, location, title, price: displayPrice, currency, rating, image: displayImage });
    } else {
      setLocalFavorite((prev) => !prev);
    }
  };

  // Le bouton est frère du lien (pas de bouton dans un <a>) et positionné en absolu sur l'image.
  return (
    <div className="property-card">
      <Link to={`/property/${id}`} className="property-card-link">
        <div className="property-card-image-wrap">
          {displayImage && !imageFailed ? (
            <img
              src={displayImage}
              alt={title}
              className="property-card-image"
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="property-card-image property-card-image--empty" role="img" aria-label={title} />
          )}
        </div>
        <div className="property-card-body">
          <div className="property-card-head">
            <p className="property-card-location">{location}</p>
            {rating != null && (
              <span className="property-card-rating">
                <StarIcon size={13} />
                {/* Note = moyenne des avis des voyageurs (calculée par l'API). */}
                <span>{Number(rating).toLocaleString(language, { maximumFractionDigits: 2 })}</span>
                {reviewCount > 0 && <span className="property-card-reviews">({reviewCount})</span>}
              </span>
            )}
          </div>
          <p className="property-card-title">{title}</p>
          <p className="property-card-price">
            {/* Annonces API : devise de l'annonce ; données de démo (sans devise) : dollars. */}
            <strong>{currency ? formatPrice(displayPrice, currency, language) : `$${displayPrice}`}</strong>{" "}
            {t("common.night")}
          </p>
        </div>
      </Link>
      <button
        type="button"
        className={`property-card-favorite${favorite ? " property-card-favorite--active" : ""}`}
        onClick={handleFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? t("common.removeFavorite") : t("common.addFavorite")}
      >
        <HeartIcon filled={favorite} />
      </button>
    </div>
  );
};

export default PropertyCard;
