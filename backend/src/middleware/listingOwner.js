import prisma from "../config/db.js";

// Contrôle léger de propriété (avant un traitement coûteux). Même réponses que images.controller.js,
// qui revérifie la propriété sous verrou (défense en profondeur).
export const requireListingOwner = async (req, res, next) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      select: { hostId: true },
    });
    if (!listing) return res.status(404).json({ error: "Annonce introuvable" });
    if (listing.hostId !== req.user.id) {
      return res.status(403).json({ error: "Non autorisé à modifier cette annonce" });
    }
    next();
  } catch (err) {
    next(err);
  }
};
