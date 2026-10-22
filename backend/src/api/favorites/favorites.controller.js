import prisma from "../../config/db.js";
import { listingBaseInclude, listingToJson } from "../listings/listings.serializers.js";

// POST /api/listings/:id/favorite (idempotent)
export async function add(req, res, next) {
  try {
    const listingId = req.params.id;
    const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, status: true } });
    if (!listing || listing.status !== "ACTIVE") return res.status(404).json({ error: "Annonce introuvable" });
    await prisma.favorite.upsert({
      where: { userId_listingId: { userId: req.user.id, listingId } },
      update: {},
      create: { userId: req.user.id, listingId },
    });
    res.json({ listingId, isFavorite: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/listings/:id/favorite (idempotent)
export async function remove(req, res, next) {
  try {
    const listingId = req.params.id;
    await prisma.favorite.deleteMany({ where: { userId: req.user.id, listingId } });
    res.json({ listingId, isFavorite: false });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/favorites : annonces favorites complètes, la plus récente d'abord.
export async function listMine(req, res, next) {
  try {
    const favorites = await prisma.favorite.findMany({
      // Annonces masquées par la modération exclues.
      where: { userId: req.user.id, listing: { status: "ACTIVE" } },
      include: { listing: { include: listingBaseInclude } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: favorites.map((f) => ({ ...listingToJson(f.listing), isFavorite: true })) });
  } catch (err) {
    next(err);
  }
}
