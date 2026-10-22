// Sémaphore global : au plus MAX_CONCURRENT_UPLOADS téléversements traités en même temps
// (multer garde les fichiers en mémoire, sharp est coûteux en CPU).
export const MAX_CONCURRENT_UPLOADS = 2;

let active = 0;

export function acquireUploadSlot(req, res, next) {
  if (active >= MAX_CONCURRENT_UPLOADS) {
    res.set("Retry-After", "5");
    return res.status(503).json({ error: "Serveur occupé, réessayez dans quelques secondes" });
  }
  active += 1;
  let released = false;
  // "close" est émis aussi bien en fin normale qu'en cas de coupure du client.
  res.on("close", () => {
    if (released) return;
    released = true;
    active -= 1;
  });
  next();
}

export const activeUploads = () => active;
