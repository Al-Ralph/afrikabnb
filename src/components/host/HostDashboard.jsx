import React, { useEffect, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { formatPrice, formatDay } from "../../utils/format";
import { pluralize } from "../../utils/plural";
import { StarIcon } from "../Icons";
import EmptyState from "../EmptyState";
import { LoadingRegion, Skeleton } from "../Skeleton";
import "./HostDashboard.css";

const PERIODS = ["past", "next"];

const percent = (ratio, language) =>
  new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 }).format(Math.max(0, Math.min(1, Number(ratio) || 0)));

const DashboardSkeleton = ({ label }) => (
  <LoadingRegion label={label}>
    <div className="dashboard-kpis">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="dashboard-card">
          <Skeleton className="skeleton-line" style={{ width: "55%" }} />
          <Skeleton className="skeleton-line skeleton-line--lg" style={{ width: "75%", height: 28 }} />
          <Skeleton className="skeleton-line" style={{ width: "40%" }} />
        </div>
      ))}
    </div>
    <div className="dashboard-grid">
      <div className="dashboard-card dashboard-card--tall">
        <Skeleton className="skeleton-line skeleton-line--lg" style={{ width: "40%" }} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="skeleton-line" style={{ width: "100%", height: 14 }} />
        ))}
      </div>
      <div className="dashboard-card dashboard-card--tall">
        <Skeleton className="skeleton-line skeleton-line--lg" style={{ width: "50%" }} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="skeleton-line" style={{ width: "80%" }} />
        ))}
      </div>
    </div>
  </LoadingRegion>
);

// Barre horizontale décorative : la valeur est lue dans le texte voisin.
const Bar = ({ ratio }) => (
  <span className="dashboard-bar" aria-hidden="true">
    <span className="dashboard-bar-fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio || 0)) * 100)}%` }} />
  </span>
);

