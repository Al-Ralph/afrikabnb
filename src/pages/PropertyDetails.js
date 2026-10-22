import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { api, isApiUnreachable } from "../api/client";
import { listings as mockListings } from "../data/listings";
import BookingWidget from "../components/booking/BookingWidget";
import ReviewsSection from "../components/booking/ReviewsSection";
import { formatPrice } from "../utils/format";
import "./PropertyDetails.css";

const PropertyDetails = () => {
  const { id } = useParams();
  const { t, language } = useLanguage();
  const [property, setProperty] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProperty(null);
    setIsDemo(false);
    api
      .getListing(id)
      .then((data) => {
        if (!cancelled) setProperty(data);
      })
      .catch((err) => {
        if (cancelled) return;
        const mock = mockListings.find((p) => p.id === String(id));
        if (mock && isApiUnreachable(err)) {
          // Démonstration hors-ligne : uniquement pour une annonce mock connue.
          setProperty(mock);
          setIsDemo(true);
        } else if (err?.status !== 404) {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <main className="property-details property-details--loading">
        <div className="property-details-spinner" aria-hidden="true" />
        <p role="status">{t("property.loading")}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="property-details property-details--not-found">
        <p role="alert">{t("property.error")}</p>
        <Link to="/">{t("property.backHome")}</Link>
      </main>
    );
  }

  if (!property) {
    return (
      <main className="property-details property-details--not-found">
        <p>{t("property.notFound")}</p>
        <Link to="/">{t("property.backHome")}</Link>
      </main>
    );
  }

  const { location, title, price, rating, image, description, maxGuests, bedrooms, host, reviewCount } = property;
  // Les annonces de démonstration sont exprimées en dollars ; l'API fournit toujours une devise.
  const currency = property.currency || (isDemo ? "USD" : "XOF");
  const hostName = host?.name;

  return (
    <main className="property-details">
      <div className="property-details-inner">
        <Link to="/" className="property-details-back">{t("property.backToListings")}</Link>
        <div className="property-details-image-wrap">
          <img src={image} alt={title} className="property-details-image" />
        </div>
        <div className="property-details-layout">
          <div className="property-details-main">
            <div className="property-details-body">
              <h1 className="property-details-location">{location}</h1>
              <p className="property-details-title">{title}</p>
              <div className="property-details-meta">
                {isDemo ? (
                  <span className="property-details-rating" title={t("common.demoRating")}>
                    ★ {rating ?? "—"}
                    <span className="property-details-rating-hint"> {t("common.demoRatingShort")}</span>
                  </span>
                ) : (
                  <span className="property-details-rating">
                    {rating != null && reviewCount > 0
                      ? `★ ${Number(rating).toFixed(1)} · ${reviewCount} ${reviewCount > 1 ? t("reviews.reviewsPlural") : t("reviews.reviewSingular")}`
                      : `★ ${t("reviews.new")}`}
                  </span>
                )}
                <span className="property-details-price">
                  <strong>{formatPrice(price, currency, language)}</strong> / {t("common.night")}
                </span>
              </div>
              {(maxGuests != null || bedrooms != null) && (
                <ul className="property-details-facts">
                  {maxGuests != null && (
                    <li>
                      {maxGuests} {maxGuests > 1 ? t("booking.guestsPlural") : t("booking.guestSingular")}
                    </li>
                  )}
                  {bedrooms != null && (
                    <li>
                      {bedrooms} {bedrooms > 1 ? t("booking.bedroomsPlural") : t("booking.bedroomSingular")}
                    </li>
                  )}
                </ul>
              )}
              {hostName && (
                <div className="property-details-host">
                  {host.avatar ? (
                    <img src={host.avatar} alt="" className="property-details-host-avatar" />
                  ) : (
                    <span className="property-details-host-avatar property-details-host-avatar--initial" aria-hidden="true">
                      {hostName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <p>
                    {t("booking.hostedBy")} <strong>{hostName}</strong>
                  </p>
                </div>
              )}
              <p className="property-details-desc">{description || t("property.defaultDescription")}</p>
            </div>
            {!isDemo && <ReviewsSection listingId={property.id} />}
          </div>
          <div className="property-details-aside">
            <BookingWidget listing={{ ...property, currency }} demo={isDemo} />
          </div>
        </div>
      </div>
    </main>
  );
};

export default PropertyDetails;
