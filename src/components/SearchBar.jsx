import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useSearch } from "../context/SearchContext";
import PlacesAutocompleteInput from "./PlacesAutocompleteInput";
import DatePickerPanel from "./DatePickerPanel";
import GuestsPanel from "./GuestsPanel";
import { formatDateShort } from "../utils/dateUtils";
import "./SearchBar.css";

const PinIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
  </svg>
);

const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

function formatGuestsSummary(adults, children, babies, pets) {
  const parts = [];
  if (adults > 0) parts.push(adults === 1 ? "1 adulte" : `${adults} adultes`);
  if (children > 0) parts.push(children === 1 ? "1 enfant" : `${children} enfants`);
  if (babies > 0) parts.push(babies === 1 ? "1 bébé" : `${babies} bébés`);
  if (pets > 0) parts.push(pets === 1 ? "1 animal" : `${pets} animaux`);
  return parts.length ? parts.join(", ") : "";
}

const SearchBar = () => {
  const { t } = useLanguage();
  const { searchParams, setSearchParams, applySearch } = useSearch();
  const [datesOpen, setDatesOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const datesRef = useRef(null);
  const guestsRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (datesRef.current && !datesRef.current.contains(e.target)) setDatesOpen(false);
      if (guestsRef.current && !guestsRef.current.contains(e.target)) setGuestsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setDatesOpen(false);
    setGuestsOpen(false);
    applySearch();
  };

  const handleWhereChange = useCallback(
    (v) => setSearchParams((p) => ({ ...p, where: v })),
    [setSearchParams]
  );

  const datesLabel =
    searchParams.checkIn && searchParams.checkOut
      ? `${formatDateShort(searchParams.checkIn)} - ${formatDateShort(searchParams.checkOut)}`
      : t("searchBar.dates");

  const guestsLabel = formatGuestsSummary(
    searchParams.adults,
    searchParams.children,
    searchParams.babies,
    searchParams.pets
  ) || t("searchBar.guests");

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-bar-inner">
        <div className="search-field">
          <span className="search-field-icon"><PinIcon /></span>
          <PlacesAutocompleteInput
            value={searchParams.where}
            onChange={handleWhereChange}
            placeholder={t("searchBar.where")}
            className="search-input"
            aria-label="Destination"
          />
        </div>
        <div className="search-divider" />
        <div className="search-field search-field--clickable" ref={datesRef}>
          <span className="search-field-icon"><CalendarIcon /></span>
          <button
            type="button"
            className="search-input search-input-btn"
            onClick={() => { setDatesOpen(!datesOpen); setGuestsOpen(false); }}
            aria-expanded={datesOpen}
            aria-haspopup="dialog"
          >
            {datesLabel}
          </button>
          {datesOpen && (
            <div className="search-bar-dropdown search-bar-dropdown--dates">
              <DatePickerPanel
                checkIn={searchParams.checkIn}
                checkOut={searchParams.checkOut}
                flexibility={searchParams.flexibility}
                onCheckInChange={(d) => setSearchParams((p) => ({ ...p, checkIn: d }))}
                onCheckOutChange={(d) => setSearchParams((p) => ({ ...p, checkOut: d }))}
                onFlexibilityChange={(id) => setSearchParams((p) => ({ ...p, flexibility: id }))}
              />
            </div>
          )}
        </div>
        <div className="search-divider" />
        <div className="search-field search-field--clickable" ref={guestsRef}>
          <span className="search-field-icon"><UsersIcon /></span>
          <button
            type="button"
            className="search-input search-input-btn"
            onClick={() => { setGuestsOpen(!guestsOpen); setDatesOpen(false); }}
            aria-expanded={guestsOpen}
            aria-haspopup="dialog"
          >
            {guestsLabel}
          </button>
          {guestsOpen && (
            <div className="search-bar-dropdown search-bar-dropdown--guests">
              <GuestsPanel
                adults={searchParams.adults}
                children={searchParams.children}
                babies={searchParams.babies}
                pets={searchParams.pets}
                onChange={(guests) => setSearchParams((p) => ({ ...p, ...guests }))}
              />
            </div>
          )}
        </div>
        <button type="submit" className="search-btn">
          <SearchIcon />
          <span>{t("searchBar.search")}</span>
        </button>
      </div>
    </form>
  );
};

export default SearchBar;
