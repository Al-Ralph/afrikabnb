import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { AMENITIES } from "../../api/client";
import { interpolate } from "../../utils/plural";
import AmenityIcon from "../AmenityIcon";
import Modal from "../Modal";
import "./AmenitiesSection.css";

const PREVIEW = 6;

// Ordre stable : celui de l'énumération de l'API (codes inconnus en fin de liste).
const rank = (code) => {
  const i = AMENITIES.indexOf(code);
  return i === -1 ? AMENITIES.length : i;
};

const AmenityList = ({ codes, className = "" }) => {
  const { t } = useLanguage();
  return (
    <ul className={`amenity-list ${className}`.trim()}>
      {codes.map((code) => (
        <li key={code}>
          <AmenityIcon code={code} />
          <span>{t(`amenities.${code}`)}</span>
        </li>
      ))}
    </ul>
  );
};

const AmenitiesSection = ({ amenities = [] }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const codes = [...new Set(amenities)].sort((a, b) => rank(a) - rank(b));
  const title = t("listing.amenitiesTitle");

  return (
    <section className="property-details-section amenities-section" aria-labelledby="property-amenities-title">
      <h2 id="property-amenities-title" className="property-details-h2">
        {title}
      </h2>
      {codes.length === 0 ? (
        <p className="amenities-empty">{t("listing.noAmenities")}</p>
      ) : (
        <>
          <AmenityList codes={codes.slice(0, PREVIEW)} className="amenity-list--preview" />
          {codes.length > PREVIEW && (
            <button type="button" className="btn btn--secondary amenities-more" onClick={() => setOpen(true)}>
              {interpolate(t("listing.showAllAmenities"), { n: codes.length })}
            </button>
          )}
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={title} closeLabel={t("gallery.close")}>
        <AmenityList codes={codes} className="amenity-list--full" />
      </Modal>
    </section>
  );
};

export default AmenitiesSection;
