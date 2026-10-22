import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import ListingForm from "../components/host/ListingForm";
import HostBookings from "../components/host/HostBookings";
import ConfirmButton from "../components/host/ConfirmButton";
import { formatPrice } from "../utils/format";
import { useAuth, OPEN_AUTH_EVENT } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../api/client";
import "./Host.css";

const Host = () => {
  const { t, language } = useLanguage();
  const { user, loading: authLoading, updateUser } = useAuth();
  const [listings, setListings] = useState([]);
  const [listingsStatus, setListingsStatus] = useState("loading");
  const [bookings, setBookings] = useState([]);
  const [bookingsStatus, setBookingsStatus] = useState("loading");
  const [editing, setEditing] = useState(null); // null | "new" | annonce
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const formAnchorRef = useRef(null);
  const userId = user?.id;

  const loadListings = useCallback(() => {
    return api
      .getMyListings()
      .then((data) => {
        setListings(data);
        setListingsStatus("ready");
      })
      .catch(() => setListingsStatus("error"));
  }, []);

  const loadBookings = useCallback(() => {
    return api
      .getMyHostBookings()
      .then((data) => {
        setBookings(data);
        setBookingsStatus("ready");
      })
      .catch(() => setBookingsStatus("error"));
  }, []);

  useEffect(() => {
    if (!userId) return;
    setListingsStatus("loading");
    setBookingsStatus("loading");
    loadListings();
    loadBookings();
  }, [userId, loadListings, loadBookings]);

  const startEdit = (value) => {
    setNotice(null);
    setActionError(null);
    setEditing(value);
    // Le formulaire est rendu en haut de la page : on y ramène le focus visuel.
    setTimeout(() => formAnchorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
  };

  const handleSaved = (saved, isEdit) => {
    setEditing(null);
    setNotice(isEdit ? t("host.updated") : t("host.created"));
    // Le backend promeut un GUEST en HOST à sa première annonce : refléter le rôle sans recharger.
    if (!isEdit && user?.role === "GUEST") updateUser({ role: "HOST" });
    setListings((prev) =>
      isEdit
        ? prev.map((l) => (String(l.id) === String(saved.id) ? { ...l, ...saved } : l))
        : [{ ...saved, upcomingBookings: 0 }, ...prev]
    );
  };

  const handleDelete = async (listing) => {
    setNotice(null);
    setActionError(null);
    try {
      await api.deleteListing(listing.id);
      setListings((prev) => prev.filter((l) => l.id !== listing.id));
      setNotice(t("host.deleted"));
      loadBookings();
    } catch (err) {
      setActionError(err?.message || t("host.errors.generic"));
    }
  };

  const handleBookingUpdated = (updated) => {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    loadListings();
  };

  if (authLoading) {
    return (
      <main className="host-page">
        <p className="host-muted" role="status">
          {t("host.loading")}
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <>
        <main className="host-page">
          <div className="host-page-invite">
            <h1>{t("host.inviteTitle")}</h1>
            <p>{t("host.inviteText")}</p>
            <button
              type="button"
              className="host-btn host-btn--primary"
              onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT))}
            >
              {t("host.inviteCta")}
            </button>
            <Link to="/" className="host-page-back">
              {t("property.backHome")}
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <main className="host-page">
        <div className="host-page-inner">
          <div className="host-page-header">
            <h1>{t("host.title")}</h1>
            {!editing && (
              <button type="button" className="host-btn host-btn--primary" onClick={() => startEdit("new")}>
                {t("host.newListing")}
              </button>
            )}
          </div>

          <div ref={formAnchorRef} />
          {notice && (
            <p className="host-notice" role="status">
              {notice}
            </p>
          )}
          {actionError && (
            <p className="host-alert" role="alert">
              {actionError}
            </p>
          )}

          {editing && (
            <ListingForm
              key={editing === "new" ? "new" : editing.id}
              listing={editing === "new" ? null : editing}
              onSaved={handleSaved}
              onCancel={() => setEditing(null)}
            />
          )}

          <section className="host-section" aria-labelledby="host-listings-title">
            <h2 id="host-listings-title">{t("host.myListings")}</h2>
            {listingsStatus === "loading" && (
              <p className="host-muted" role="status">
                {t("host.loading")}
              </p>
            )}
            {listingsStatus === "error" && (
              <p className="host-alert" role="alert">
                {t("host.loadError")}
              </p>
            )}
            {listingsStatus === "ready" && listings.length === 0 && (
              <p className="host-muted">{t("host.noListings")}</p>
            )}
            {listingsStatus === "ready" && listings.length > 0 && (
              <ul className="host-listings">
                {listings.map((listing) => (
                  <li key={listing.id} className="host-listing">
                    <Link to={`/property/${listing.id}`} className="host-listing-image-wrap">
                      {listing.image ? (
                        <img src={listing.image} alt="" className="host-listing-image" loading="lazy" />
                      ) : (
                        <span className="host-listing-image host-listing-image--empty" aria-hidden="true" />
                      )}
                    </Link>
                    <div className="host-listing-body">
                      <Link to={`/property/${listing.id}`} className="host-listing-title">
                        {listing.title}
                      </Link>
                      <p className="host-muted">{listing.location}</p>
                      <p>
                        <strong>{formatPrice(listing.price, listing.currency, language)}</strong> / {t("common.night")}
                      </p>
                      <p className="host-listing-upcoming">
                        {t("host.upcomingBookings")} : {listing.upcomingBookings ?? 0}
                      </p>
                      <div className="host-listing-actions">
                        <button type="button" className="host-btn" onClick={() => startEdit(listing)}>
                          {t("host.edit")}
                        </button>
                        <ConfirmButton
                          className="host-btn host-btn--danger-outline"
                          label={t("host.delete")}
                          prompt={t("host.confirmDelete")}
                          confirmLabel={t("host.confirmYes")}
                          cancelLabel={t("host.confirmNo")}
                          onConfirm={() => handleDelete(listing)}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="host-section" aria-labelledby="host-bookings-title">
            <h2 id="host-bookings-title">{t("host.receivedBookings")}</h2>
            {bookingsStatus === "loading" && (
              <p className="host-muted" role="status">
                {t("host.loading")}
              </p>
            )}
            {bookingsStatus === "error" && (
              <p className="host-alert" role="alert">
                {t("host.loadError")}
              </p>
            )}
            {bookingsStatus === "ready" && (
              <HostBookings bookings={bookings} onBookingUpdated={handleBookingUpdated} />
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Host;
