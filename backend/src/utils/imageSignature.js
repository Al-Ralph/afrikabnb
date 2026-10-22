// Détection du type réel d'une image par sa signature binaire (magic bytes) : l'extension et le
// type MIME déclarés par le client ne sont jamais pris en compte.

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const startsWith = (buf, bytes, offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

// Buffer -> "image/jpeg" | "image/png" | "image/webp" | null.
export function detectImageType(buf) {
  if (!buf || typeof buf.length !== "number" || buf.length < 12) return null;
  // JPEG : FF D8 FF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP : "RIFF" <taille sur 4 octets> "WEBP"
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}
