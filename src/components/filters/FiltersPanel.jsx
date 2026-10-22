import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { AMENITIES } from "../../api/client";
import { useCurrency } from "../../context/CurrencyContext";
import { formatPrice } from "../../utils/format";
import AmenityIcon from "../AmenityIcon";
import Modal from "../Modal";
import "./FiltersPanel.css";

// Pas « rond » (1, 2 ou 5 × 10^k) donnant environ 100 crans sur la fourchette.
export function niceStep(span) {
  if (!(span > 0)) return 1;
  const raw = span / 100;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
}

const toField = (v) => (v == null ? "" : String(v));
const parseField = (str) => {
  if (str === "" || str == null) return null;
  const n = Number(str);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Panneau « Filtres » : fourchette de prix (curseurs + champs) et équipements.
// Monté à l'ouverture : le brouillon part des filtres appliqués, rien n'est appliqué avant « Afficher ».
// Les bornes restent dans la devise des annonces (XOF, celle de l'API) ; quand l'affichage est
// converti, l'équivalent indicatif de la fourchette est ajouté entre parenthèses.
const FiltersPanel = ({ applied, priceRange, currency = "XOF", onApply, onClose }) => {
  const { t, language } = useLanguage();
  const { formatAmount, isConverted } = useCurrency();
  const converted = isConverted(currency);
  const [minStr, setMinStr] = useState(toField(applied.minPrice));
  const [maxStr, setMaxStr] = useState(toField(applied.maxPrice));
  const [amenities, setAmenities] = useState(applied.amenities || []);

  const lo = priceRange?.min != null ? Math.floor(Number(priceRange.min)) : null;
  const hi = priceRange?.max != null ? Math.ceil(Number(priceRange.max)) : null;
  const hasSlider = lo != null && hi != null && hi > lo;
  const step = hasSlider ? niceStep(hi - lo) : 1;

  const minValue = parseField(minStr);
  const maxValue = parseField(maxStr);
  const priceInvalid = minValue != null && maxValue != null && minValue > maxValue;
  const sliderMin = hasSlider ? Math.min(Math.max(minValue ?? lo, lo), hi) : 0;
  const sliderMax = hasSlider ? Math.max(Math.min(maxValue ?? hi, hi), lo) : 0;
  const pct = (v) => (hasSlider ? ((v - lo) / (hi - lo)) * 100 : 0);

  const toggleAmenity = (code) =>
    setAmenities((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const clearAll = () => {
    setMinStr("");
    setMaxStr("");
    setAmenities([]);
  };

  const apply = () => {
    if (priceInvalid) return;
    // Une borne égale à l'extrémité de la fourchette n'est pas un filtre.
    const minPrice = minValue != null && !(hasSlider && minValue <= lo) ? minValue : null;
    const maxPrice = maxValue != null && !(hasSlider && maxValue >= hi) ? maxValue : null;
    const ordered = AMENITIES.filter((code) => amenities.includes(code));
    onApply({ minPrice, maxPrice, amenities: ordered });
  };

  const footer = (
    <>
      <button type="button" className="filters-clear" onClick={clearAll}>
        {t("filters.clearAll")}
      </button>
      <button type="button" className="btn btn--primary" onClick={apply} disabled={priceInvalid}>
        {t("filters.apply")}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={t("filters.title")}
      closeLabel={t("filters.close")}
      footer={footer}
      className="filters-modal"
    >
      <section className="filters-section" aria-labelledby="filters-price-title">
        <h3 id="filters-price-title" className="filters-h3">
          {t("filters.price")}
        </h3>
        <p className="filters-hint">
          {t("filters.priceHint")}
          {hasSlider && ` · ${formatPrice(lo, currency, language)} – ${formatPrice(hi, currency, language)}`}
          {hasSlider && converted && ` (${formatAmount(lo, currency)} – ${formatAmount(hi, currency)})`}
        </p>
        {hasSlider && (
          <div
            className="filters-range"
            style={{ "--from": `${pct(sliderMin)}%`, "--to": `${pct(sliderMax)}%` }}
          >
            <span className="filters-range-track" aria-hidden="true" />
            <input
              type="range"
              min={lo}
              max={hi}
              step={step}
              value={sliderMin}
              aria-label={t("filters.minSlider")}
              aria-valuetext={formatPrice(sliderMin, currency, language)}
              onChange={(e) => {
                const v = Math.min(Number(e.target.value), sliderMax);
                setMinStr(v <= lo ? "" : String(v));
              }}
            />
            <input
              type="range"
              min={lo}
              max={hi}
              step={step}
              value={sliderMax}
              aria-label={t("filters.maxSlider")}
              aria-valuetext={formatPrice(sliderMax, currency, language)}
              onChange={(e) => {
                const v = Math.max(Number(e.target.value), sliderMin);
                setMaxStr(v >= hi ? "" : String(v));
              }}
            />
          </div>
        )}
        <div className="filters-price-fields">
          <label className="filters-field">
            <span>{t("filters.min")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step="any"
              value={minStr}
              placeholder={lo != null ? String(lo) : ""}
              onChange={(e) => setMinStr(e.target.value)}
              aria-invalid={priceInvalid || undefined}
              aria-describedby={priceInvalid ? "filters-price-error" : undefined}
            />
          </label>
          <span className="filters-price-dash" aria-hidden="true" />
          <label className="filters-field">
            <span>{t("filters.max")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step="any"
              value={maxStr}
              placeholder={hi != null ? String(hi) : ""}
              onChange={(e) => setMaxStr(e.target.value)}
              aria-invalid={priceInvalid || undefined}
              aria-describedby={priceInvalid ? "filters-price-error" : undefined}
            />
          </label>
        </div>
        {converted && <p className="filters-hint filters-unit">{t("currency.filterUnit")}</p>}
        {priceInvalid && (
          <p id="filters-price-error" className="filters-error" role="alert">
            {t("filters.priceError")}
          </p>
        )}
      </section>

      <fieldset className="filters-section filters-amenities">
        <legend className="filters-h3">{t("filters.amenities")}</legend>
        <ul className="filters-amenity-grid">
          {AMENITIES.map((code) => (
            <li key={code}>
              <label className="filters-amenity">
                <input
                  type="checkbox"
                  checked={amenities.includes(code)}
                  onChange={() => toggleAmenity(code)}
                />
                <AmenityIcon code={code} size={22} />
                <span>{t(`amenities.${code}`)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </Modal>
  );
};

export default FiltersPanel;
