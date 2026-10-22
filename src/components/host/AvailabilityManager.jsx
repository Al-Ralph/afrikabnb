import React, { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api, toIsoDay } from "../../api/client";
import { formatDay, nightsBetween, parseIsoDay } from "../../utils/format";
import { pluralize, interpolate } from "../../utils/plural";
import DatePickerPanel from "../DatePickerPanel";
import ConfirmButton from "./ConfirmButton";
import EmptyState from "../EmptyState";
import { ListSkeleton } from "../Skeleton";
import "./AvailabilityManager.css";

const MAX_REASON = 200;
const MAX_DAYS = 365;
const ACTIVE = new Set(["PENDING", "CONFIRMED"]);

// Les nuits [start, end[ chevauchent-elles une plage [r.start, r.end[ ?
const overlaps = (ranges, start, end) => ranges.find((r) => r.start < end && r.end > start);

// Calendrier de disponibilité d'une annonce : périodes bloquées par l'hôte (ajout, suppression)
// et réservations existantes, pour éviter les conflits (le serveur renvoie 409 sinon).
const AvailabilityManager = ({ listings, bookings }) => {
  const { t, language } = useLanguage();
  const [listingId, setListingId] = useState(() => listings[0]?.id ?? "");
  const [periods, setPeriods] = useState([]);
  const [status, setStatus] = useState("loading");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const todayIso = toIsoDay(new Date());

  const load = useCallback(() => {
    if (!listingId) return Promise.resolve();
    setStatus("loading");
    return api
      .getBlockedPeriods(listingId, { from: toIsoDay(new Date()) })
      .then((data) => {
        setPeriods(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  const listingBookings = bookings
    .filter((b) => String(b.listing?.id ?? b.listingId) === String(listingId))
    .filter((b) => ACTIVE.has(b.status) && b.checkOut > todayIso)
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));

  const busy = [
    ...listingBookings.map((b) => ({ start: b.checkIn, end: b.checkOut, booking: b })),
    ...periods.map((p) => ({ start: toIsoDay(p.startDate.slice(0, 10)), end: toIsoDay(p.endDate.slice(0, 10)), period: p })),
  ];

  const isDateDisabled = (date, { selecting, checkIn }) => {
    const iso = toIsoDay(date);
    const startIso = checkIn ? toIsoDay(checkIn) : "";
    if (selecting === "out" && startIso && iso > startIso) return Boolean(overlaps(busy, startIso, iso));
    return busy.some((r) => r.start <= iso && iso < r.end);
  };

  const resetForm = () => {
    setStartDate("");
    setEndDate("");
    setReason("");
    setPickerOpen(false);
  };

  const validate = () => {
    if (!startDate || !endDate) return t("host.availability.errors.required");
    if (startDate < todayIso) return t("host.availability.errors.past");
    if (endDate <= startDate) return t("host.availability.errors.order");
    if (nightsBetween(startDate, endDate) > MAX_DAYS) return t("host.availability.errors.tooLong");
    const conflict = overlaps(busy, startDate, endDate);
    if (conflict?.booking) {
      return interpolate(t("host.availability.errors.bookingConflict"), {
        guest: conflict.booking.guest?.name || t("host.guestUnknown"),
        from: formatDay(conflict.booking.checkIn, language),
        to: formatDay(conflict.booking.checkOut, language),
      });
    }
    if (conflict?.period) return t("host.availability.errors.alreadyBlocked");
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    setNotice(null);
    const err = validate();
    setFormError(err);
    if (err) return;
    setSaving(true);
    try {
      const created = await api.createBlockedPeriod(listingId, { startDate, endDate, reason: reason.trim() || undefined });
      setPeriods((prev) => [...prev, created].sort((a, b) => (a.startDate < b.startDate ? -1 : 1)));
      setNotice(t("host.availability.added"));
      resetForm();
    } catch (error) {
      if (error?.status === 409) setFormError(t("host.availability.errors.conflict"));
      else setFormError(error?.message || t("host.errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (period) => {
    setNotice(null);
    setFormError(null);
    try {
      await api.deleteBlockedPeriod(listingId, period.id);
      setPeriods((prev) => prev.filter((p) => p.id !== period.id));
      setNotice(t("host.availability.removed"));
    } catch (error) {
      if (error?.status === 404) setPeriods((prev) => prev.filter((p) => p.id !== period.id));
      setFormError(error?.message || t("host.errors.generic"));
    }
  };

  if (listings.length === 0) {
    return (
      <EmptyState compact icon="calendar" title={t("host.availability.noListingsTitle")}>
        <p>{t("host.availability.noListings")}</p>
      </EmptyState>
    );
  }

  const nightsLabel = (from, to) => pluralize(t, language, "host.availability.nights", nightsBetween(from, to));
  const range = (from, to) => `${formatDay(from, language)} → ${formatDay(to, language)}`;

  return (
    <div className="availability">
      <div className="listing-form-field availability-select">
        <label htmlFor="availability-listing">{t("host.availability.listing")}</label>
        <select
          id="availability-listing"
          value={listingId}
          onChange={(e) => {
            setListingId(e.target.value);
            setFormError(null);
            setNotice(null);
            resetForm();
          }}
        >
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </div>

      <div className="availability-layout">
        <form className="availability-form" onSubmit={submit} noValidate aria-labelledby="availability-form-title">
          <h3 id="availability-form-title">{t("host.availability.addTitle")}</h3>
          <p className="host-muted">{t("host.availability.addHint")}</p>
          <div className="availability-dates">
            <div className="listing-form-field">
              <label htmlFor="availability-start">{t("host.availability.start")}</label>
              <input
                id="availability-start"
                type="date"
                min={todayIso}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="listing-form-field">
              <label htmlFor="availability-end">{t("host.availability.end")}</label>
              <input
                id="availability-end"
                type="date"
                min={startDate || todayIso}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>
          <button
            type="button"
            className="host-btn availability-picker-toggle"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((o) => !o)}
          >
            {pickerOpen ? t("host.availability.hideCalendar") : t("host.availability.showCalendar")}
          </button>
          {pickerOpen && (
            <div className="availability-picker">
              <DatePickerPanel
                checkIn={parseIsoDay(startDate)}
                checkOut={parseIsoDay(endDate)}
                flexibility="exact"
                onCheckInChange={(d) => setStartDate(d ? toIsoDay(d) : "")}
                onCheckOutChange={(d) => setEndDate(d ? toIsoDay(d) : "")}
                onFlexibilityChange={() => {}}
                isDateDisabled={isDateDisabled}
                datesOnly
              />
            </div>
          )}
          <div className="listing-form-field">
            <label htmlFor="availability-reason">{t("host.availability.reason")}</label>
            <input
              id="availability-reason"
              type="text"
              maxLength={MAX_REASON}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("host.availability.reasonPlaceholder")}
            />
          </div>
          {startDate && endDate && endDate > startDate && (
            <p className="host-muted tabular">{`${range(startDate, endDate)} · ${nightsLabel(startDate, endDate)}`}</p>
          )}
          {formError && (
            <p className="host-alert" role="alert">
              {formError}
            </p>
          )}
          {notice && (
            <p className="host-notice" role="status">
              {notice}
            </p>
          )}
          <div>
            <button type="submit" className="host-btn host-btn--primary" disabled={saving}>
              {saving ? t("host.saving") : t("host.availability.block")}
            </button>
          </div>
        </form>

        <div className="availability-lists">
          <section aria-labelledby="availability-blocked-title">
            <h3 id="availability-blocked-title">{t("host.availability.blockedTitle")}</h3>
            {status === "loading" && <ListSkeleton label={t("host.loading")} rows={2} media={false} />}
            {status === "error" && (
              <p className="host-alert" role="alert">
                {t("host.loadError")}
              </p>
            )}
            {status === "ready" && periods.length === 0 && <p className="host-muted">{t("host.availability.noBlocked")}</p>}
            {status === "ready" && periods.length > 0 && (
              <ul className="availability-list">
                {periods.map((p) => {
                  const from = p.startDate.slice(0, 10);
                  const to = p.endDate.slice(0, 10);
                  return (
                    <li key={p.id} className="availability-item availability-item--blocked">
                      <div>
                        <p className="availability-range tabular">{range(from, to)}</p>
                        <p className="host-muted">
                          {nightsLabel(from, to)}
                          {p.reason ? ` · ${p.reason}` : ""}
                        </p>
                      </div>
                      <ConfirmButton
                        className="host-btn host-btn--danger-outline"
                        label={t("host.availability.unblock")}
                        prompt={t("host.availability.confirmUnblock")}
                        confirmLabel={t("host.confirmYes")}
                        cancelLabel={t("host.confirmNo")}
                        onConfirm={() => remove(p)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="availability-bookings-title">
            <h3 id="availability-bookings-title">{t("host.availability.bookingsTitle")}</h3>
            {listingBookings.length === 0 ? (
              <p className="host-muted">{t("host.availability.noBookings")}</p>
            ) : (
              <ul className="availability-list">
                {listingBookings.map((b) => (
                  <li key={b.id} className="availability-item">
                    <div>
                      <p className="availability-range tabular">{range(b.checkIn, b.checkOut)}</p>
                      <p className="host-muted">
                        {b.guest?.name || t("host.guestUnknown")} · {nightsLabel(b.checkIn, b.checkOut)}
                      </p>
                    </div>
                    <span className={`host-status host-status--${b.status.toLowerCase()}`}>{t(`host.status.${b.status}`)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default AvailabilityManager;
