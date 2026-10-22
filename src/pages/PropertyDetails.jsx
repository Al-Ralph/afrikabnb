import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { api, isApiUnreachable } from "../api/client";
import { listings as mockListings } from "../data/listings";
import BookingWidget from "../components/booking/BookingWidget";
import ReviewsSection from "../components/booking/ReviewsSection";
import Icon, { StarIcon } from "../components/Icons";
import CategoryIcon from "../components/CategoryIcons";
import EmptyState from "../components/EmptyState";
import { PropertySkeleton } from "../components/Skeleton";
import PhotoGallery from "../components/listing/PhotoGallery";
import AmenitiesSection from "../components/listing/AmenitiesSection";
import { sortedImages } from "../utils/images";
import "./PropertyDetails.css";

const PropertyDetails = () => {
  const { id } = useParams();
  const { t } = useLanguage();
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
      <main className="property-details">
        <div className="property-details-inner">
          <PropertySkeleton label={t("property.loading")} />
        </div>
      </main>
    );
  }

  if (error || !property) {
    return (
      <main className="property-details property-details--not-found">
        <EmptyState
          icon={error ? "compass" : "search"}
          tone={error ? "danger" : "neutral"}
          role={error ? "alert" : undefined}
          action={
            <Link to="/" className="btn btn--secondary">
              {t("property.backHome")}
            </Link>
          }
        >
          <p>{error ? t("property.error") : t("property.notFound")}</p>
        </EmptyState>
      </main>
    );
  }

  const { location, title, rating, description, maxGuests, bedrooms, host, reviewCount, categoryId, acceptsPets } =
    property;
  // Les annonces de démonstration sont exprimées en dollars ; l'API fournit toujours une devise.
  const currency = property.currency || (isDemo ? "USD" : "XOF");
  const hostName = host?.name;
  // Réservation instantanée par défaut ; false = sur demande (l'hôte accepte sous 48 h).
  const instant = property.instantBook !== false;
  const categoryLabel = categoryId ? t(`categories.${categoryId}`) : null;
  const reviewsWord = reviewCount > 1 ? t("reviews.reviewsPlural") : t("reviews.reviewSingular");

  const ratingContent = isDemo ? (
    <span className="property-details-rating" title={t("common.demoRating")}>
      <StarIcon size={15} />
      <span>{rating ?? "—"}</span>
      <span className="property-details-rating-hint">{t("common.demoRatingShort")}</span>
    </span>
  ) : (
    <span className="property-details-rating">
      <StarIcon size={15} />
      <span>
        {rating != null && reviewCount > 0
          ? `${Number(rating).toFixed(1)} · ${reviewCount} ${reviewsWord}`
          : t("reviews.new")}
      </span>
    </span>
  );

  return (
    <main className="property-details">
      <div className="property-details-inner">
        <Link to="/" className="property-details-back">
          <Icon name="arrowLeft" size={18} />
          <span>{t("ui.property.back")}</span>
        </Link>

        <header className="property-details-header">
          <h1 className="property-details-title">{title}</h1>
          <div className="property-details-meta">
            {ratingContent}
            <span className="property-details-location">
              <Icon name="pin" size={16} />
              <span>{location}</span>
            </span>
            {!isDemo && (
              <span
                className={`property-details-mode${instant ? " property-details-mode--instant" : ""}`}
                title={instant ? t("listing.instantBookHint") : t("listing.onRequestHint")}
              >
                <Icon name={instant ? "bolt" : "clock"} size={16} />
                <span>{instant ? t("listing.instantBook") : t("listing.onRequest")}</span>
              </span>
            )}
          </div>
        </header>

        <PhotoGallery images={sortedImages(property)} title={title} />

        <div className="property-details-layout">
          <div className="property-details-main">
            <section className="property-details-section" aria-labelledby="property-facts-title">
              <h2 id="property-facts-title" className="sr-only">
                {t("ui.property.keyFacts")}
              </h2>
              <ul className="property-details-facts">
                {maxGuests != null && (
                  <li>
                    <Icon name="users" size={24} />
                    <span>
                      {maxGuests} {maxGuests > 1 ? t("booking.guestsPlural") : t("booking.guestSingular")}
                    </span>
                  </li>
                )}
                {bedrooms != null && (
                  <li>
                    <Icon name="bed" size={24} />
                    <span>
                      {bedrooms} {bedrooms > 1 ? t("booking.bedroomsPlural") : t("booking.bedroomSingular")}
                    </span>
                  </li>
                )}
                {categoryLabel && (
                  <li>
                    <CategoryIcon id={categoryId} />
                    <span>{categoryLabel}</span>
                  </li>
                )}
                {acceptsPets != null && (
                  <li>
                    <Icon name="paw" size={24} />
                    <span>{acceptsPets ? t("ui.property.petsOk") : t("ui.property.petsNo")}</span>
                  </li>
                )}
              </ul>
            </section>

            {!isDemo && <AmenitiesSection amenities={property.amenities} />}

            {hostName && (
              <section className="property-details-host" aria-label={t("ui.property.hostRole")}>
                {host.avatar ? (
                  <img src={host.avatar} alt="" className="property-details-host-avatar" />
                ) : (
                  <span className="property-details-host-avatar property-details-host-avatar--initial" aria-hidden="true">
                    {hostName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="property-details-host-name">
                    {t("booking.hostedBy")} <strong>{hostName}</strong>
                  </p>
                  <p className="property-details-host-role">{t("ui.property.hostRole")}</p>
                </div>
              </section>
            )}

            <section className="property-details-section" aria-labelledby="property-about-title">
              <h2 id="property-about-title" className="property-details-h2">
                {t("ui.property.about")}
              </h2>
              <p className="property-details-desc">{description || t("property.defaultDescription")}</p>
            </section>

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
