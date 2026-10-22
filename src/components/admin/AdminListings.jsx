import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { formatPrice } from "../../utils/format";
import { interpolate } from "../../utils/plural";
import { ListSkeleton } from "../Skeleton";
import ConfirmButton from "../host/ConfirmButton";
import { useAdminList } from "./useAdminList";
import Pagination from "./Pagination";

const STATUSES = ["ACTIVE", "HIDDEN"];
const fetchListings = (params) => api.getAdminListings(params);

// Annonces : recherche, filtre de statut, masquage / réactivation avec confirmation.
const AdminListings = () => {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "" });
  const list = useAdminList(fetchListings, filters);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const setStatus = async (listing, status) => {
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateListingStatus(listing.id, status);
      list.setData((rows) => rows.map((l) => (l.id === listing.id ? { ...l, status: updated?.status || status } : l)));
      setNotice(interpolate(t(status === "HIDDEN" ? "admin.listings.hidden" : "admin.listings.shown"), { title: listing.title }));
    } catch (err) {
      setError(err?.message || t("host.errors.generic"));
    }
  };

  return (
    <div className="admin-section">
      <form
        className="admin-toolbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters((f) => ({ ...f, q: query.trim() }));
        }}
      >
        <div className="admin-field admin-field--grow">
          <label htmlFor="admin-listings-q">{t("admin.listings.search")}</label>
          <input
            id="admin-listings-q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.listings.searchPlaceholder")}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="admin-listings-status">{t("admin.listings.statusFilter")}</label>
          <select
            id="admin-listings-status"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">{t("admin.all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.listingStatus.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="host-btn host-btn--primary">
          {t("admin.searchButton")}
        </button>
      </form>

      {notice && (
        <p className="host-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="host-alert" role="alert">
          {error}
        </p>
      )}

      {list.status === "loading" && <ListSkeleton label={t("host.loading")} rows={4} media={false} />}
      {list.status === "error" && (
        <p className="host-alert" role="alert">
          {t("host.loadError")}
        </p>
      )}
      {list.status === "ready" && list.data.length === 0 && <p className="host-muted">{t("admin.listings.empty")}</p>}
      {list.status === "ready" && list.data.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-caption">{interpolate(t("admin.listings.caption"), { total: list.total })}</caption>
            <thead>
              <tr>
                <th scope="col">{t("admin.listings.listing")}</th>
                <th scope="col">{t("admin.listings.host")}</th>
                <th scope="col">{t("admin.listings.price")}</th>
                <th scope="col">{t("admin.listings.activity")}</th>
                <th scope="col">{t("admin.listings.status")}</th>
                <th scope="col">{t("admin.listings.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((l) => {
                const hidden = l.status === "HIDDEN";
                return (
                  <tr key={l.id}>
                    <th scope="row" data-label={t("admin.listings.listing")}>
                      <span className="admin-user">
                        <Link to={`/property/${l.id}`} className="admin-link">
                          {l.title}
                        </Link>
                        <span className="host-muted">{l.location}</span>
                      </span>
                    </th>
                    <td data-label={t("admin.listings.host")}>
                      <span className="admin-user">
                        <span>{l.host?.name || "—"}</span>
                        <span className="host-muted">{l.host?.email}</span>
                      </span>
                    </td>
                    <td data-label={t("admin.listings.price")} className="tabular">
                      {formatPrice(l.price, l.currency, language)}
                    </td>
                    <td data-label={t("admin.listings.activity")} className="tabular">
                      {interpolate(t("admin.listings.activityValue"), { bookings: l.bookingsCount ?? 0, reviews: l.reviewsCount ?? 0 })}
                    </td>
                    <td data-label={t("admin.listings.status")}>
                      <span className={`host-status ${hidden ? "host-status--expired" : "host-status--confirmed"}`}>
                        {t(`admin.listingStatus.${hidden ? "HIDDEN" : "ACTIVE"}`)}
                      </span>
                    </td>
                    <td data-label={t("admin.listings.actions")}>
                      <ConfirmButton
                        className={`host-btn${hidden ? "" : " host-btn--danger-outline"}`}
                        tone={hidden ? "primary" : "danger"}
                        label={hidden ? t("admin.listings.show") : t("admin.listings.hide")}
                        prompt={interpolate(t(hidden ? "admin.listings.confirmShow" : "admin.listings.confirmHide"), { title: l.title })}
                        confirmLabel={t("host.confirmYes")}
                        cancelLabel={t("host.confirmNo")}
                        onConfirm={() => setStatus(l, hidden ? "ACTIVE" : "HIDDEN")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={list.offset} total={list.total} onChange={list.setOffset} label={t("admin.listings.pagination")} />
    </div>
  );
};

export default AdminListings;
