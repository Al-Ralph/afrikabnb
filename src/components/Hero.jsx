import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { interpolate } from "../utils/plural";
import "./Hero.css";

// Photo : « Lomé view », Edouard TAMBA — licence Unsplash (voir DESIGN.md).
const HERO_PHOTO = {
  small: "/images/hero-lome-800.webp",
  large: "/images/hero-lome-1600.webp",
  author: "Edouard TAMBA",
  source: "https://unsplash.com/photos/QpPBoQw9O3U",
};

// Accueil : vue aérienne de Lomé plein cadre et titre. La recherche (rendue par Home) chevauche le bas de la photo.
const Hero = () => {
  const { t } = useLanguage();
  const [photoFailed, setPhotoFailed] = useState(false);

  const scrollToListings = () => {
    const el = document.getElementById("listings-anchor");
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className={`hero__stage${photoFailed ? " hero__stage--no-photo" : ""}`}>
        {!photoFailed && (
          <img
            className="hero__photo"
            src={HERO_PHOTO.large}
            srcSet={`${HERO_PHOTO.small} 800w, ${HERO_PHOTO.large} 1600w`}
            sizes="100vw"
            width="1600"
            height="914"
            alt={t("ui.hero.photoAlt")}
            fetchPriority="high"
            decoding="async"
            onError={() => setPhotoFailed(true)}
          />
        )}
        <div className="hero__scrim" aria-hidden="true" />
        <div className="hero__content">
          <h1 className="hero__title" id="hero-title">
            {t("home.cinematicTitle")}
          </h1>
          <p className="hero__lead">{t("home.cinematicLead")}</p>
          <div className="hero__actions">
            <button type="button" className="btn btn--primary hero__cta" onClick={scrollToListings}>
              {t("home.cinematicCta")}
            </button>
            <Link className="btn hero__cta hero__cta--ghost" to="/carte">
              {t("header.map")}
            </Link>
          </div>
        </div>
        {!photoFailed && (
          <p className="hero__credit">
            <span>{t("ui.hero.place")}</span>
            <span aria-hidden="true"> · </span>
            <a href={HERO_PHOTO.source} target="_blank" rel="noopener noreferrer">
              {interpolate(t("ui.hero.photoBy"), { name: HERO_PHOTO.author })}
            </a>
          </p>
        )}
      </div>
    </section>
  );
};

export default Hero;
