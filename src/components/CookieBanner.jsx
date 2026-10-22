import React from "react";
import { Link } from "react-router-dom";
import { useConsent } from "../context/ConsentContext";
import { useLanguage } from "../context/LanguageContext";
import "./CookieBanner.css";

const CookieBanner = () => {
  const { bannerOpen, acceptAll, refuseAll } = useConsent();
  const { t } = useLanguage();

  if (!bannerOpen) return null;

  return (
    <div
      className="cookie-banner"
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-desc"
    >
      <div className="cookie-banner-inner">
        <div className="cookie-banner-text">
          <h2 id="cookie-banner-title" className="cookie-banner-title">
            {t("cookies.bannerTitle")}
          </h2>
          <p id="cookie-banner-desc" className="cookie-banner-desc">
            {t("cookies.bannerDesc")}{" "}
            <Link to="/cookies" className="cookie-banner-link">
              {t("cookies.learnMore")}
            </Link>
          </p>
        </div>
        <div className="cookie-banner-actions">
          <button type="button" className="cookie-banner-btn cookie-banner-btn--refuse" onClick={refuseAll}>
            {t("cookies.refuseAll")}
          </button>
          <button type="button" className="cookie-banner-btn cookie-banner-btn--accept" onClick={acceptAll}>
            {t("cookies.acceptAll")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieBanner;
