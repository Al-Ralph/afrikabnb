import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api, toIsoDay } from "../../api/client";
import BookingItem from "./BookingItem";

const GROUPS = ["upcoming", "past", "cancelled"];

const MyBookings = () => {
  const { t } = useLanguage();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const today = toIsoDay(new Date());

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getMyBookings()
      .then((data) => {
        if (active) setBookings(data);
      })
      .catch((err) => {
        if (active) setError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  // Séjour en cours ou futur = à venir ; départ atteint = passé.
  const groups = useMemo(() => {
    const result = { upcoming: [], past: [], cancelled: [] };
    bookings.forEach((b) => {
      if (b.status === "CANCELLED") result.cancelled.push(b);
      else if (b.checkOut > today) result.upcoming.push(b);
      else result.past.push(b);
    });
    // L'API trie par arrivée décroissante : le prochain séjour d'abord pour « à venir ».
    result.upcoming.sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0));
    return result;
  }, [bookings, today]);

  const handleChange = (updated) => {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  };

  let content;
  if (loading) {
    content = (
      <div className="account-state" role="status" aria-live="polite">
        <div className="account-spinner" aria-hidden="true" />
        <p>{t("bookings.loading")}</p>
      </div>
    );
  } else if (error) {
    content = (
      <div className="account-state" role="alert">
        <p>{t("bookings.error")}</p>
        <button type="button" className="account-btn" onClick={load}>
          {t("bookings.retry")}
        </button>
      </div>
    );
  } else if (bookings.length === 0) {
    content = (
      <div className="account-state">
        <p>{t("bookings.empty")}</p>
      </div>
    );
  } else {
    content = GROUPS.map((group) => (
      <section key={group} className="bookings-group" aria-labelledby={`bookings-${group}`}>
        <h3 id={`bookings-${group}`} className="bookings-group-title">
          {t(`bookings.${group}`)} <span className="bookings-group-count">({groups[group].length})</span>
        </h3>
        {groups[group].length === 0 ? (
          <p className="bookings-group-empty">{t("bookings.noneInSection")}</p>
        ) : (
          <ul className="bookings-list">
            {groups[group].map((b) => (
              <BookingItem key={b.id} booking={b} kind={group} today={today} onChange={handleChange} />
            ))}
          </ul>
        )}
      </section>
    ));
  }

  return (
    <section className="profile-card profile-card-wide" aria-labelledby="profile-bookings-title">
      <h2 id="profile-bookings-title" className="profile-card-title">{t("bookings.title")}</h2>
      {content}
    </section>
  );
};

export default MyBookings;
