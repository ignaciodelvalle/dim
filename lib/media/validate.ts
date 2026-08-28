// Raster-image validation, on BYTES.
//
// WHY IT MOVED OUT OF lib/infra/uploads.ts
// ---------------------------------------------------------------------------
// `uploadAttachmentIfPresent` welds three security properties to a `File` that
// came out of a `FormData` that came out of a Server Action. RN-4's improvement
// #1 names that weld as the reason no non-browser client can upload at all, and
// docs/architecture/api-invariants.md §1.5 states the consequence as a rule:
//
//     "native uploading direct-to-storage with a signed URL loses all three at
//      once. No createSignedUploadUrl exists anywhere today — every signed URL
//      in the repo is a download. Keep it that way, or replicate all three
//      server-side first."
//
// This module is the "replicate all three server-side first" half. It holds the
// three properties and nothing else, over a `Buffer`, so the same code decides
// them whether the bytes arrived as a multipart `File` in a Server Action or
// were fetched back out of a staging bucket by a route handler.
//
// IT IS ONE COPY, NOT A SECOND ONE. `lib/infra/uploads.ts` imports from here
// rather than keeping its own; a duplicated magic-byte table is a table that
// disagrees with itself the first time somebody adds a format to one of them.
//
// THE THREE PROPERTIES, and which are universal:
//   · magic bytes — UNIVERSAL. `file.type` / a client-declared content type is
//     never trusted for a security decision.
//   · no SVG — UNIVERSAL, by whitelist construction. SVG is stored XSS when
//     served from a public bucket.
//   · re-encode — CALLER'S CHOICE, and the caller states it. Public-bucket
//     destinations must re-encode and must fail CLOSED; see uploads.ts.

/**
 * The whitelist of real raster types we accept.
 *
 * KEY is the canonical MIME (decided by magic bytes, never by the client);
 * VALUE is the storage-key extension derived from it. Deriving the extension
 * from the validated MIME is what keeps a client filename out of the object
 * key — see `rasterExtension`.
 */
export const RASTER_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type RasterMime = keyof typeof RASTER_IMAGE_TYPES;

/** Every MIME a caller may legally declare, as a runtime list for zod/enums. */
export const RASTER_MIME_LIST = Object.keys(RASTER_IMAGE_TYPES) as readonly RasterMime[];

/**
 * The size ceiling, in bytes.
 *
 * Lives here because two enforcement points must agree on it: the Server Action
 * path checks `file.size` before reading, and the staging bucket declares the
 * same number as its `file_size_limit` so the Storage API refuses an oversized
 * PUT that no server code ever sees. A limit the client volunteers is not a
 * limit; a limit the object store enforces is.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Is this a MIME a caller may declare? Narrows on the way through. */
export function isRasterMime(value: string): value is RasterMime {
  return Object.hasOwn(RASTER_IMAGE_TYPES, value);
}

/** The storage-key extension for a VALIDATED mime. Never a client filename. */
export function rasterExtension(mime: RasterMime): string {
  return RASTER_IMAGE_TYPES[mime];
}

/**
 * Identify a raster image by its MAGIC BYTES (file signature).
 *
 * Returns the canonical MIME, or null when the bytes match no whitelisted
 * format. THIS is the authoritative content check: a declared content type is
 * attacker-controlled — an SVG, an HTML document or a ZIP can all be labelled
 * `image/jpeg` — and must never decide anything that matters.
 */
export function detectRasterMime(bytes: Uint8Array): RasterMime | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: "RIFF" (52 49 46 46) .... "WEBP" (57 45 42 50) at offset 8
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Re-encode a raster through sharp, dropping every metadata block.
 *
 * `.rotate()` bakes the EXIF orientation into the pixels and sharp then writes
 * the result WITHOUT metadata unless `.withMetadata()` is called — which is
 * deliberately not called. So the same line both normalises the bytes (no
 * polyglots, no embedded payloads) and strips GPS.
 *
 * Throws on any sharp error. The CALLER decides what a failure means: a public
 * destination must reject, a private one may fall back. That decision is not
 * this function's to make and it is not the same decision in both places.
 *
 * The import is dynamic to keep sharp out of any client bundle.
 */
export async function reencodeRaster(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer).rotate().toBuffer();
}
