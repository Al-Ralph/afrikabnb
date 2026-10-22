import React, { useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../../context/LanguageContext";
import { useDialog } from "../../hooks/useDialog";
import { interpolate } from "../../utils/plural";
import { srcSetFor } from "../../utils/images";
import Icon from "../Icons";
import "./PhotoGallery.css";

// Mobile : carrousel à glisser ; au-delà : grille 1 grande + 4 petites.
const NARROW_QUERY = "(max-width: 743px)";
const subscribeNarrow = (callback) => {
  const mql = window.matchMedia?.(NARROW_QUERY);
  if (!mql) return () => {};
  mql.addEventListener?.("change", callback);
  return () => mql.removeEventListener?.("change", callback);
};
const isNarrow = () => Boolean(window.matchMedia?.(NARROW_QUERY).matches);
const useIsNarrow = () => useSyncExternalStore(subscribeNarrow, isNarrow, () => false);

const SWIPE_MIN = 40;

// Visionneuse plein écran : focus piégé, Échap, flèches du clavier, glissement tactile, compteur.
const PhotoViewer = ({ images, index, title, onIndexChange, onClose }) => {
  const { t } = useLanguage();
  const total = images.length;
  const touchX = useRef(null);
  const go = (delta) => onIndexChange((index + delta + total) % total);
  const ref = useDialog(true, onClose, {
    onKeyDown: (e) => {
      if (total < 2) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    },
  });
  const image = images[index];
  const alt = image.alt || interpolate(t("gallery.photoAlt"), { title, n: index + 1 });

  return createPortal(
    <div
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={interpolate(t("gallery.viewer"), { title })}
      ref={ref}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchX.current == null || total < 2) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) >= SWIPE_MIN) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="photo-viewer-bar">
        <button type="button" className="photo-viewer-close" onClick={onClose} aria-label={t("gallery.close")}>
          <Icon name="close" size={20} />
          <span>{t("gallery.close")}</span>
        </button>
        <p className="photo-viewer-counter" aria-live="polite">
          {interpolate(t("gallery.counter"), { n: index + 1, total })}
        </p>
      </div>
      <div className="photo-viewer-stage">
        {total > 1 && (
          <button
            type="button"
            className="photo-viewer-nav photo-viewer-nav--prev"
            onClick={() => go(-1)}
            aria-label={t("gallery.prev")}
          >
            <Icon name="chevronLeft" size={22} />
          </button>
        )}
        <figure className="photo-viewer-figure">
          <img
            key={image.url}
            src={image.url}
            srcSet={srcSetFor(image.url)}
            sizes="100vw"
            alt={alt}
            className="photo-viewer-img"
            decoding="async"
          />
        </figure>
        {total > 1 && (
          <button
            type="button"
            className="photo-viewer-nav photo-viewer-nav--next"
            onClick={() => go(1)}
            aria-label={t("gallery.next")}
          >
            <Icon name="chevronRight" size={22} />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};

// Galerie de la fiche logement. `images` : [{ id, url, alt, position }] déjà triées.
const PhotoGallery = ({ images, title }) => {
  const { t } = useLanguage();
  const narrow = useIsNarrow();
  const [viewerIndex, setViewerIndex] = useState(null);
  const [slide, setSlide] = useState(0);
  const trackRef = useRef(null);
  const total = images.length;

  if (total === 0) {
    return (
      <div className="photo-gallery photo-gallery--empty">
        <span className="photo-gallery-empty" />
      </div>
    );
  }

  const altFor = (img, i) => img.alt || interpolate(t("gallery.photoAlt"), { title, n: i + 1 });
  const openLabel = (i) => interpolate(t("gallery.open"), { n: i + 1, total });

  const viewer =
    viewerIndex != null ? (
      <PhotoViewer
        images={images}
        index={viewerIndex}
        title={title}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    ) : null;

  if (narrow) {
    const goTo = (i) => {
      const next = Math.max(0, Math.min(total - 1, i));
      setSlide(next);
      const track = trackRef.current;
      track?.scrollTo?.({ left: next * track.clientWidth, behavior: "smooth" });
    };
    return (
      <div className="photo-gallery photo-carousel" role="region" aria-roledescription="carousel" aria-label={t("gallery.carousel")}>
        <div
          className="photo-carousel-track"
          ref={trackRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.clientWidth > 0) setSlide(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {images.map((img, i) => (
            <button
              type="button"
              key={img.id ?? img.url}
              className="photo-carousel-slide"
              onClick={() => setViewerIndex(i)}
              aria-label={openLabel(i)}
            >
              <img
                src={img.url}
                srcSet={srcSetFor(img.url)}
                sizes="100vw"
                alt={altFor(img, i)}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : undefined}
                decoding="async"
              />
            </button>
          ))}
        </div>
        {total > 1 && (
          <>
            {slide > 0 && (
              <button
                type="button"
                className="photo-carousel-nav photo-carousel-nav--prev"
                onClick={() => goTo(slide - 1)}
                aria-label={t("gallery.prev")}
              >
                <Icon name="chevronLeft" size={18} />
              </button>
            )}
            {slide < total - 1 && (
              <button
                type="button"
                className="photo-carousel-nav photo-carousel-nav--next"
                onClick={() => goTo(slide + 1)}
                aria-label={t("gallery.next")}
              >
                <Icon name="chevronRight" size={18} />
              </button>
            )}
            <p className="photo-carousel-counter" aria-live="polite">
              {interpolate(t("gallery.counter"), { n: slide + 1, total })}
            </p>
          </>
        )}
        {viewer}
      </div>
    );
  }

  const tiles = images.slice(0, 5);
  return (
    <div className="photo-gallery photo-grid" data-count={tiles.length}>
      {tiles.map((img, i) => (
        <button
          type="button"
          key={img.id ?? img.url}
          className={`photo-grid-tile${i === 0 ? " photo-grid-tile--main" : ""}`}
          onClick={() => setViewerIndex(i)}
          aria-label={openLabel(i)}
        >
          <img
            src={img.url}
            srcSet={srcSetFor(img.url)}
            sizes={i === 0 ? "(min-width: 1180px) 580px, 50vw" : "(min-width: 1180px) 290px, 25vw"}
            alt={altFor(img, i)}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : undefined}
            decoding="async"
          />
        </button>
      ))}
      {total > 1 && (
        <button type="button" className="btn btn--secondary photo-grid-all" onClick={() => setViewerIndex(0)}>
          <Icon name="grid" size={16} />
          <span>{t("gallery.showAll")}</span>
        </button>
      )}
      {viewer}
    </div>
  );
};

export default PhotoGallery;
