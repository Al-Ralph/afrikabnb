import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { api, normalizeListing, toIsoDay } from "../api/client";
import { formatDay, formatPrice, nightsBetween } from "../utils/format";
import { interpolate } from "../utils/plural";
import { countryOptions } from "../components/booking/countries";
import EmptyState from "../components/EmptyState";
import "./Checkout.css";

export const NAME_MAX = 100;
export const MESSAGE_MAX = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9 ().-]*$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Ordre d'affichage : la première erreur de cet ordre reçoit le focus.
const FIELDS = ["name", "email", "phone", "country", "arrivalTime", "message", "acceptTerms"];

// Même règles que l'API (contactSchema) : { champ: clé de traduction }.
export function validateContact(form) {
  const errors = {};
  const name = form.name.trim();
  if (name.length < 2 || name.length > NAME_MAX) errors.name = "checkout.errors.name";
  const email = form.email.trim();
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = "checkout.errors.email";
  const phone = form.phone.trim();
  const digits = phone.replace(/\D/g, "").length;
  if (!PHONE_RE.test(phone) || phone.length > 32 || digits < 6 || digits > 15) errors.phone = "checkout.errors.phone";
  if (!/^[A-Z]{2}$/.test(form.country)) errors.country = "checkout.errors.country";
  if (form.arrivalTime && !TIME_RE.test(form.arrivalTime)) errors.arrivalTime = "checkout.errors.arrivalTime";
  if (form.message.length > MESSAGE_MAX) errors.message = "checkout.errors.message";
  if (!form.acceptTerms) errors.acceptTerms = "checkout.errors.terms";
  return errors;
}

// Paramètres de séjour de l'URL (?checkIn&checkOut&guests), ou null s'ils sont invalides.
function readStay(params, maxGuests) {
  const checkIn = toIsoDay(params.get("checkIn") || "");
  const checkOut = toIsoDay(params.get("checkOut") || "");
  const guests = Number(params.get("guests"));
  const nights = nightsBetween(checkIn, checkOut);
  if (!checkIn || !checkOut || checkIn < toIsoDay(new Date()) || nights < 1) return null;
  if (!Number.isInteger(guests) || guests < 1 || guests > Math.min(50, maxGuests || 50)) return null;
  return { checkIn, checkOut, guests, nights };
}

// Erreurs de validation de l'API (400) -> champs du formulaire.
function apiFieldErrors(details) {
  const errors = {};
  for (const d of details || []) {
    const path = String(d.path || "");
    const field = path === "acceptTerms" ? "acceptTerms" : path.startsWith("contact.") ? path.slice(8) : null;
    if (field && FIELDS.includes(field)) errors[field] = `checkout.errors.${field === "acceptTerms" ? "terms" : field}`;
  }
  return errors;
}

const emptyForm = (user) => ({
  name: user?.name || "",
  email: user?.email || "",
  phone: "",
  country: "",
  arrivalTime: "",
  message: "",
  acceptTerms: false,
});

