import React from "react";
import "./Skeleton.css";

// Bloc de squelette décoratif (masqué aux technologies d'assistance).
export const Skeleton = ({ className = "", style }) => (
  <span className={`skeleton ${className}`} style={style} aria-hidden="true" />
);

// Zone de chargement accessible : un seul role="status" + texte lu, la forme reste visuelle.
export const LoadingRegion = ({ label, className = "", children }) => (
  <div className={`loading-region ${className}`} role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    <div className="loading-region-shape" aria-hidden="true">
      {children}
    </div>
  </div>
);

const CardSkeleton = () => (
  <div className="skeleton-card">
    <Skeleton className="skeleton-card-media" />
    <Skeleton className="skeleton-line skeleton-line--lg" style={{ width: "72%" }} />
    <Skeleton className="skeleton-line" style={{ width: "52%" }} />
    <Skeleton className="skeleton-line" style={{ width: "38%" }} />
  </div>
);

export const ListingGridSkeleton = ({ label, count = 8, className = "" }) => (
  <LoadingRegion label={label} className={className}>
    <div className="skeleton-grid">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  </LoadingRegion>
);

// Liste de lignes (annonces de l'hôte, réservations, liste de la carte).
export const ListSkeleton = ({ label, rows = 3, media = true, className = "" }) => (
  <LoadingRegion label={label} className={className}>
    <div className="skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          {media && <Skeleton className="skeleton-row-media" />}
          <div className="skeleton-row-body">
            <Skeleton className="skeleton-line skeleton-line--lg" style={{ width: "64%" }} />
            <Skeleton className="skeleton-line" style={{ width: "44%" }} />
            <Skeleton className="skeleton-line" style={{ width: "30%" }} />
          </div>
        </div>
      ))}
    </div>
  </LoadingRegion>
);

export const PropertySkeleton = ({ label }) => (
  <LoadingRegion label={label} className="skeleton-property">
    <Skeleton className="skeleton-line" style={{ width: 160, height: 14 }} />
    <Skeleton className="skeleton-line skeleton-line--title" style={{ width: "min(560px, 80%)" }} />
    <Skeleton className="skeleton-line" style={{ width: "min(320px, 60%)" }} />
    <Skeleton className="skeleton-property-media" />
    <div className="skeleton-property-layout">
      <div className="skeleton-property-main">
        <div className="skeleton-property-facts">
          <Skeleton className="skeleton-chip" />
          <Skeleton className="skeleton-chip" />
          <Skeleton className="skeleton-chip" />
        </div>
        <Skeleton className="skeleton-line" style={{ width: "100%" }} />
        <Skeleton className="skeleton-line" style={{ width: "92%" }} />
        <Skeleton className="skeleton-line" style={{ width: "70%" }} />
      </div>
      <Skeleton className="skeleton-property-aside" />
    </div>
  </LoadingRegion>
);

export const ProfileSkeleton = ({ label }) => (
  <LoadingRegion label={label}>
    <div className="skeleton-profile">
      {[0, 1].map((card) => (
        <div key={card} className="skeleton-panel">
          <Skeleton className="skeleton-line skeleton-line--lg" style={{ width: "48%" }} />
          {[0, 1, 2].map((f) => (
            <div key={f} className="skeleton-field">
              <Skeleton className="skeleton-line" style={{ width: "30%" }} />
              <Skeleton className="skeleton-input" />
            </div>
          ))}
          <Skeleton className="skeleton-button" />
        </div>
      ))}
    </div>
  </LoadingRegion>
);

export default Skeleton;
