import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useFavorites } from "../context/FavoritesContext";
import { useCurrency } from "../context/CurrencyContext";
import { interpolate } from "../utils/plural";
import Icon, { StarIcon } from "./Icons";
import "./PropertyCard.css";

const HeartIcon = ({ filled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);

const SWIPE_MIN = 40;
const MAX_PHOTOS = 5;

const PropertyCard = ({ id, location, title, price, pricePerNight, currency, rating, reviewCount, image, imageUrl, images }) => {
  const { t, language } = useLanguage();
  const { formatAmount } = useCurrency();
  const displayPrice = price != null ? price : pricePerNight;
  const cover = image || imageUrl;
  // Petit carrousel (5 photos max) si l'annonce en a plusieurs : une seule image chargée à la fois.
  const photos = Array.isArray(images) && images.length > 1 ? images.slice(0, MAX_PHOTOS) : null;
  const [photoIndex, setPhotoIndex] = useState(0);
  const touchX = useRef(null);
  const swiped = useRef(false);
  const displayImage = photos ? photos[photoIndex].url : cover;
  const photoAlt =
    photos && photoIndex > 0 ? photos[photoIndex].alt || interpolate(t("gallery.photoAlt"), { title, n: photoIndex + 1 }) : title;
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

  const showPhoto = (i) => {
    setImageFailed(false);
    setPhotoIndex(Math.max(0, Math.min(photos.length - 1, i)));
  };

  const swipeHandlers = photos
    ? {
        onTouchStart: (e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
          swiped.current = false;
        },
        onTouchEnd: (e) => {
          if (touchX.current == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) >= SWIPE_MIN) {
            swiped.current = true;
            showPhoto(photoIndex + (dx < 0 ? 1 : -1));
          }
        },
        // Un glissement ne doit pas ouvrir la fiche.
        onClick: (e) => {
          if (swiped.current) {
            e.preventDefault();
            swiped.current = false;
          }
        },
      }
    : {};

  // Les boutons sont frères du lien (pas de bouton dans un <a>) et positionnés en absolu sur l'image.
  return (
    <div className={`property-card${photos ? " property-card--photos" : ""}`}>
      <Link to={`/property/${id}`} className="property-card-link" {...swipeHandlers}>
        <div className="property-card-image-wrap">
          {displayImage && !imageFailed ? (
            <img
              key={displayImage}
              src={displayImage}
              alt={photoAlt}
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
            <strong>{currency ? formatAmount(displayPrice, currency) : `$${displayPrice}`}</strong>{" "}
            {t("common.night")}
          </p>
        </div>
      </Link>
      {photos && (
        <div className="property-card-photos">
          {photoIndex > 0 && (
            <button
              type="button"
              className="property-card-arrow property-card-arrow--prev"
              onClick={() => showPhoto(photoIndex - 1)}
              aria-label={t("gallery.prev")}
            >
              <Icon name="chevronLeft" size={16} strokeWidth={2.25} />
            </button>
          )}
          {photoIndex < photos.length - 1 && (
            <button
              type="button"
              className="property-card-arrow property-card-arrow--next"
              onClick={() => showPhoto(photoIndex + 1)}
              aria-label={t("gallery.next")}
            >
              <Icon name="chevronRight" size={16} strokeWidth={2.25} />
            </button>
          )}
          <span className="property-card-dots" aria-hidden="true">
            {photos.map((p, i) => (
              <span key={p.id ?? p.url} className={i === photoIndex ? "is-active" : undefined} />
            ))}
          </span>
        </div>
      )}
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
