import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useSearch, searchToQuery } from "../context/SearchContext";
import Hero from "../components/Hero";
import SearchBar from "../components/SearchBar";
import Categories from "../components/Categories";
import PropertyCard from "../components/PropertyCard";
import Footer from "../components/Footer";
import { api, isApiUnreachable } from "../api/client";
import { listings as mockListings } from "../data/listings";
import "./Home.css";

// Données de démonstration (API injoignable) : seul le filtre texte est applicable,
// les mocks n'ont ni catégorie ni capacité.
function filterMockListings(where) {
  const needle = where.trim().toLowerCase();
  if (!needle) return mockListings;
  return mockListings.filter(
    (l) => l.location.toLowerCase().includes(needle) || l.title.toLowerCase().includes(needle)
  );
}

const Home = () => {
  const { t } = useLanguage();
  const { appliedSearch, resetSearch } = useSearch();
  const [urlParams, setUrlParams] = useSearchParams();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);
  const [error, setError] = useState(null);

  // Seuls les critères envoyés à l'API déclenchent un nouveau chargement.
  const { where, categoryId } = appliedSearch;
  const hasPets = appliedSearch.pets > 0;
  const guests = appliedSearch.adults + appliedSearch.children;

  // URL partageable : reflète la recherche appliquée.
  const queryString = searchToQuery(appliedSearch);
  useEffect(() => {
    if (queryString !== urlParams.toString()) {
      setUrlParams(new URLSearchParams(queryString), { replace: true });
    }
  }, [queryString, urlParams, setUrlParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getListings({ where, categoryId, pets: hasPets, guests })
      .then(({ data }) => {
        if (cancelled) return;
        setListings(data);
        setUseMock(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isApiUnreachable(err)) {
          setListings(filterMockListings(where));
          setUseMock(true);
        } else {
          setListings([]);
          setUseMock(false);
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [where, categoryId, hasPets, guests]);

  return (
    <>
      <main className="home">
        <Hero />

        <section className="home-search" id="listings-anchor" aria-labelledby="home-search-heading">
          <h2 className="home-search-title" id="home-search-heading">
            {t("home.title")} <span className="hero-title-accent">{t("home.titleAccent")}</span>
          </h2>
          <SearchBar />
        </section>

        <section className="home-content" aria-label={t("home.listingsLabel")}>
          <Categories />
          {!loading && useMock && (
            <p className="listings-demo-banner" role="note">{t("home.demoBanner")}</p>
          )}
          {loading && (
            <div className="listings-loading" role="status" aria-live="polite">
              <div className="listings-loading-spinner" aria-hidden="true" />
              <p>{t("home.loading")}</p>
            </div>
          )}
          {!loading && error && (
            <div className="listings-error" role="alert">
              <p>{t("home.error")}</p>
            </div>
          )}
          {!loading && !error && listings.length === 0 && (
            <div className="listings-empty" role="status">
              <p>{t("home.empty")}</p>
              <button type="button" className="listings-reset-btn" onClick={resetSearch}>
                {t("home.resetFilters")}
              </button>
            </div>
          )}
          {!loading && !error && listings.length > 0 && (
            <ul className="listings-grid">
              {listings.map((listing) => (
                <li key={listing.id} className="listings-item">
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
          )}
        </section>
      </main>
      <Footer />
    </>
  );
};

export default Home;
