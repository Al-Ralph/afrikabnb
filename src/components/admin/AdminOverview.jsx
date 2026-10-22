import React, { useEffect, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { formatPrice } from "../../utils/format";
import { pluralize } from "../../utils/plural";
import EmptyState from "../EmptyState";
import { LoadingRegion, Skeleton } from "../Skeleton";

const ROLES = ["GUEST", "HOST", "ADMIN"];
const LISTING_STATUSES = ["ACTIVE", "HIDDEN"];
const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "DECLINED", "EXPIRED", "CANCELLED"];

const number = (n, language) => new Intl.NumberFormat(language).format(Number(n) || 0);

// Vue d'ensemble : statistiques globales (utilisateurs, annonces, réservations, revenus confirmés).
const AdminOverview = () => {
  const { t, language } = useLanguage();
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let alive = true;
    api
      .getAdminStats()
      .then((data) => {
        if (!alive) return;
        setStats(data);
        setStatus("ready");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (status === "loading") {
    return (
      <LoadingRegion label={t("host.loading")}>
        <div className="admin-stats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="admin-stat">
              <Skeleton className="skeleton-line" style={{ width: "50%" }} />
              <Skeleton className="skeleton-line skeleton-line--lg" style={{ width: "40%", height: 30 }} />
              <Skeleton className="skeleton-line" style={{ width: "80%" }} />
            </div>
          ))}
        </div>
      </LoadingRegion>
    );
  }
  if (status === "error") {
    return (
      <EmptyState compact tone="danger" icon="compass" role="alert" title={t("dashboard.errorTitle")}>
        <p>{t("host.loadError")}</p>
      </EmptyState>
    );
  }

  const breakdown = (counts = {}, keys, labelKey) =>
    keys
      .filter((k) => counts[k])
      .map((k) => (
        <li key={k}>
          <span>{t(`${labelKey}.${k}`)}</span>
          <span className="tabular">{number(counts[k], language)}</span>
        </li>
      ));

  const revenue = stats.confirmedRevenue || [];

  return (
    <ul className="admin-stats">
      <li className="admin-stat">
        <p className="admin-stat-label">{t("admin.overview.users")}</p>
        <p className="admin-stat-value tabular">{number(stats.users?.total, language)}</p>
        <ul className="admin-stat-breakdown">{breakdown(stats.users?.byRole, ROLES, "admin.roles")}</ul>
      </li>
      <li className="admin-stat">
        <p className="admin-stat-label">{t("admin.overview.listings")}</p>
        <p className="admin-stat-value tabular">{number(stats.listings?.total, language)}</p>
        <ul className="admin-stat-breakdown">{breakdown(stats.listings?.byStatus, LISTING_STATUSES, "admin.listingStatus")}</ul>
      </li>
      <li className="admin-stat">
        <p className="admin-stat-label">{t("admin.overview.bookings")}</p>
        <p className="admin-stat-value tabular">{number(stats.bookings?.total, language)}</p>
        <ul className="admin-stat-breakdown">{breakdown(stats.bookings?.byStatus, BOOKING_STATUSES, "host.status")}</ul>
      </li>
      <li className="admin-stat">
        <p className="admin-stat-label">{t("admin.overview.revenue")}</p>
        {revenue.length === 0 ? (
          <p className="admin-stat-value tabular">{formatPrice(0, "XOF", language)}</p>
        ) : (
          <ul className="admin-stat-breakdown admin-stat-breakdown--revenue">
            {revenue.map((r) => (
              <li key={r.currency}>
                <span className="admin-stat-money tabular">{formatPrice(r.total, r.currency, language)}</span>
                <span className="tabular">{pluralize(t, language, "admin.overview.bookingsCount", r.bookings || 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </li>
    </ul>
  );
};

export default AdminOverview;
