import React from "react";
import { useLanguage } from "../../context/LanguageContext";
import { AMENITIES } from "../../api/client";
import AmenityIcon from "../AmenityIcon";

// Groupes d'équipements affichés dans le formulaire (tous les codes AMENITIES de l'API).
export const AMENITY_GROUPS = [
  { id: "comfort", codes: ["WIFI", "AIR_CONDITIONING", "FAN", "TV", "WORKSPACE", "KITCHEN", "WASHER", "WATER_HEATER"] },
  { id: "energy", codes: ["GENERATOR", "SOLAR_POWER", "WATER_TANK"] },
  { id: "safety", codes: ["SECURITY", "CCTV", "MOSQUITO_NETS"] },
  { id: "outdoor", codes: ["POOL", "GARDEN", "TERRACE", "BBQ", "SEA_VIEW", "BEACH_ACCESS", "PARKING"] },
  { id: "services", codes: ["BREAKFAST", "HOUSEKEEPING", "AIRPORT_SHUTTLE"] },
];

// Codes ajoutés côté API mais pas encore classés : groupe « Autres ».
const grouped = new Set(AMENITY_GROUPS.flatMap((g) => g.codes));
const others = AMENITIES.filter((code) => !grouped.has(code));
const GROUPS = others.length ? [...AMENITY_GROUPS, { id: "other", codes: others }] : AMENITY_GROUPS;

// Cases à cocher groupées ; `value` est la liste des codes sélectionnés.
const AmenitiesField = ({ value, onChange }) => {
  const { t } = useLanguage();
  const selected = new Set(value);

  const toggle = (code) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    // Ordre stable (celui de l'API) pour le payload.
    onChange(AMENITIES.filter((c) => next.has(c)));
  };

  return (
    <fieldset className="amenities-field">
      <legend className="amenities-legend">{t("host.amenities.title")}</legend>
      <p className="listing-form-hint">{t("host.amenities.hint")}</p>
      {GROUPS.map((group) => (
        <fieldset key={group.id} className="amenities-group">
          <legend className="amenities-group-title">{t(`host.amenities.groups.${group.id}`)}</legend>
          <div className="amenities-options">
            {group.codes.map((code) => (
              <label key={code} className={`amenity-option${selected.has(code) ? " amenity-option--checked" : ""}`}>
                <input
                  type="checkbox"
                  name="amenities"
                  value={code}
                  checked={selected.has(code)}
                  onChange={() => toggle(code)}
                />
                <AmenityIcon code={code} size={22} />
                <span>{t(`amenities.${code}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </fieldset>
  );
};

export default AmenitiesField;
