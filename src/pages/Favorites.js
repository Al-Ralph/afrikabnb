import React from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useFavorites } from "../context/FavoritesContext";
import PropertyCard from "../components/PropertyCard";
import Footer from "../components/Footer";
import "./Account.css";

const Favorites = () => {
  const { t } = useLanguage();
  const { user, loading: authLoading, openAuth } = useAuth();
  const { favorites, loading, error, reload } = useFavorites();

  let content;
  if (authLoading || (user && loading && favorites.length === 0)) {
    content = (
      <div className="account-state" role="status" aria-live="polite">
        <div className="account-spinner" aria-hidden="true" />
        <p>{t("favorites.loading")}</p>
      </div>
    );
  } else if (!user) {
    content = (
      <div className="account-state">
        <p>{t("favorites.loginRequired")}</p>
        <button type="button" className="account-btn account-btn-primary" onClick={openAuth}>
          {t("favorites.loginBtn")}
        </button>
      </div>
    );
  } else if (error && favorites.length === 0) {
    content = (
      <div className="account-state" role="alert">
        <p>{t("favorites.error")}</p>
        <button type="button" className="account-btn" onClick={reload}>
          {t("favorites.retry")}
        </button>
      </div>
    );
  } else if (favorites.length === 0) {
    content = (
      <div className="account-state">
        <p>{t("favorites.empty")}</p>
        <Link to="/" className="account-btn account-btn-primary">
          {t("favorites.emptyCta")}
        </Link>
      </div>
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
