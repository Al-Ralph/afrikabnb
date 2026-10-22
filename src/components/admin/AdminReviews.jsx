import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { formatDay } from "../../utils/format";
import { interpolate } from "../../utils/plural";
import { StarIcon } from "../Icons";
import { ListSkeleton } from "../Skeleton";
import ConfirmButton from "../host/ConfirmButton";
import { useAdminList } from "./useAdminList";
import Pagination from "./Pagination";

const NO_FILTERS = {};
const fetchReviews = (params) => api.getAdminReviews(params);

// Avis récents : modération par suppression (la note de l'annonce est recalculée par l'API).
const AdminReviews = () => {
  const { t, language } = useLanguage();
  const list = useAdminList(fetchReviews, NO_FILTERS);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const remove = async (review) => {
    setError(null);
    setNotice(null);
    try {
      await api.deleteReview(review.id);
      list.setData((rows) => rows.filter((r) => r.id !== review.id));
      setNotice(t("admin.reviews.deleted"));
    } catch (err) {
      if (err?.status === 404) list.setData((rows) => rows.filter((r) => r.id !== review.id));
      setError(err?.message || t("host.errors.generic"));
    }
  };

  return (
    <div className="admin-section">
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
      {list.status === "ready" && list.data.length === 0 && <p className="host-muted">{t("admin.reviews.empty")}</p>}
      {list.status === "ready" && list.data.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-caption">{interpolate(t("admin.reviews.caption"), { total: list.total })}</caption>
            <thead>
              <tr>
                <th scope="col">{t("admin.reviews.review")}</th>
                <th scope="col">{t("admin.reviews.author")}</th>
                <th scope="col">{t("admin.reviews.listing")}</th>
                <th scope="col">{t("admin.reviews.date")}</th>
                <th scope="col">{t("admin.listings.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id}>
                  <th scope="row" data-label={t("admin.reviews.review")} className="admin-review">
                    <span className="admin-review-body">
                      <span className="admin-rating tabular">
                        <StarIcon size={14} />
                        <span>{r.rating}/5</span>
                      </span>
                      <span className="admin-review-text">{r.comment || t("admin.reviews.noComment")}</span>
                    </span>
                  </th>
                  <td data-label={t("admin.reviews.author")}>
                    <span className="admin-user">
                      <span>{r.author?.name || "—"}</span>
                      <span className="host-muted">{r.author?.email}</span>
                    </span>
                  </td>
                  <td data-label={t("admin.reviews.listing")}>
                    {r.listing ? (
                      <Link to={`/property/${r.listing.id}`} className="admin-link">
                        {r.listing.title}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label={t("admin.reviews.date")} className="tabular">
                    {formatDay(String(r.createdAt || "").slice(0, 10), language)}
                  </td>
                  <td data-label={t("admin.listings.actions")}>
                    <ConfirmButton
                      className="host-btn host-btn--danger-outline"
                      label={t("admin.reviews.delete")}
                      prompt={t("admin.reviews.confirmDelete")}
                      confirmLabel={t("host.confirmYes")}
                      cancelLabel={t("host.confirmNo")}
                      onConfirm={() => remove(r)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={list.offset} total={list.total} onChange={list.setOffset} label={t("admin.reviews.pagination")} />
    </div>
  );
};

export default AdminReviews;
