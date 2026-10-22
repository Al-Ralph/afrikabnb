import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useFavorites } from "../context/FavoritesContext";
import { formatPrice } from "../utils/format";
import "./PropertyCard.css";

const HeartIcon = ({ filled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);

const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

const PropertyCard = ({ id, location, title, price, pricePerNight, currency, rating, image, imageUrl }) => {
  const { t, language } = useLanguage();
  const displayPrice = price != null ? price : pricePerNight;
  const displayImage = image || imageUrl;
  const favorites = useFavorites();
  // Hors FavoritesProvider (tests isolés) : simple état local.
  const [localFavorite, setLocalFavorite] = useState(false);
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
          <img src={displayImage} alt={title} className="property-card-image" loading="lazy" />
        </div>
        <div className="property-card-body">
          <p className="property-card-location">{location}</p>
          <p className="property-card-title">{title}</p>
          <div className="property-card-meta">
            {rating != null && (
              <span className="property-card-rating">
                <StarIcon />
                {/* Note = moyenne des avis des voyageurs (calculée par l'API). */}
                <span>{Number(rating).toLocaleString(language, { maximumFractionDigits: 2 })}</span>
              </span>
            )}
            <span className="property-card-price">
              {/* Annonces API : devise de l'annonce ; données de démo (sans devise) : dollars. */}
              <strong>{currency ? formatPrice(displayPrice, currency, language) : `$${displayPrice}`}</strong>{" "}
              {t("common.night")}
            </span>
          </div>
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
