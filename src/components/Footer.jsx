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
          <div className="footer-col">
            <h3 className="footer-title">AfrikaBnB</h3>
            <p className="footer-desc">{t("footer.description")}</p>
            <p className="footer-demo-note">{t("footer.demoNote")}</p>
          </div>
          <div className="footer-col">
            <h3 className="footer-title">{t("footer.explore")}</h3>
            <ul className="footer-links">
              <li><Link to="/">{t("footer.home")}</Link></li>
              <li><Link to="/host">{t("footer.listProperty")}</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h3 className="footer-title">{t("footer.legal")}</h3>
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
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-copyright">{t("footer.copyright")}</p>
          <nav className="footer-legal" aria-label={t("footer.legal")}>
            <Link to="/mentions-legales">{t("footer.mentions")}</Link>
            <span className="footer-dot">·</span>
            <Link to="/confidentialite">{t("footer.privacy")}</Link>
            <span className="footer-dot">·</span>
            <Link to="/cookies">{t("footer.cookies")}</Link>
            <span className="footer-dot">·</span>
            <Link to="/cgu">{t("footer.terms")}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
