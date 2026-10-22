import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { formatDay } from "../../utils/format";
import { interpolate } from "../../utils/plural";
import { ListSkeleton } from "../Skeleton";
import { useAdminList } from "./useAdminList";
import Pagination from "./Pagination";

export const ROLES = ["GUEST", "HOST", "ADMIN"];

const fetchUsers = (params) => api.getAdminUsers(params);

// Utilisateurs : recherche, filtre par rôle, pagination, changement de rôle avec confirmation.
const AdminUsers = ({ currentUserId }) => {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ q: "", role: "" });
  const list = useAdminList(fetchUsers, filters);
  const [pending, setPending] = useState(null); // { id, role }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const applyRole = async (user) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateUserRole(user.id, pending.role);
      list.setData((rows) => rows.map((u) => (u.id === user.id ? { ...u, ...updated } : u)));
      setNotice(
        interpolate(t("admin.users.roleChanged"), { name: user.name || user.email, role: t(`admin.roles.${pending.role}`) })
      );
      setPending(null);
    } catch (err) {
      if (err?.status === 409) setError(t("admin.users.lastAdmin"));
      else if (err?.status === 404) setError(t("admin.users.notFound"));
      else setError(err?.message || t("host.errors.generic"));
      setPending(null);
    } finally {
      setBusy(false);
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
          <label htmlFor="admin-users-q">{t("admin.users.search")}</label>
          <input
            id="admin-users-q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.users.searchPlaceholder")}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="admin-users-role">{t("admin.users.roleFilter")}</label>
          <select id="admin-users-role" value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}>
            <option value="">{t("admin.all")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`admin.roles.${r}`)}
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
      {list.status === "ready" && list.data.length === 0 && <p className="host-muted">{t("admin.users.empty")}</p>}
      {list.status === "ready" && list.data.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-caption">
              {interpolate(t("admin.users.caption"), { total: list.total })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("admin.users.user")}</th>
                <th scope="col">{t("admin.users.role")}</th>
                <th scope="col">{t("admin.users.listings")}</th>
                <th scope="col">{t("admin.users.bookings")}</th>
                <th scope="col">{t("admin.users.createdAt")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((u) => {
                const isSelf = String(u.id) === String(currentUserId);
                const confirming = pending?.id === u.id;
                const name = u.name || u.email;
                return (
                  <tr key={u.id}>
                    <th scope="row" data-label={t("admin.users.user")}>
                      <span className="admin-user">
                        <span className="admin-user-name">
                          {name}
                          {isSelf && <span className="host-tag">{t("admin.users.you")}</span>}
                        </span>
                        <span className="host-muted">{u.email}</span>
                      </span>
                    </th>
                    <td data-label={t("admin.users.role")}>
                      <div className="admin-role">
                        <select
                          aria-label={interpolate(t("admin.users.roleOf"), { name })}
                          value={confirming ? pending.role : u.role}
                          disabled={busy || isSelf}
                          onChange={(e) => {
                            setError(null);
                            setNotice(null);
                            setPending(e.target.value === u.role ? null : { id: u.id, role: e.target.value });
                          }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`admin.roles.${r}`)}
                            </option>
                          ))}
                        </select>
                        {confirming && (
                          <span className="host-confirm" role="group" aria-label={t("admin.users.confirmGroup")}>
                            <span className="host-confirm-prompt">
                              {interpolate(t("admin.users.confirmRole"), { name, role: t(`admin.roles.${pending.role}`) })}
                            </span>
                            <button type="button" className="host-btn host-btn--primary" onClick={() => applyRole(u)} disabled={busy}>
                              {t("host.confirmYes")}
                            </button>
                            <button type="button" className="host-btn" onClick={() => setPending(null)} disabled={busy}>
                              {t("host.confirmNo")}
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label={t("admin.users.listings")} className="tabular">
                      {u.listingsCount ?? 0}
                    </td>
                    <td data-label={t("admin.users.bookings")} className="tabular">
                      {u.bookingsCount ?? 0}
                    </td>
                    <td data-label={t("admin.users.createdAt")} className="tabular">
                      {formatDay(String(u.createdAt || "").slice(0, 10), language)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={list.offset} total={list.total} onChange={list.setOffset} label={t("admin.users.pagination")} />
    </div>
  );
};

export default AdminUsers;
