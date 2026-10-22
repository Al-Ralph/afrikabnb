import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Footer from "../components/Footer";
import ListingForm from "../components/host/ListingForm";
import HostBookings from "../components/host/HostBookings";
import ConfirmButton from "../components/host/ConfirmButton";
import HostDashboard from "../components/host/HostDashboard";
import AvailabilityManager from "../components/host/AvailabilityManager";
import Tabs, { TabPanel } from "../components/host/Tabs";
import { effectiveStatus } from "../components/host/HostBookings";
import EmptyState from "../components/EmptyState";
import { ListSkeleton } from "../components/Skeleton";
import { formatPrice } from "../utils/format";
import { useAuth, OPEN_AUTH_EVENT } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../api/client";
import "./Host.css";

export const HOST_TABS = ["dashboard", "listings", "bookings", "availability"];

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
  const [searchParams, setSearchParams] = useSearchParams();
  const formAnchorRef = useRef(null);
  const userId = user?.id;
  const tabParam = searchParams.get("tab");
  const tab = HOST_TABS.includes(tabParam) ? tabParam : "dashboard";

  // Onglet actif dans l'URL (?tab=) : lien partageable, retour arrière du navigateur.
  const setTab = (id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === "dashboard") next.delete("tab");
      else next.set("tab", id);
      return next;
    });
  };

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
    if (tab !== "listings") setTab("listings");
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

  // Annonce créée mais photos en partie refusées : elle apparaît déjà dans la liste, le formulaire reste ouvert.
  const handleDraftSaved = (saved) => {
    if (user?.role === "GUEST") updateUser({ role: "HOST" });
    setListings((prev) =>
      prev.some((l) => String(l.id) === String(saved.id))
        ? prev.map((l) => (String(l.id) === String(saved.id) ? { ...l, ...saved } : l))
        : [{ ...saved, upcomingBookings: 0 }, ...prev]
    );
  };

  const handleCancelEdit = () => {
    setEditing(null);
    // Les photos d'une annonce existante sont enregistrées immédiatement : rafraîchir la couverture.
    loadListings();
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

  const pendingCount = bookings.filter((b) => effectiveStatus(b) === "PENDING").length;

  if (authLoading) {
    return (
      <main className="host-page">
        <div className="host-page-inner">
          <ListSkeleton label={t("host.loading")} rows={3} />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <>
        <main className="host-page">
          <div className="host-page-invite">
            <EmptyState
              icon="key"
              action={
                <>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT))}
                  >
                    {t("host.inviteCta")}
                  </button>
                  <Link to="/" className="btn btn--ghost">
                    {t("property.backHome")}
                  </Link>
                </>
              }
            >
              <h1 className="host-page-invite-title">{t("host.inviteTitle")}</h1>
              <p>{t("host.inviteText")}</p>
            </EmptyState>
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

          <Tabs
            idPrefix="host"
            label={t("host.tabs.label")}
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "dashboard", label: t("host.tabs.dashboard") },
              { id: "listings", label: t("host.tabs.listings") },
              {
                id: "bookings",
                label: t("host.tabs.bookings"),
                badge: pendingCount ? { count: pendingCount, label: t("host.tabs.pendingBadge") } : null,
              },
              { id: "availability", label: t("host.tabs.availability") },
            ]}
          />

          {tab === "dashboard" && (
            <TabPanel idPrefix="host" id="dashboard">
              <HostDashboard onCreateListing={() => startEdit("new")} onShowRequests={() => setTab("bookings")} />
            </TabPanel>
          )}

          {tab === "listings" && (
            <TabPanel idPrefix="host" id="listings">
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
                  onDraftSaved={handleDraftSaved}
                  onCancel={handleCancelEdit}
                />
              )}

              <section className="host-section" aria-labelledby="host-listings-title">
                <h2 id="host-listings-title">{t("host.myListings")}</h2>
                {listingsStatus === "loading" && <ListSkeleton label={t("host.loading")} rows={2} />}
                {listingsStatus === "error" && (
                  <p className="host-alert" role="alert">
                    {t("host.loadError")}
                  </p>
                )}
                {listingsStatus === "ready" && listings.length === 0 && (
                  <EmptyState compact icon="home" title={t("ui.host.noListingsTitle")}>
                    <p>{t("host.noListings")}</p>
                  </EmptyState>
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
                          <div className="host-listing-tags">
                            <span className="host-listing-upcoming">
                              {t("host.upcomingBookings")} : {listing.upcomingBookings ?? 0}
                            </span>
                            <span className="host-tag">
                              {listing.instantBook === false ? t("host.instantBook.tagRequest") : t("host.instantBook.tagInstant")}
                            </span>
                            {listing.status === "HIDDEN" && (
                              <span className="host-tag host-tag--warning">{t("host.hiddenTag")}</span>
                            )}
                          </div>
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
            </TabPanel>
          )}

          {tab === "bookings" && (
            <TabPanel idPrefix="host" id="bookings">
              <section className="host-section" aria-labelledby="host-bookings-title">
                <h2 id="host-bookings-title">{t("host.receivedBookings")}</h2>
                {bookingsStatus === "loading" && <ListSkeleton label={t("host.loading")} rows={2} media={false} />}
                {bookingsStatus === "error" && (
                  <p className="host-alert" role="alert">
                    {t("host.loadError")}
                  </p>
                )}
                {bookingsStatus === "ready" && (
                  <HostBookings bookings={bookings} onBookingUpdated={handleBookingUpdated} onReload={loadBookings} />
                )}
              </section>
            </TabPanel>
          )}

          {tab === "availability" && (
            <TabPanel idPrefix="host" id="availability">
              <section className="host-section" aria-labelledby="host-availability-title">
                <h2 id="host-availability-title">{t("host.availability.title")}</h2>
                {(listingsStatus === "loading" || bookingsStatus === "loading") && (
                  <ListSkeleton label={t("host.loading")} rows={2} media={false} />
                )}
                {listingsStatus === "error" && (
                  <p className="host-alert" role="alert">
                    {t("host.loadError")}
                  </p>
                )}
                {listingsStatus === "ready" && bookingsStatus !== "loading" && (
                  <AvailabilityManager listings={listings} bookings={bookingsStatus === "ready" ? bookings : []} />
                )}
              </section>
            </TabPanel>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Host;
