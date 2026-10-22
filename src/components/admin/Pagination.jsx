import React from "react";
import { useLanguage } from "../../context/LanguageContext";
import { interpolate } from "../../utils/plural";
import { PAGE_SIZE } from "./useAdminList";

// Pagination « Précédent / Suivant » avec le rang affiché (« 1–20 sur 45 »).
const Pagination = ({ offset, total, onChange, label }) => {
  const { t } = useLanguage();
  if (total <= PAGE_SIZE) return null;
  const from = offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);
  return (
    <nav className="admin-pagination" aria-label={label}>
      <button type="button" className="host-btn" onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>
        {t("admin.pagination.prev")}
      </button>
      <p className="admin-pagination-range tabular" aria-live="polite">
        {interpolate(t("admin.pagination.range"), { from, to, total })}
      </p>
      <button type="button" className="host-btn" onClick={() => onChange(offset + PAGE_SIZE)} disabled={to >= total}>
        {t("admin.pagination.next")}
      </button>
    </nav>
  );
};

export default Pagination;
