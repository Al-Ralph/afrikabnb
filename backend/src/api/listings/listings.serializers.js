export const hostSelect = { select: { id: true, name: true, avatar: true } };

// Photos de l'annonce, dans l'ordre d'affichage (position 0 = couverture = imageUrl).
export const imagesInclude = {
  select: { id: true, url: true, alt: true, position: true },
  orderBy: [{ position: "asc" }, { createdAt: "asc" }],
};

// Include commun des annonces renvoyées par l'API (hôte public + photos).
export const listingBaseInclude = { host: hostSelect, images: imagesInclude };

// Decimal -> number ; `favorites` (filtré sur l'utilisateur courant) -> isFavorite ;
// `_count.bookings` -> upcomingBookings.
export function listingToJson(listing) {
  if (!listing) return null;
  const { pricePerNight, rating, favorites, _count, ...rest } = listing;
  const out = {
    ...rest,
    pricePerNight: pricePerNight != null ? Number(pricePerNight) : null,
    rating: rating != null ? Number(rating) : null,
  };
  if (favorites) out.isFavorite = favorites.length > 0;
  if (_count?.bookings !== undefined) out.upcomingBookings = _count.bookings;
  return out;
}
