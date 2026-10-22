import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { apiErrorMessage } from "./errorMessage";

const StarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

// Note 1–5 : boutons radio natifs (flèches clavier) habillés en étoiles.
const ReviewForm = ({ bookingId, onReviewed, onAlreadyReviewed, onCancel }) => {
  const { t } = useLanguage();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const name = `review-rating-${bookingId}`;
  const commentId = `review-comment-${bookingId}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (rating < 1 || rating > 5) {
      setError(t("bookings.reviewRatingRequired"));
      return;
    }
    const text = comment.trim();
    if (!text || text.length > 1000) {
      setError(t("bookings.reviewCommentRequired"));
      return;
    }
    setSending(true);
    try {
      const review = await api.createReview(bookingId, { rating, comment: text });
      onReviewed(review);
    } catch (err) {
      if (err?.status === 409) {
        onAlreadyReviewed();
        return;
      }
      setError(apiErrorMessage(err, t("bookings.reviewError")));
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="review-form" onSubmit={handleSubmit} noValidate>
      <fieldset className="review-stars">
        <legend>{t("bookings.rating")}</legend>
        <div className="review-stars-row">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={`review-star${n <= rating ? " review-star--on" : ""}`}>
              <input
                type="radio"
                name={name}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="profile-sr-only"
              />
              <StarIcon />
              <span className="profile-sr-only">{t("bookings.starOf").replace("{n}", String(n))}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="profile-field">
        <label htmlFor={commentId}>{t("bookings.comment")}</label>
        <textarea
          id={commentId}
          rows={3}
          maxLength={1000}
          value={comment}
          placeholder={t("bookings.commentPlaceholder")}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {error && <p className="account-alert account-alert-error" role="alert">{error}</p>}
      <div className="profile-actions">
        <button type="submit" className="account-btn account-btn-primary" disabled={sending}>
          {sending ? t("bookings.submittingReview") : t("bookings.submitReview")}
        </button>
        <button type="button" className="account-btn" onClick={onCancel} disabled={sending}>
          {t("bookings.cancelNo")}
        </button>
      </div>
    </form>
  );
};

export default ReviewForm;
