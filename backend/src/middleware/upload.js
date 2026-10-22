import multer from "multer";
import { detectImageType } from "../utils/imageSignature.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_LISTING = 10;

// Fichiers gardés en mémoire (jamais écrits tels quels sur disque) avec des limites strictes :
// 10 fichiers de 5 Mo max dans le champ "images", aucun autre champ fichier, peu de champs texte.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: MAX_IMAGES_PER_LISTING,
    fields: 5,
    fieldSize: 1024,
    parts: MAX_IMAGES_PER_LISTING + 5,
    headerPairs: 50,
  },
}).array("images", MAX_IMAGES_PER_LISTING);

const MULTER_ERRORS = {
  LIMIT_FILE_SIZE: [413, "Image trop volumineuse (5 Mo maximum par image)"],
  LIMIT_FILE_COUNT: [400, `${MAX_IMAGES_PER_LISTING} images maximum par envoi`],
  LIMIT_UNEXPECTED_FILE: [400, 'Champ de fichier inattendu (utiliser "images")'],
  LIMIT_PART_COUNT: [400, "Trop de champs dans le formulaire"],
  LIMIT_FIELD_COUNT: [400, "Trop de champs dans le formulaire"],
  LIMIT_FIELD_VALUE: [400, "Champ de formulaire trop long"],
};

// multipart/form-data, champ "images" (1 à 10 fichiers JPEG, PNG ou WebP). Le type réel est
// vérifié par signature binaire avant tout accès à la base ; le mimetype déclaré est ignoré.
export function receiveImages(req, res, next) {
  if (!req.is("multipart/form-data")) {
    return res.status(415).json({ error: "Envoyer les images en multipart/form-data (champ \"images\")" });
  }
  upload(req, res, (err) => {
    if (err) {
      const known = err instanceof multer.MulterError && MULTER_ERRORS[err.code];
      if (known) return res.status(known[0]).json({ error: known[1] });
      // Corps multipart mal formé.
      return res.status(400).json({ error: "Formulaire multipart invalide" });
    }
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'Aucune image reçue (champ "images")' });
    for (const file of files) {
      const type = detectImageType(file.buffer);
      if (!type) {
        return res.status(415).json({ error: "Format non supporté : images JPEG, PNG ou WebP uniquement" });
      }
      file.detectedType = type;
    }
    next();
  });
}
