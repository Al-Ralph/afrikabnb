import React from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useConsent } from "../context/ConsentContext";
import "./Footer.css";

const Footer = () => {
  const { t } = useLanguage();
  const { openCookieManager } = useConsent();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-col footer-brand">
            <p className="footer-wordmark">AfrikaBnB</p>
            <p className="footer-desc">{t("footer.description")}</p>
            <p className="footer-demo-note">{t("footer.demoNote")}</p>
          </div>
          <nav className="footer-col" aria-labelledby="footer-explore-title">
            <h2 className="footer-title" id="footer-explore-title">
              {t("footer.explore")}
            </h2>
            <ul className="footer-links">
              <li><Link to="/">{t("footer.home")}</Link></li>
              <li><Link to="/carte">{t("header.map")}</Link></li>
              <li><Link to="/host">{t("footer.listProperty")}</Link></li>
            </ul>
          </nav>
          <nav className="footer-col" aria-labelledby="footer-legal-title">
            <h2 className="footer-title" id="footer-legal-title">
              {t("footer.legal")}
            </h2>
            <ul className="footer-links">
              <li><Link to="/mentions-legales">{t("footer.mentions")}</Link></li>
              <li><Link to="/confidentialite">{t("footer.privacy")}</Link></li>
              <li><Link to="/cookies">{t("footer.cookies")}</Link></li>
              <li><Link to="/cgu">{t("footer.terms")}</Link></li>
              <li>
                <button type="button" className="footer-link-btn" onClick={openCookieManager}>
                  {t("footer.manageCookies")}
                </button>
              </li>
            </ul>
          </nav>
        </div>
        <div className="footer-bottom">
          <p className="footer-copyright">{t("footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
