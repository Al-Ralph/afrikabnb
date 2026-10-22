import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { useGoogleMapsScript } from "../../hooks/useGoogleMapsScript";
import { api } from "../../api/client";
import { categories } from "../../data/listings";
import "./ListingForm.css";

export const CURRENCIES = ["XOF", "XAF", "EUR", "USD", "NGN", "GHS", "KES", "MAD", "ZAR", "EGP", "TZS"];
const MAX_TEXT = 191; // VARCHAR(191) côté base
const MAX_PRICE = 99999999.99; // DECIMAL(10, 2)

const toFormState = (l) => ({
  title: l?.title || "",
  description: l?.description || "",
  location: l?.location || "",
  address: l?.address || "",
  latitude: l?.latitude != null ? String(l.latitude) : "",
  longitude: l?.longitude != null ? String(l.longitude) : "",
  pricePerNight: l?.price != null ? String(l.price) : "",
  currency: l?.currency || "XOF",
  maxGuests: String(l?.maxGuests ?? 2),
  bedrooms: String(l?.bedrooms ?? 1),
  categoryId: l?.categoryId || "",
  acceptsPets: Boolean(l?.acceptsPets),
  imageUrl: l?.imageUrl || l?.image || "",
});

// "12,5" ou "12.5" -> 12.5 ; "" -> null ; texte non numérique -> NaN.
const parseDecimal = (value) => {
  const s = String(value ?? "").trim().replace(",", ".");
  if (s === "") return null;
  return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};

