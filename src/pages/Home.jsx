import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useSearch, searchToQuery, countActiveFilters } from "../context/SearchContext";
import Hero from "../components/Hero";
import SearchBar from "../components/SearchBar";
import Categories from "../components/Categories";
import PropertyCard from "../components/PropertyCard";
import Footer from "../components/Footer";
import EmptyState from "../components/EmptyState";
import { ListingGridSkeleton } from "../components/Skeleton";
import FiltersPanel from "../components/filters/FiltersPanel";
import { pluralize } from "../utils/plural";
import { api, isApiUnreachable, LISTING_SORTS } from "../api/client";
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
  const { t, language } = useLanguage();
  const { appliedSearch, resetSearch, applyFilters, setSort } = useSearch();
  const [urlParams, setUrlParams] = useSearchParams();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);
  const [error, setError] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Fourchette globale renvoyée par l'API (bornes des curseurs de prix).
  const [priceRange, setPriceRange] = useState(null);

  // Seuls les critères envoyés à l'API déclenchent un nouveau chargement.
  const { where, categoryId } = appliedSearch;
  const hasPets = appliedSearch.pets > 0;
  const guests = appliedSearch.adults + appliedSearch.children;
  const { minPrice, maxPrice, sort } = appliedSearch;
  const amenitiesKey = appliedSearch.amenities.join(",");
  const activeFilters = countActiveFilters(appliedSearch);

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
    // Filtres avancés transmis seulement s'ils sont actifs.
    const params = { where, categoryId, pets: hasPets, guests };
    if (minPrice != null) params.minPrice = minPrice;
    if (maxPrice != null) params.maxPrice = maxPrice;
    if (amenitiesKey) params.amenities = amenitiesKey.split(",");
    if (sort !== "recommended") params.sort = sort;
    api
      .getListings(params)
      .then(({ data, priceRange: range }) => {
        if (cancelled) return;
        setListings(data);
        if (range?.min != null && range?.max != null) setPriceRange(range);
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
  }, [where, categoryId, hasPets, guests, minPrice, maxPrice, amenitiesKey, sort]);

  return (
    <>
      <main className="home">
        <Hero />
        {/* Recherche à cheval sur le bas de la photo (styles dans Hero.css). */}
        <div className="hero__search">
          <SearchBar />
        </div>

        <section className="home-content" id="listings-anchor" aria-labelledby="home-listings-title">
          <div className="home-listings-head">
            <h2 className="home-listings-title" id="home-listings-title">
              {t("ui.home.listingsTitle")}
            </h2>
            <div className="home-listings-tools">
              {!loading && !error && listings.length > 0 && (
                <p className="home-listings-count" aria-live="polite">
                  {pluralize(t, language, "ui.home.count", listings.length)}
                </p>
              )}
              <label className="home-sort">
                <span>{t("sort.label")}</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {LISTING_SORTS.map((value) => (
                    <option key={value} value={value}>
                      {t(`sort.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <Categories onOpenFilters={() => setFiltersOpen(true)} activeFilters={activeFilters} />
          {filtersOpen && (
            <FiltersPanel
              applied={appliedSearch}
              priceRange={priceRange}
              onClose={() => setFiltersOpen(false)}
              onApply={(filters) => {
                applyFilters(filters);
                setFiltersOpen(false);
              }}
            />
          )}
          {!loading && useMock && (
            <p className="listings-demo-banner" role="note">{t("home.demoBanner")}</p>
          )}
          {loading && <ListingGridSkeleton label={t("home.loading")} className="listings-skeleton" />}
          {!loading && error && (
            <EmptyState icon="compass" tone="danger" role="alert" title={t("ui.home.errorTitle")}>
              <p>{t("home.error")}</p>
            </EmptyState>
          )}
          {!loading && !error && listings.length === 0 && (
            <EmptyState
              icon="search"
              role="status"
              title={t("ui.home.emptyTitle")}
              action={
                <button type="button" className="btn btn--secondary" onClick={resetSearch}>
                  {t("home.resetFilters")}
                </button>
              }
            >
              <p>{t("home.empty")}</p>
            </EmptyState>
          )}
          {!loading && !error && listings.length > 0 && (
            <ul className="listings-grid">
              {listings.map((listing, index) => (
                <li key={listing.id} className="listings-item" style={{ "--i": Math.min(index, 11) }}>
                  <PropertyCard
                    id={listing.id}
                    location={listing.location}
                    title={listing.title}
                    price={listing.price}
                    currency={listing.currency}
                    rating={listing.rating}
                    reviewCount={listing.reviewCount}
                    image={listing.image}
                    images={listing.images}
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
