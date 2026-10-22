import * as reviewsService from "../../services/reviews.js";

// GET /api/listings/:id/reviews?limit&offset
export async function listForListing(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { data, total, rating, reviewCount } = await reviewsService.listListingReviews({
      listingId: req.params.id,
      limit,
      offset,
    });
    res.json({ data, total, limit, offset, rating, reviewCount });
  } catch (err) {
    next(err);
  }
}

// POST /api/bookings/:id/review : un avis par séjour terminé, par le voyageur uniquement.
export async function create(req, res, next) {
  try {
    const { rating, comment } = req.body;
    const result = await reviewsService.createReview({ bookingId: req.params.id, user: req.user, rating, comment });
    res.status(201).json({ ...result.review, listing: result.listing });
  } catch (err) {
    next(err);
  }
}
