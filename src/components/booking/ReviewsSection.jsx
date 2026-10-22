import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { formatDay } from "../../utils/format";
import { StarIcon } from "../Icons";
import { ListSkeleton } from "../Skeleton";
import "./ReviewsSection.css";

export const REVIEWS_PAGE_SIZE = 5;

const Stars = ({ rating, label }) => {
  const value = Math.round(Number(rating) || 0);
  return (
    <span className="reviews-stars" role="img" aria-label={label}>
      {Array.from({ length: value }, (_, i) => (
        <StarIcon key={i} size={14} />
      ))}
      <span className="reviews-stars-empty">
        {Array.from({ length: Math.max(0, 5 - value) }, (_, i) => (
          <StarIcon key={i} size={14} />
        ))}
      </span>
    </span>
  );
};

// Avis d'une annonce, paginés (« Voir plus » ajoute la page suivante).
const ReviewsSection = ({ listingId }) => {
  const { t, language } = useLanguage();
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [average, setAverage] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPage = useCallback(
    (offset) =>
      api.getReviews(listingId, { limit: REVIEWS_PAGE_SIZE, offset }).then((res) => {
        if (!mountedRef.current) return;
        setReviews((prev) => (offset === 0 ? res.data : [...prev, ...res.data]));
        setTotal(res.total);
        setAverage(res.rating ?? null);
      }),
    [listingId]
  );

  useEffect(() => {
    setStatus("loading");
    setReviews([]);
    loadPage(0)
      .then(() => mountedRef.current && setStatus("ready"))
      .catch(() => mountedRef.current && setStatus("error"));
  }, [loadPage]);

  const loadMore = () => {
    setLoadingMore(true);
    loadPage(reviews.length)
      .catch(() => mountedRef.current && setStatus("error"))
      .finally(() => mountedRef.current && setLoadingMore(false));
  };

  const starsLabel = (r) => t("reviews.starsLabel").replace("{rating}", String(r));

  return (
    <section className="reviews" aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="reviews-title">
        {average != null && total > 0 && <StarIcon size={18} />}
        {average != null && total > 0 ? `${Number(average).toFixed(1)} · ` : ""}
        {total} {total > 1 ? t("reviews.reviewsPlural") : t("reviews.reviewSingular")}
      </h2>
      {status === "loading" && (
        <ListSkeleton label={t("reviews.loading")} rows={2} media={false} />
      )}
      {status === "error" && (
        <p className="reviews-muted" role="alert">
          {t("reviews.error")}
        </p>
      )}
      {status === "ready" && reviews.length === 0 && <p className="reviews-muted">{t("reviews.empty")}</p>}
      {reviews.length > 0 && (
        <ul className="reviews-list">
          {reviews.map((review) => {
            const name = review.author?.name || t("reviews.anonymous");
            return (
              <li key={review.id} className="reviews-item">
                <div className="reviews-author">
                  {review.author?.avatar ? (
                    <img src={review.author.avatar} alt="" className="reviews-avatar" />
                  ) : (
                    <span className="reviews-avatar reviews-avatar--initial" aria-hidden="true">
                      {name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <p className="reviews-name">{name}</p>
                    <p className="reviews-date">{formatDay(String(review.createdAt || "").slice(0, 10), language)}</p>
                  </div>
                </div>
                <Stars rating={review.rating} label={starsLabel(review.rating)} />
                <p className="reviews-comment">{review.comment}</p>
              </li>
            );
          })}
        </ul>
      )}
      {status !== "loading" && reviews.length < total && (
        <button type="button" className="reviews-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? t("reviews.loading") : t("reviews.showMore")}
        </button>
      )}
    </section>
  );
};

export default ReviewsSection;
