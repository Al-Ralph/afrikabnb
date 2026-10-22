import React from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import "./Hero.css";

// Bandeau d'accueil statique (remplace l'ancienne scène 3D) : fond en dégradé, aucun asset externe.
const Hero = () => {
  const { t } = useLanguage();

  const scrollToListings = () => {
    const el = document.getElementById("listings-anchor");
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__content">
        <p className="hero__brand">AfrikaBnB</p>
        <h1 className="hero__title" id="hero-title">
          {t("home.cinematicTitle")}
        </h1>
        <p className="hero__lead">{t("home.cinematicLead")}</p>
        <div className="hero__actions">
          <button type="button" className="hero__cta" onClick={scrollToListings}>
            {t("home.cinematicCta")}
          </button>
          <Link className="hero__cta hero__cta--ghost" to="/carte">
            {t("header.map")}
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Hero;
