// Photos d'annonce : tri par position, repli sur l'image de couverture, srcset quand le CDN
// sait redimensionner (Unsplash via le paramètre w ; les fichiers téléversés font déjà 1600 px max).

export function sortedImages(listing) {
  const list = Array.isArray(listing?.images) ? listing.images.filter((img) => img?.url) : [];
  if (list.length) return [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const cover = listing?.image || listing?.imageUrl;
  return cover ? [{ id: null, url: cover, alt: listing?.title ?? null, position: 0 }] : [];
}

const WIDTHS = [480, 800, 1200, 1600];

export function srcSetFor(url) {
  if (typeof url !== "string" || !url.startsWith("https://images.unsplash.com/")) return undefined;
  try {
    const u = new URL(url);
    return WIDTHS.map((w) => {
      u.searchParams.set("w", String(w));
      return `${u.toString()} ${w}w`;
    }).join(", ");
  } catch {
    return undefined;
  }
}