// Étape de réservation : /reserver/:id?checkIn=…&checkOut=…&guests=…
// Même formulaire avec ou sans compte (pré-rempli pour un membre) ; coordonnées transmises à l'hôte.
const Checkout = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const { t, language } = useLanguage();
  const { user, openAuth } = useAuth();
  const { formatAmount, isConverted } = useCurrency();

  const initialListing = location.state?.listing?.id === id ? location.state.listing : null;
  const [listing, setListing] = useState(initialListing);
  const hadInitialListing = useRef(initialListing != null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(() => emptyForm(user));
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const refs = useRef({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getListing(id)
      .then((data) => {
        if (!cancelled) setListing(normalizeListing(data));
      })
      .catch(() => {
        if (!cancelled && !hadInitialListing.current) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Connexion pendant le remplissage : pré-remplit les champs encore vides.
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({ ...f, name: f.name || user.name || "", email: f.email || user.email || "" }));
  }, [user]);

  const countries = useMemo(() => countryOptions(language), [language]);
  const stay = useMemo(() => readStay(params, listing?.maxGuests), [params, listing?.maxGuests]);

  if (loadError) {
    return (
      <main className="checkout-page">
        <EmptyState icon="home" tone="danger" role="alert" title={t("checkout.loadError")}
          action={<Link to="/" className="btn btn--secondary">{t("checkout.backHome")}</Link>} />
      </main>
    );
  }
  if (!listing) {
    return (
      <main className="checkout-page">
        <p className="checkout-loading" role="status" aria-busy="true">{t("checkout.loading")}</p>
      </main>
    );
  }

  const listingPath = `/property/${encodeURIComponent(listing.id)}`;
  if (!stay) {
    return (
      <main className="checkout-page">
        <EmptyState icon="calendar" role="alert" title={t("checkout.invalidStayTitle")}
          action={<Link to={listingPath} className="btn btn--secondary">{t("checkout.back")}</Link>}>
          <p>{t("checkout.invalidStay")}</p>
        </EmptyState>
      </main>
    );
  }

  const currency = listing.currency || "XOF";
  const price = Number(listing.price) || 0;
  const total = price * stay.nights;
  // Sans compte : toujours une demande (l'hôte valide). Connecté : selon l'annonce.
  const isRequest = !user || listing.instantBook === false;
  const isOwner = user && listing.hostId != null && String(user.id) === String(listing.hostId);
  const nightsLabel = `${stay.nights} ${stay.nights > 1 ? t("booking.nights") : t("booking.night")}`;
  const guestsLabel = `${stay.guests} ${stay.guests > 1 ? t("booking.guestsPlural") : t("booking.guestSingular")}`;

  const setField = (field) => (e) => {
    const value = field === "acceptTerms" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const focusFirst = (errs) => {
    const first = FIELDS.find((f) => errs[f]);
    if (first) refs.current[first]?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const errs = validateContact(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirst(errs);
      return;
    }
    setSubmitting(true);
    try {
      const contact = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        country: form.country,
      };
      if (form.arrivalTime) contact.arrivalTime = form.arrivalTime;
      if (form.message.trim()) contact.message = form.message.trim();
      const created = await api.createBooking(listing.id, {
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        guests: stay.guests,
        contact,
        acceptTerms: true,
        website,
      });
      if (!mountedRef.current) return;
      setBooking({ ...created, contactEmail: contact.email });
      window.scrollTo?.(0, 0);
    } catch (err) {
      if (!mountedRef.current) return;
      const status = err?.status;
      if (status === 400) {
        const fieldErrs = apiFieldErrors(err.details);
        if (Object.keys(fieldErrs).length) {
          setErrors(fieldErrs);
          focusFirst(fieldErrs);
        }
        setFormError(t("checkout.errors.invalid"));
      } else if (status === 409) setFormError(t("checkout.errors.unavailable"));
      else if (status === 429) setFormError(t("checkout.errors.tooMany"));
      else if (status === 403) setFormError(t("checkout.errors.ownListing"));
      else if (status === 404) setFormError(t("checkout.errors.notFound"));
      else setFormError(t("checkout.errors.generic"));
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const summary = (
    <section className="checkout-summary" aria-labelledby="checkout-summary-title">
      <h2 id="checkout-summary-title" className="checkout-section-title">{t("checkout.summaryTitle")}</h2>
      <div className="checkout-listing">
        {listing.image && <img src={listing.image} alt="" className="checkout-listing-img" />}
        <div>
          <p className="checkout-listing-title">{listing.title}</p>
          {listing.location && <p className="checkout-muted">{listing.location}</p>}
        </div>
      </div>
      <dl className="checkout-lines">
        <div>
          <dt>{t("checkout.dates")}</dt>
          <dd>
            {formatDay(stay.checkIn, language)} → {formatDay(stay.checkOut, language)}
          </dd>
        </div>
        <div>
          <dt>{t("checkout.guests")}</dt>
          <dd>{guestsLabel}</dd>
        </div>
        <div>
          <dt>
            {formatAmount(price, currency)} × {nightsLabel}
          </dt>
          <dd>{formatAmount(total, currency)}</dd>
        </div>
        <div className="checkout-total">
          <dt>{t("checkout.total")}</dt>
          <dd data-testid="checkout-total">{formatAmount(booking ? booking.totalPrice : total, currency)}</dd>
        </div>
      </dl>
      {isConverted(currency) && (
        <p className="checkout-muted" data-testid="checkout-charged">
          {interpolate(t("currency.chargedAmount"), {
            amount: formatPrice(booking ? booking.totalPrice : total, currency, language),
          })}
        </p>
      )}
      <p className="checkout-muted">{t("booking.noCharge")}</p>
    </section>
  );

  if (booking) {
    const pending = booking.status === "PENDING";
    return (
      <main className="checkout-page">
        <div className="checkout-layout">
          <section className="checkout-card checkout-done" role="status" aria-labelledby="checkout-done-title">
            <h1 id="checkout-done-title" className="checkout-title">
              {pending ? t("checkout.sentTitle") : t("checkout.confirmedTitle")}
            </h1>
            <p>{pending ? t("checkout.sentText") : t("checkout.confirmedText")}</p>
            <p>{interpolate(t("checkout.emailSent"), { email: booking.contactEmail })}</p>
            {/^https?:\/\//.test(booking.manageUrl || "") ? (
              <div className="checkout-manage">
                <h2 className="checkout-section-title">{t("checkout.manageTitle")}</h2>
                <p className="checkout-muted">{t("checkout.manageText")}</p>
                <a href={booking.manageUrl} className="btn btn--primary" rel="noreferrer">
                  {t("checkout.manageLink")}
                </a>
              </div>
            ) : (
              <Link to="/profil" className="btn btn--primary">{t("checkout.viewMyBookings")}</Link>
            )}
          </section>
          {summary}
        </div>
      </main>
    );
  }

  const describedBy = (field, hint) =>
    [hint, errors[field] ? `checkout-${field}-error` : null].filter(Boolean).join(" ") || undefined;
  const fieldError = (field) =>
    errors[field] ? (
      <p id={`checkout-${field}-error`} className="checkout-field-error">
        {t(errors[field])}
      </p>
    ) : null;
  const inputProps = (field) => ({
    id: `checkout-${field}`,
    ref: (el) => {
      refs.current[field] = el;
    },
    value: form[field],
    onChange: setField(field),
    "aria-invalid": errors[field] ? true : undefined,
  });

  return (
    <main className="checkout-page">
      <Link to={listingPath} className="checkout-back">← {t("checkout.back")}</Link>
      <h1 className="checkout-title">{isRequest ? t("checkout.titleRequest") : t("checkout.title")}</h1>
      <p className="checkout-note">
        {!user ? t("checkout.guestRequestNote") : isRequest ? t("checkout.requestNote") : t("checkout.instantNote")}
      </p>
      <div className="checkout-layout">
        <form className="checkout-card checkout-form" onSubmit={handleSubmit} noValidate aria-labelledby="checkout-contact-title">
          <h2 id="checkout-contact-title" className="checkout-section-title">{t("checkout.contactTitle")}</h2>
          <p className="checkout-intro">{t("checkout.contactIntro")}</p>
          {user ? (
            <p className="checkout-muted">{t("checkout.prefilled")}</p>
          ) : (
            <div className="checkout-account">
              <p>{t("checkout.hasAccount")}</p>
              <button type="button" className="btn btn--secondary" onClick={() => openAuth?.("login")}>
                {t("checkout.login")}
              </button>
              <p className="checkout-muted">{t("checkout.noAccountNote")}</p>
            </div>
          )}

          {formError && (
            <p className="checkout-alert" role="alert">
              {formError}
            </p>
          )}

          <div className="checkout-field">
            <label htmlFor="checkout-name">{t("checkout.name")}</label>
            <input {...inputProps("name")} type="text" autoComplete="name" maxLength={NAME_MAX} required
              aria-describedby={describedBy("name")} />
            {fieldError("name")}
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-email">{t("checkout.email")}</label>
            <input {...inputProps("email")} type="email" autoComplete="email" maxLength={254} required
              aria-describedby={describedBy("email")} />
            {fieldError("email")}
          </div>
          <div className="checkout-row">
            <div className="checkout-field">
              <label htmlFor="checkout-phone">{t("checkout.phone")}</label>
              <input {...inputProps("phone")} type="tel" autoComplete="tel" inputMode="tel" maxLength={32}
                placeholder="+228 90 12 34 56" required aria-describedby={describedBy("phone", "checkout-phone-hint")} />
              <p id="checkout-phone-hint" className="checkout-hint">{t("checkout.phoneHint")}</p>
              {fieldError("phone")}
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-country">{t("checkout.country")}</label>
              <select {...inputProps("country")} autoComplete="country" required aria-describedby={describedBy("country")}>
                <option value="">{t("checkout.countryPlaceholder")}</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              {fieldError("country")}
            </div>
          </div>
          <div className="checkout-field checkout-field--short">
            <label htmlFor="checkout-arrivalTime">{t("checkout.arrivalTime")}</label>
            <input {...inputProps("arrivalTime")} type="time" aria-describedby={describedBy("arrivalTime")} />
            {fieldError("arrivalTime")}
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-message">{t("checkout.message")}</label>
            <textarea {...inputProps("message")} rows={4} maxLength={MESSAGE_MAX}
              placeholder={t("checkout.messagePlaceholder")}
              aria-describedby={describedBy("message", "checkout-message-count")} />
            <p id="checkout-message-count" className="checkout-hint checkout-count" aria-live="polite">
              {interpolate(t("checkout.messageCount"), { n: form.message.length })}
            </p>
            {fieldError("message")}
          </div>

          {/* Champ piège anti-robot : invisible et hors du parcours clavier, doit rester vide. */}
          <div className="checkout-hp" aria-hidden="true">
            <label htmlFor="checkout-website">{t("checkout.honeypot")}</label>
            <input id="checkout-website" name="website" type="text" tabIndex={-1} autoComplete="off"
              value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          <div className="checkout-terms">
            <input id="checkout-acceptTerms" type="checkbox" checked={form.acceptTerms}
              ref={(el) => {
                refs.current.acceptTerms = el;
              }}
              onChange={setField("acceptTerms")} aria-invalid={errors.acceptTerms ? true : undefined}
              aria-describedby={describedBy("acceptTerms", "checkout-terms-links")} required />
            <label htmlFor="checkout-acceptTerms">{t("checkout.terms")}</label>
          </div>
          <p id="checkout-terms-links" className="checkout-hint">
            <Link to="/cgu" target="_blank" rel="noopener">{t("checkout.cguLink")}</Link>
            {" · "}
            <Link to="/confidentialite" target="_blank" rel="noopener">{t("checkout.privacyLink")}</Link>
          </p>
          {fieldError("acceptTerms")}

          {isOwner ? (
            <p className="checkout-alert" role="alert">{t("checkout.errors.ownListing")}</p>
          ) : (
            <button type="submit" className="btn btn--primary checkout-submit" disabled={submitting}>
              {submitting ? t("checkout.submitting") : isRequest ? t("checkout.submitRequest") : t("checkout.submit")}
            </button>
          )}
        </form>
        {summary}
      </div>
    </main>
  );
};

export default Checkout;
