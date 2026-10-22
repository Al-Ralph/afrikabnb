import * as favoritesService from "../../services/favorites.js";
import { listingToJson } from "../listings/listings.serializers.js";

// POST /api/listings/:id/favorite (idempotent)
export async function add(req, res, next) {
  try {
    const listingId = req.params.id;
    await favoritesService.addFavorite({ listingId, userId: req.user.id });
    res.json({ listingId, isFavorite: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/listings/:id/favorite (idempotent)
export async function remove(req, res, next) {
  try {
    const listingId = req.params.id;
    await favoritesService.removeFavorite({ listingId, userId: req.user.id });
    res.json({ listingId, isFavorite: false });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/favorites : annonces favorites complètes, la plus récente d'abord.
export async function listMine(req, res, next) {
  try {
    const favorites = await favoritesService.listFavorites(req.user.id);
    res.json({ data: favorites.map((f) => ({ ...listingToJson(f.listing), isFavorite: true })) });
  } catch (err) {
    next(err);
  }
}
