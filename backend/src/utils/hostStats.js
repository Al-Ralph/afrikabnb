// Statistiques du tableau de bord hôte (logique pure, sans base de données).
import { addDays, formatDay, nightsBetween } from "./booking.js";

const toDay = (d) => (d instanceof Date ? formatDay(d) : d);
const round2 = (n) => Math.round(n * 100) / 100;

// Nuits d'un séjour [checkIn, checkOut[ comprises dans la fenêtre [from, to[.
export function nightsInWindow(checkIn, checkOut, from, to) {
  const start = toDay(checkIn) > from ? toDay(checkIn) : from;
  const end = toDay(checkOut) < to ? toDay(checkOut) : to;
  return Math.max(0, nightsBetween(start, end));
}

// Taux d'occupation (0–1, 4 décimales) de séjours sur [from, to[. Les séjours d'une même annonce
// ne se chevauchent pas (contrôle à la réservation) ; le taux est néanmoins plafonné à 1.
export function occupancyRate(stays, from, to) {
  const days = nightsBetween(from, to);
  if (days <= 0) return 0;
  const booked = stays.reduce((n, s) => n + nightsInWindow(s.checkIn, s.checkOut, from, to), 0);
  return Math.min(1, Math.round((booked / days) * 10000) / 10000);
}

// listings : [{ id, title, currency, rating, reviewCount }]
// bookings : réservations CONFIRMED des annonces [{ listingId, checkIn, checkOut, totalPrice }]
// Fenêtres d'occupation : 30/90 derniers jours [today-N, today[ et 30/90 prochains [today, today+N[.
export function computeHostStats({ listings, bookings, today }) {
  const revenue = {};
  let pastNights = 0;
  let upcomingNights = 0;
  const byListing = new Map(listings.map((l) => [l.id, []]));
  const currencyOf = new Map(listings.map((l) => [l.id, l.currency || "XOF"]));

  for (const b of bookings) {
    const checkOut = toDay(b.checkOut);
    const currency = currencyOf.get(b.listingId) || "XOF";
    const nights = nightsBetween(toDay(b.checkIn), checkOut);
    const entry = (revenue[currency] ??= { past: 0, upcoming: 0, total: 0 });
    const amount = Number(b.totalPrice);
    // Passé = séjour terminé (départ atteint) ; à venir = en cours ou futur.
    if (checkOut <= today) {
      entry.past += amount;
      pastNights += nights;
    } else {
      entry.upcoming += amount;
      upcomingNights += nights;
    }
    entry.total += amount;
    byListing.get(b.listingId)?.push(b);
  }
  for (const entry of Object.values(revenue)) {
    entry.past = round2(entry.past);
    entry.upcoming = round2(entry.upcoming);
    entry.total = round2(entry.total);
  }

  const windows = {
    last30: [addDays(today, -30), today],
    last90: [addDays(today, -90), today],
    next30: [today, addDays(today, 30)],
    next90: [today, addDays(today, 90)],
  };
  const occupancy = listings.map((l) => {
    const stays = byListing.get(l.id) || [];
    const rates = Object.fromEntries(
      Object.entries(windows).map(([k, [from, to]]) => [k, occupancyRate(stays, from, to)])
    );
    return { listingId: l.id, title: l.title, ...rates };
  });

  let ratingSum = 0;
  let reviewCount = 0;
  for (const l of listings) {
    if (l.rating != null && l.reviewCount > 0) {
      ratingSum += Number(l.rating) * l.reviewCount;
      reviewCount += l.reviewCount;
    }
  }

  return {
    revenue,
    nightsBooked: { past: pastNights, upcoming: upcomingNights, total: pastNights + upcomingNights },
    occupancy,
    averageRating: reviewCount ? round2(ratingSum / reviewCount) : null,
    reviewCount,
  };
}
