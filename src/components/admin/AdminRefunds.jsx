import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { formatDay, formatPrice } from "../../utils/format";
import { interpolate } from "../../utils/plural";
import { ListSkeleton } from "../Skeleton";
import ConfirmButton from "../host/ConfirmButton";
import { useAdminList } from "./useAdminList";
import Pagination from "./Pagination";

const STATUSES = ["REFUND_DUE", "REFUNDED"];

// Remboursements manuels : réservations payées puis annulées (ou payées après échéance / annulation).
// Le remboursement est effectué hors application, puis marqué « remboursé » ici.
const AdminRefunds = () => {
  const { t, language } = useLanguage();
  const [status, setStatus] = useState("REFUND_DUE");
  // Paiements à rembourser isolément (doublon, montant discordant) : renvoyés avec la liste.
  const [isolated, setIsolated] = useState([]);
  const fetchRefunds = useCallback(
    (params) =>
      api.getAdminRefunds(params).then((res) => {
        setIsolated(Array.isArray(res?.payments) ? res.payments : []);
        return res;
      }),
    []
  );
  const filters = useMemo(() => ({ status }), [status]);
  const list = useAdminList(fetchRefunds, filters);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const markRefunded = async (row) => {
    setError(null);
    setNotice(null);
    try {
      await api.markRefunded(row.id);
      list.setData((rows) => rows.filter((r) => r.id !== row.id));
      setNotice(t("payment.admin.refunded"));
    } catch (err) {
      setError(err?.message || t("host.errors.generic"));
      list.reload();
    }
  };

  const markPaymentRefunded = async (payment) => {
    setError(null);
    setNotice(null);
    try {
      await api.markPaymentRefunded(payment.id);
      setIsolated((rows) => rows.filter((p) => p.id !== payment.id));
      setNotice(t("payment.admin.paymentRefunded"));
    } catch (err) {
      setError(err?.message || t("host.errors.generic"));
      list.reload();
    }
  };

  return (
    <div className="admin-section">
      <p className="host-muted">{t("payment.admin.note")}</p>
      <div className="host-filters" role="group" aria-label={t("payment.admin.filterLabel")}>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`host-chip${status === s ? " host-chip--active" : ""}`}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s === "REFUND_DUE" ? t("payment.admin.due") : t("payment.admin.done")}
          </button>
        ))}
      </div>
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
      {list.status === "loading" && <ListSkeleton label={t("host.loading")} rows={3} media={false} />}
      {list.status === "error" && (
        <p className="host-alert" role="alert">
          {t("host.loadError")}
        </p>
      )}
      {list.status === "ready" && list.data.length === 0 && <p className="host-muted">{t("payment.admin.empty")}</p>}
      {list.status === "ready" && list.data.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-caption">{interpolate(t("payment.admin.caption"), { total: list.total })}</caption>
            <thead>
              <tr>
                <th scope="col">{t("payment.admin.booking")}</th>
                <th scope="col">{t("payment.admin.traveler")}</th>
                <th scope="col">{t("payment.admin.amount")}</th>
                <th scope="col">{t("payment.admin.transaction")}</th>
                {status === "REFUND_DUE" && <th scope="col">{t("payment.admin.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => {
                const paid = (r.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                return (
                  <tr key={r.id}>
                    <th scope="row" data-label={t("payment.admin.booking")}>
                      <span className="admin-user">
                        {r.listing ? (
                          <Link to={`/property/${r.listing.id}`} className="admin-link">
                            {r.listing.title}
                          </Link>
                        ) : (
                          "—"
                        )}
                        <span className="host-muted tabular">
                          {formatDay(r.checkIn, language)} → {formatDay(r.checkOut, language)}
                        </span>
                      </span>
                    </th>
                    <td data-label={t("payment.admin.traveler")}>
                      <span className="admin-user">
                        <span>
                          {r.traveler?.name || "—"}
                          {r.traveler?.account === false && ` (${t("payment.admin.noAccount")})`}
                        </span>
                        <span className="host-muted">{r.traveler?.email}</span>
                      </span>
                    </td>
                    <td data-label={t("payment.admin.amount")} className="tabular">
                      {formatPrice(paid || r.totalPrice, "XOF", language)}
                    </td>
                    <td data-label={t("payment.admin.transaction")}>
                      {(r.payments || []).map((p) => (
                        <span key={p.transactionId} className="admin-user">
                          <code>{p.transactionId}</code>
                          <span className="host-muted">{[p.method, p.operatorId].filter(Boolean).join(" · ")}</span>
                        </span>
                      ))}
                    </td>
                    {status === "REFUND_DUE" && (
                      <td data-label={t("payment.admin.actions")}>
                        <ConfirmButton
                          className="host-btn"
                          label={t("payment.admin.markRefunded")}
                          prompt={t("payment.admin.confirmRefunded")}
                          confirmLabel={t("host.confirmYes")}
                          cancelLabel={t("host.confirmNo")}
                          onConfirm={() => markRefunded(r)}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={list.offset} total={list.total} onChange={list.setOffset} label={t("payment.admin.pagination")} />
      {list.status === "ready" && isolated.length > 0 && (
        <section aria-labelledby="admin-isolated-refunds">
          <h3 id="admin-isolated-refunds">{t("payment.admin.isolatedTitle")}</h3>
          <p className="host-muted">{t("payment.admin.isolatedNote")}</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t("payment.admin.transaction")}</th>
                  <th scope="col">{t("payment.admin.reason")}</th>
                  <th scope="col">{t("payment.admin.traveler")}</th>
                  <th scope="col">{t("payment.admin.amount")}</th>
                  {status === "REFUND_DUE" && <th scope="col">{t("payment.admin.actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {isolated.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" data-label={t("payment.admin.transaction")}>
                      <span className="admin-user">
                        <code>{p.transactionId}</code>
                        <span className="host-muted">
                          {[p.booking?.listing?.title, p.method, p.operatorId].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </th>
                    <td data-label={t("payment.admin.reason")}>
                      {p.rawStatus === "AMOUNT_MISMATCH" ? t("payment.admin.reasonMismatch") : t("payment.admin.reasonDuplicate")}
                    </td>
                    <td data-label={t("payment.admin.traveler")}>
                      <span className="admin-user">
                        <span>{p.booking?.traveler?.name || "—"}</span>
                        <span className="host-muted">{p.booking?.traveler?.email}</span>
                      </span>
                    </td>
                    <td data-label={t("payment.admin.amount")} className="tabular">
                      {formatPrice(p.amount, p.currency || "XOF", language)}
                    </td>
                    {status === "REFUND_DUE" && (
                      <td data-label={t("payment.admin.actions")}>
                        <ConfirmButton
                          className="host-btn"
                          label={t("payment.admin.markRefunded")}
                          prompt={t("payment.admin.confirmRefunded")}
                          confirmLabel={t("host.confirmYes")}
                          cancelLabel={t("host.confirmNo")}
                          onConfirm={() => markPaymentRefunded(p)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminRefunds;
