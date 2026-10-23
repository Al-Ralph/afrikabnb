import * as adminService from "../../services/admin.js";
import { listingToJson } from "../listings/listings.serializers.js";

// Journal des actions d'administration (qui, quoi, sur quelle cible).
function audit(req, action, target, details = {}) {
  req.log.info({ adminId: req.user.id, action, target, ...details }, `[admin] ${action}`);
}

const userToJson = ({ _count, ...u }) => ({ ...u, listingsCount: _count.listings, bookingsCount: _count.bookings });

// GET /api/admin/stats
export async function stats(req, res, next) {
  try {
    res.json(await adminService.getStats());
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/users?q&role&limit&offset
export async function users(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { data, total } = await adminService.listUsers(req.query);
    res.json({ data: data.map(userToJson), total, limit, offset });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/users/:id/role { role }
// Interdit : se rétrograder soi-même, retirer le rôle ADMIN au dernier administrateur.
export async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body;
    const targetId = req.params.id;
    const { before, user } = await adminService.updateUserRole({ actor: req.user, targetId, role });
    audit(req, "user.role.update", { userId: targetId }, { from: before, to: role });
    res.json(userToJson(user));
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/listings?q&status&limit&offset (annonces masquées comprises)
export async function listings(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { data, total } = await adminService.listListings(req.query);
    res.json({
      data: data.map(({ _count, ...l }) => ({
        ...listingToJson(l),
        bookingsCount: _count.bookings,
        reviewsCount: _count.reviews,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/listings/:id/status { status: "ACTIVE" | "HIDDEN" }
export async function updateListingStatus(req, res, next) {
  try {
    const { status } = req.body;
    const { before, listing } = await adminService.updateListingStatus({ listingId: req.params.id, status });
    audit(req, "listing.status.update", { listingId: listing.id }, { from: before, to: status });
    res.json(listingToJson(listing));
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/reviews?limit&offset : avis les plus récents.
export async function reviews(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { data, total } = await adminService.listReviews({ limit, offset });
    res.json({ data, total, limit, offset });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/reviews/:id -> { listing: { id, rating, reviewCount } } (note recalculée)
export async function deleteReview(req, res, next) {
  try {
    const listing = await adminService.deleteReview(req.params.id);
    audit(req, "review.delete", { reviewId: req.params.id, listingId: listing.id });
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}
