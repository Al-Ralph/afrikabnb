import React from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useFavorites } from "../context/FavoritesContext";
import PropertyCard from "../components/PropertyCard";
import Footer from "../components/Footer";
import EmptyState from "../components/EmptyState";
import { ListingGridSkeleton } from "../components/Skeleton";
import "./Account.css";

const Favorites = () => {
  const { t } = useLanguage();
  const { user, loading: authLoading, openAuth } = useAuth();
  const { favorites, loading, error, reload } = useFavorites();

  let content;
  if (authLoading || (user && loading && favorites.length === 0)) {
    content = <ListingGridSkeleton label={t("favorites.loading")} count={4} />;
  } else if (!user) {
    content = (
      <EmptyState
        icon="heart"
        title={t("ui.favorites.loginTitle")}
        action={
          <button type="button" className="btn btn--primary" onClick={openAuth}>
            {t("favorites.loginBtn")}
          </button>
        }
      >
        <p>{t("favorites.loginRequired")}</p>
      </EmptyState>
    );
  } else if (error && favorites.length === 0) {
    content = (
      <EmptyState
        icon="heart"
        tone="danger"
        role="alert"
        action={
          <button type="button" className="btn btn--secondary" onClick={reload}>
            {t("favorites.retry")}
          </button>
        }
      >
        <p>{t("favorites.error")}</p>
      </EmptyState>
    );
  } else if (favorites.length === 0) {
    content = (
      <EmptyState
        icon="heart"
        title={t("ui.favorites.emptyTitle")}
        action={
          <Link to="/" className="btn btn--primary">
            {t("favorites.emptyCta")}
          </Link>
        }
      >
        <p>{t("favorites.empty")}</p>
      </EmptyState>
    );
  } else {
    content = (
      <>
        {error && (
          <p className="account-alert account-alert-error" role="alert">
            {t("favorites.toggleError")}
          </p>
        )}
        <ul className="favorites-grid">
          {favorites.map((listing) => (
            <li key={listing.id}>
              <PropertyCard
                id={listing.id}
                location={listing.location}
                title={listing.title}
                price={listing.price}
                currency={listing.currency}
                rating={listing.rating}
                image={listing.image}
              />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <main className="account-page">
        <div className="account-page-inner">
          <h1 className="account-page-title">{t("favorites.title")}</h1>
          {content}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Favorites;