const parseInteger = (value) => {
  const s = String(value ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : NaN;
};

export const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

// Validation alignée sur le schéma zod du backend. Renvoie { errors, payload } ;
// `errors` associe un champ à une clé de traduction host.errors.*.
export function validateListing(form) {
  const errors = {};
  const text = (field, required) => {
    const v = form[field].trim();
    if (required && !v) errors[field] = "required";
    else if (v.length > MAX_TEXT) errors[field] = "tooLong";
    return v || null;
  };
  const title = text("title", true);
  const location = text("location", true);
  const description = text("description", false);
  const address = text("address", false);

  const latitude = parseDecimal(form.latitude);
  const longitude = parseDecimal(form.longitude);
  if (Number.isNaN(latitude)) errors.latitude = "invalidNumber";
  else if (latitude != null && (latitude < -90 || latitude > 90)) errors.latitude = "latRange";
  if (Number.isNaN(longitude)) errors.longitude = "invalidNumber";
  else if (longitude != null && (longitude < -180 || longitude > 180)) errors.longitude = "lngRange";
  if (!errors.latitude && !errors.longitude && (latitude == null) !== (longitude == null)) {
    errors[latitude == null ? "latitude" : "longitude"] = "coordsPair";
  }

  const price = parseDecimal(form.pricePerNight);
  if (price == null) errors.pricePerNight = "required";
  else if (Number.isNaN(price)) errors.pricePerNight = "invalidNumber";
  else if (price <= 0) errors.pricePerNight = "pricePositive";
  else if (price > MAX_PRICE) errors.pricePerNight = "priceMax";

  const currency = String(form.currency || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = "invalidCurrency";

  const maxGuests = parseInteger(form.maxGuests);
  if (!(maxGuests >= 1 && maxGuests <= 50)) errors.maxGuests = "guestsRange";
  const bedrooms = parseInteger(form.bedrooms);
  if (!(bedrooms >= 0 && bedrooms <= 50)) errors.bedrooms = "bedroomsRange";

  const imageUrl = form.imageUrl.trim();
  if (imageUrl && !isHttpsUrl(imageUrl)) errors.imageUrl = "httpsRequired";
  else if (imageUrl.length > MAX_TEXT) errors.imageUrl = "tooLong";

  const payload = {
    title,
    description,
    location,
    address,
    latitude,
    longitude,
    pricePerNight: price,
    currency,
    maxGuests,
    bedrooms,
    categoryId: form.categoryId || null,
    acceptsPets: Boolean(form.acceptsPets),
    imageUrl: imageUrl || null,
  };
  return { errors, payload };
}

const FIELD_ORDER = [
  "title", "description", "location", "address", "latitude", "longitude",
  "pricePerNight", "currency", "maxGuests", "bedrooms", "categoryId", "acceptsPets", "imageUrl",
];

const roundCoord = (n) => String(Math.round(n * 1e6) / 1e6);

// Formulaire de création / modification d'annonce.
const ListingForm = ({ listing, onSaved, onCancel }) => {
  const { t } = useLanguage();
  const { loaded: placesLoaded } = useGoogleMapsScript();
  const [form, setForm] = useState(() => toFormState(listing));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [geoStatus, setGeoStatus] = useState(null);
  const [imageBroken, setImageBroken] = useState(false);
  const formRef = useRef(null);
  const addressRef = useRef(null);
  const isEdit = Boolean(listing?.id);

  const setField = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  };

  // Autocomplétion Google Places (uniquement si le script est chargé, donc avec consentement) :
  // remplit l'adresse et les coordonnées.
  useEffect(() => {
    if (!placesLoaded || !addressRef.current || !window.google?.maps?.places) return undefined;
    const g = window.google.maps;
    const existing = new Set(document.querySelectorAll(".pac-container"));
    const autocomplete = new g.places.Autocomplete(addressRef.current, {
      fields: ["formatted_address", "geometry", "address_components"],
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const loc = place?.geometry?.location;
      setForm((f) => {
        const city = place?.address_components?.find((c) => c.types?.includes("locality"))?.long_name;
        return {
          ...f,
          address: place?.formatted_address || f.address,
          latitude: loc ? roundCoord(loc.lat()) : f.latitude,
          longitude: loc ? roundCoord(loc.lng()) : f.longitude,
          location: f.location || city || f.location,
        };
      });
      setErrors((e) => ({ ...e, address: undefined, latitude: undefined, longitude: undefined }));
    });
    return () => {
      g.event.clearInstanceListeners(autocomplete);
      document.querySelectorAll(".pac-container").forEach((el) => {
        if (!existing.has(el)) el.remove();
      });
    };
  }, [placesLoaded]);

  // Géocodage via l'API AfrikaBnB (aucun appel Google depuis le navigateur).
  const geocode = async () => {
    const query = form.address.trim() || form.location.trim();
    if (!query) {
      setGeoStatus("geoNeedAddress");
      return;
    }
    setGeoStatus("geoLoading");
    try {
      const [first] = await api.geocode(query, 1);
      if (!first) {
        setGeoStatus("geoNotFound");
        return;
      }
      setField("latitude", roundCoord(first.latitude));
      setField("longitude", roundCoord(first.longitude));
      setGeoStatus("geoFound");
    } catch {
      setGeoStatus("geoError");
    }
  };

  const focusFirstError = (errs) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) formRef.current?.querySelector(`[name="${first}"]`)?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const { errors: clientErrors, payload } = validateListing(form);
    const translated = Object.fromEntries(
      Object.entries(clientErrors).map(([field, key]) => [field, t(`host.errors.${key}`)])
    );
    setErrors(translated);
    if (Object.keys(translated).length > 0) {
      focusFirstError(translated);
      return;
    }
    setSubmitting(true);
    try {
      const saved = isEdit ? await api.updateListing(listing.id, payload) : await api.createListing(payload);
      onSaved(saved, isEdit);
    } catch (err) {
      if (err?.status === 400 && Array.isArray(err.details) && err.details.length > 0) {
        const serverErrors = {};
        const others = [];
        err.details.forEach(({ path, message }) => {
          const field = String(path || "").split(".")[0];
          if (FIELD_ORDER.includes(field)) serverErrors[field] = message;
          else others.push(message);
        });
        setErrors(serverErrors);
        setFormError(others.length ? others.join(" ") : t("host.errors.fixFields"));
        focusFirstError(serverErrors);
      } else if (err?.status === 401) {
        setFormError(t("host.loginRequired"));
      } else {
        setFormError(err?.message || t("host.errors.generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldProps = (name) => ({
    id: `listing-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `listing-${name}-error` : undefined,
  });

  const fieldError = (name) =>
    errors[name] ? (
      <span id={`listing-${name}-error`} className="listing-form-error">
        {errors[name]}
      </span>
    ) : null;

  const imagePreview = isHttpsUrl(form.imageUrl.trim()) && !imageBroken;

  return (
    <form ref={formRef} className="listing-form" onSubmit={handleSubmit} noValidate aria-labelledby="listing-form-title">
      <h2 id="listing-form-title" className="listing-form-title">
        {isEdit ? t("host.editTitle") : t("host.createTitle")}
      </h2>

      <div className="listing-form-grid">
        <div className="listing-form-field listing-form-field--wide">
          <label htmlFor="listing-title">{t("host.fields.title")} *</label>
          <input type="text" value={form.title} onChange={(e) => setField("title", e.target.value)} maxLength={MAX_TEXT} {...fieldProps("title")} />
          {fieldError("title")}
        </div>

        <div className="listing-form-field listing-form-field--wide">
          <label htmlFor="listing-description">{t("host.fields.description")}</label>
          <textarea rows={3} value={form.description} onChange={(e) => setField("description", e.target.value)} maxLength={MAX_TEXT} {...fieldProps("description")} />
          {fieldError("description")}
        </div>

        <div className="listing-form-field">
          <label htmlFor="listing-location">{t("host.fields.location")} *</label>
          <input type="text" value={form.location} onChange={(e) => setField("location", e.target.value)} placeholder="Lomé, Togo" {...fieldProps("location")} />
          {fieldError("location")}
        </div>

        <div className="listing-form-field">
          <label htmlFor="listing-address">{t("host.fields.address")}</label>
          <input
            ref={addressRef}
            type="text"
            value={form.address}
            onChange={(e) => setField("address", e.target.value)}
            autoComplete={placesLoaded ? "off" : "street-address"}
            {...fieldProps("address")}
          />
          {fieldError("address")}
          <span className="listing-form-hint">{placesLoaded ? t("host.placesHint") : t("host.manualCoordsHint")}</span>
        </div>

        <div className="listing-form-field">
          <label htmlFor="listing-latitude">{t("host.fields.latitude")}</label>
          <input type="text" inputMode="decimal" value={form.latitude} onChange={(e) => setField("latitude", e.target.value)} placeholder="6.1319" {...fieldProps("latitude")} />
          {fieldError("latitude")}
        </div>

        <div className="listing-form-field">
          <label htmlFor="listing-longitude">{t("host.fields.longitude")}</label>
          <input type="text" inputMode="decimal" value={form.longitude} onChange={(e) => setField("longitude", e.target.value)} placeholder="1.2228" {...fieldProps("longitude")} />
          {fieldError("longitude")}
        </div>

        <div className="listing-form-field listing-form-field--wide listing-form-geo">
          <button type="button" className="host-btn" onClick={geocode} disabled={geoStatus === "geoLoading"}>
            {t("host.geocode")}
          </button>
          {geoStatus && (
            <span className="listing-form-hint" role="status">
              {t(`host.${geoStatus}`)}
            </span>
          )}
        </div>

        <div className="listing-form-field">
          <label htmlFor="listing-pricePerNight">{t("host.fields.price")} *</label>
          <input type="text" inputMode="decimal" value={form.pricePerNight} onChange={(e) => setField("pricePerNight", e.target.value)} {...fieldProps("pricePerNight")} />
          {fieldError("pricePerNight")}
        </div>

        <div className="listing-form-field">
          <label htmlFor="listing-currency">{t("host.fields.currency")}</label>
          <select value={form.currency} onChange={(e) => setField("currency", e.target.value)} {...fieldProps("currency")}>
            {(CURRENCIES.includes(form.currency) ? CURRENCIES : [form.currency, ...CURRENCIES]).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {fieldError("currency")}
        </div>

        <div className="listing-form-field">
          <label htmlFor="listing-maxGuests">{t("host.fields.maxGuests")}</label>
          <input type="number" min={1} max={50} step={1} value={form.maxGuests} onChange={(e) => setField("maxGuests", e.target.value)} {...fieldProps("maxGuests")} />
          {fieldError("maxGuests")}
        </div>

        <div className="listing-form-field">
          <label htmlFor="listing-bedrooms">{t("host.fields.bedrooms")}</label>
          <input type="number" min={0} max={50} step={1} value={form.bedrooms} onChange={(e) => setField("bedrooms", e.target.value)} {...fieldProps("bedrooms")} />
          {fieldError("bedrooms")}
        </div>

        <div className="listing-form-field">
          <label htmlFor="listing-categoryId">{t("host.fields.category")}</label>
          <select value={form.categoryId} onChange={(e) => setField("categoryId", e.target.value)} {...fieldProps("categoryId")}>
            <option value="">{t("host.noCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {t(`categories.${c.id}`)}
              </option>
            ))}
          </select>
          {fieldError("categoryId")}
        </div>

        <label className="listing-form-field listing-form-check" htmlFor="listing-acceptsPets">
          <input type="checkbox" checked={form.acceptsPets} onChange={(e) => setField("acceptsPets", e.target.checked)} {...fieldProps("acceptsPets")} />
          <span>{t("host.fields.acceptsPets")}</span>
          {fieldError("acceptsPets")}
        </label>

        <div className="listing-form-field listing-form-field--wide">
          <label htmlFor="listing-imageUrl">{t("host.fields.imageUrl")}</label>
          <input
            type="url"
            value={form.imageUrl}
            onChange={(e) => {
              setImageBroken(false);
              setField("imageUrl", e.target.value);
            }}
            placeholder="https://"
            {...fieldProps("imageUrl")}
          />
          {fieldError("imageUrl")}
        </div>
        {imagePreview && (
          <div className="listing-form-preview listing-form-field--wide">
            <img src={form.imageUrl.trim()} alt={t("host.imagePreview")} onError={() => setImageBroken(true)} />
          </div>
        )}
      </div>

      {formError && (
        <p className="listing-form-alert" role="alert">
          {formError}
        </p>
      )}

      <div className="listing-form-actions">
        <button type="button" className="host-btn" onClick={onCancel} disabled={submitting}>
          {t("host.cancel")}
        </button>
        <button type="submit" className="host-btn host-btn--primary" disabled={submitting}>
          {submitting ? t("host.saving") : isEdit ? t("host.save") : t("host.publish")}
        </button>
      </div>
    </form>
  );
};

export default ListingForm;
