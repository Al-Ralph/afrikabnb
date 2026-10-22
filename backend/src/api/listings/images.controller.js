import * as imagesService from "../../services/listingImages.js";

// POST /api/listings/:id/images (multipart, champ "images") -> 201 { data: [images] }
export async function upload(req, res, next) {
  try {
    const images = await imagesService.uploadImages({
      listingId: req.params.id,
      userId: req.user.id,
      files: req.files,
      log: req.log,
    });
    res.status(201).json({ data: images });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/listings/:id/images/:imageId -> { data: [images restantes] }
export async function remove(req, res, next) {
  try {
    const images = await imagesService.removeImage({
      listingId: req.params.id,
      imageId: req.params.imageId,
      userId: req.user.id,
      log: req.log,
    });
    res.json({ data: images });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/listings/:id/images/order { imageIds: [...] } : permutation complète des images.
export async function reorder(req, res, next) {
  try {
    const images = await imagesService.reorderImages({
      listingId: req.params.id,
      userId: req.user.id,
      imageIds: req.body.imageIds,
    });
    res.json({ data: images });
  } catch (err) {
    next(err);
  }
}