// Tableau de bord hôte : revenus confirmés par devise, nuits, occupation, prochaines arrivées, note.
const HostDashboard = ({ onCreateListing, onShowRequests }) => {
  const { t, language } = useLanguage();
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("loading");
  const [period, setPeriod] = useState("past");

  useEffect(() => {
    let alive = true;
    api
      .getHostStats()
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

  if (status === "loading") return <DashboardSkeleton label={t("host.loading")} />;
  if (status === "error") {
    return (
      <EmptyState compact tone="danger" icon="compass" role="alert" title={t("dashboard.errorTitle")}>
        <p>{t("host.loadError")}</p>
      </EmptyState>
    );
  }

  if (!stats.listingsCount) {
    return (
      <EmptyState
        icon="home"
        title={t("dashboard.emptyTitle")}
        action={
          <button type="button" className="btn btn--primary" onClick={onCreateListing}>
            {t("host.newListing")}
          </button>
        }
      >
        <p>{t("dashboard.emptyText")}</p>
      </EmptyState>
    );
  }

  const revenue = Object.entries(stats.revenue || {});
  const nights = stats.nightsBooked || { past: 0, upcoming: 0 };
  const occupancy = stats.occupancy || [];
  const arrivals = stats.upcomingArrivals || [];
  const money = (rows, key) =>
    rows.length === 0 ? formatPrice(0, "XOF", language) : rows.map(([cur, v]) => formatPrice(v[key], cur, language)).join(" · ");

  return (
    <div className="dashboard">
      <section aria-labelledby="dashboard-kpis-title">
        <h2 id="dashboard-kpis-title" className="sr-only">
          {t("dashboard.kpisTitle")}
        </h2>
        <ul className="dashboard-kpis">
          <li className="dashboard-card">
            <p className="dashboard-label">{t("dashboard.revenuePast")}</p>
            <p className="dashboard-value tabular">{money(revenue, "past")}</p>
            <p className="host-muted">{t("dashboard.revenueHint")}</p>
          </li>
          <li className="dashboard-card">
            <p className="dashboard-label">{t("dashboard.revenueUpcoming")}</p>
            <p className="dashboard-value tabular">{money(revenue, "upcoming")}</p>
            <p className="host-muted">{t("dashboard.revenueUpcomingHint")}</p>
          </li>
          <li className="dashboard-card">
            <p className="dashboard-label">{t("dashboard.nights")}</p>
            <p className="dashboard-value tabular">{nights.total ?? (nights.past || 0) + (nights.upcoming || 0)}</p>
            <p className="host-muted tabular">
              {pluralize(t, language, "dashboard.nightsPast", nights.past || 0)} ·{" "}
              {pluralize(t, language, "dashboard.nightsUpcoming", nights.upcoming || 0)}
            </p>
          </li>
          <li className="dashboard-card">
            <p className="dashboard-label">{t("dashboard.rating")}</p>
            {stats.averageRating != null ? (
              <>
                <p className="dashboard-value tabular dashboard-rating">
                  <StarIcon size={20} />
                  {new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(stats.averageRating)}
                </p>
                <p className="host-muted">{pluralize(t, language, "dashboard.reviews", stats.reviewCount || 0)}</p>
              </>
            ) : (
              <>
                <p className="dashboard-value dashboard-value--muted">—</p>
                <p className="host-muted">{t("dashboard.noReviews")}</p>
              </>
            )}
          </li>
        </ul>
        {stats.pendingRequests > 0 && (
          <div className="dashboard-pending">
            <p>{pluralize(t, language, "dashboard.pending", stats.pendingRequests)}</p>
            <button type="button" className="host-btn" onClick={onShowRequests}>
              {t("dashboard.seeRequests")}
            </button>
          </div>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-card--tall" aria-labelledby="dashboard-occupancy-title">
          <div className="dashboard-card-head">
            <h2 id="dashboard-occupancy-title">{t("dashboard.occupancyTitle")}</h2>
            <div className="dashboard-toggle" role="group" aria-label={t("dashboard.periodLabel")}>
              {PERIODS.map((p) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                  {t(`dashboard.period.${p}`)}
                </button>
              ))}
            </div>
          </div>
          {occupancy.length === 0 ? (
            <p className="host-muted">{t("dashboard.noOccupancy")}</p>
          ) : (
            <table className="dashboard-occupancy">
              <caption className="sr-only">
                {t("dashboard.occupancyTitle")} — {t(`dashboard.period.${period}`)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t("dashboard.listing")}</th>
                  <th scope="col">{t("dashboard.days30")}</th>
                  <th scope="col">{t("dashboard.days90")}</th>
                </tr>
              </thead>
              <tbody>
                {occupancy.map((o) => {
                  const r30 = period === "past" ? o.last30 : o.next30;
                  const r90 = period === "past" ? o.last90 : o.next90;
                  return (
                    <tr key={o.listingId}>
                      <th scope="row">{o.title}</th>
                      <td>
                        <span className="dashboard-cell">
                          <Bar ratio={r30} />
                          <span className="tabular">{percent(r30, language)}</span>
                        </span>
                      </td>
                      <td>
                        <span className="dashboard-cell">
                          <Bar ratio={r90} />
                          <span className="tabular">{percent(r90, language)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="dashboard-card dashboard-card--tall" aria-labelledby="dashboard-arrivals-title">
          <h2 id="dashboard-arrivals-title">{t("dashboard.arrivalsTitle")}</h2>
          {arrivals.length === 0 ? (
            <p className="host-muted">{t("dashboard.noArrivals")}</p>
          ) : (
            <ul className="dashboard-arrivals">
              {arrivals.map((b) => (
                <li key={b.id}>
                  <span className="dashboard-arrival-date tabular">{formatDay(b.checkIn, language)}</span>
                  <span className="dashboard-arrival-body">
                    <strong>{b.guest?.name || t("host.guestUnknown")}</strong>
                    <span className="host-muted">
                      {b.listing?.title}
                      {b.nights ? ` · ${pluralize(t, language, "host.availability.nights", b.nights)}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default HostDashboard;
