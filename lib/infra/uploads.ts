import { randomUUID } from "node:crypto";

const MAX_BYTES = 5 * 1024 * 1024;

// Whitelist of real raster image types we accept. The KEY is the canonical
// MIME (validated by magic bytes, NOT by the client-supplied `file.type`),
// the VALUE is the storage-key extension derived from it. SVG is intentionally
// excluded — it is an XSS vector when served from a public bucket.
const RASTER_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
type RasterMime = keyof typeof RASTER_IMAGE_TYPES;

// Buckets whose objects are publicly readable. Uploads to these buckets MUST be
// re-encoded through sharp so attacker-controlled bytes (polyglots, embedded
// scripts, malformed rasters) never reach a public URL verbatim.
const PUBLIC_REENCODE_BUCKETS = new Set(["pet-photos"]);

/**
 * Identify a raster image by its MAGIC BYTES (file signature). Returns the
 * canonical MIME type or null when the bytes match none of the whitelisted
 * raster formats. This is the authoritative content check — `file.type` is
 * client-controlled and must never be trusted for a security decision.
 */
function detectRasterMime(bytes: Uint8Array): RasterMime | null {
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

export type UploadResult = {
  uploadedPath: string | null;
  mimeType: string | null;
  size: number | null;
  error: string | null;
};

export type UploadOptions = {
  /** When true, strips EXIF metadata (including GPS) via sharp before upload.
   * Only applies to raster images. Falls back to the original file if sharp
   * throws. Default: false (preserves current behavior for all existing callers). */
  stripMetadata?: boolean;
};

// Accept any Supabase client that exposes a `.storage` property — covers both
// the cookie-bound SSR client (@supabase/ssr) and the service-role admin
// client (@supabase/supabase-js). Anonymous server actions need the admin
// client to bypass the `to authenticated` RLS policy on the bucket.
type SupabaseStorageClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        file: File | Buffer,
        options?: { contentType?: string },
      ): Promise<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Strips EXIF metadata from a raster image using sharp.
 * - `.rotate()` bakes the EXIF orientation into pixel data and, by default,
 *   sharp outputs the result WITHOUT any EXIF metadata (GPS, camera model,
 *   timestamps, etc.) unless `.withMetadata()` is called. We intentionally
 *   omit `.withMetadata()` to achieve the strip.
 * - Returns the processed Buffer on success.
 * - Throws on any sharp error; callers should fall back to the original file.
 */
async function stripExifFromBuffer(buffer: Buffer): Promise<Buffer> {
  // Dynamic import keeps sharp out of the client bundle and lets the module
  // resolve lazily (only invoked on the server for finder photo uploads).
  const sharp = (await import("sharp")).default;
  return sharp(buffer).rotate().toBuffer();
}

export async function uploadAttachmentIfPresent(
  supabase: SupabaseStorageClient,
  file: File | null,
  bucket: string,
  options?: UploadOptions,
): Promise<UploadResult> {
  if (!file || file.size === 0) {
    return { uploadedPath: null, mimeType: null, size: null, error: null };
  }
  if (file.size > MAX_BYTES) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "La imagen no puede superar los 5 MB.",
    };
  }

  // Read the actual bytes and validate by MAGIC BYTES. `file.type` is
  // client-controlled — an attacker can label an SVG (or any payload) as
  // "image/jpeg", so we never trust it for a security decision. Anything that
  // is not a whitelisted raster (JPEG/PNG/WEBP) is rejected here, including
  // SVG (a stored-XSS vector on the public bucket).
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const detectedMime = detectRasterMime(inputBuffer);
  if (!detectedMime) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "El archivo debe ser una imagen JPG, PNG o WebP.",
    };
  }

  // The storage-key extension is derived from the VALIDATED MIME type, never
  // from the client filename. This closes the path-traversal hole where a name
  // like "x.jpg/../../evil" would inject "../" into the object key.
  const ext = RASTER_IMAGE_TYPES[detectedMime];
  const filename = `${randomUUID()}.${ext}`;

  // Re-encoding decision:
  //  - Public buckets ALWAYS re-encode: normalized raster bytes only, so no
  //    attacker-controlled bytes are ever served from a public URL.
  //  - Other callers opt in via stripMetadata (e.g. finder photos, to drop GPS
  //    EXIF). Re-encoding through sharp also strips metadata as a side effect.
  const mustReencode = PUBLIC_REENCODE_BUCKETS.has(bucket);
  const shouldReencode = mustReencode || options?.stripMetadata === true;

  let uploadBody: File | Buffer = file;
  if (shouldReencode) {
    try {
      uploadBody = await stripExifFromBuffer(inputBuffer);
    } catch (err) {
      if (mustReencode) {
        // Public bucket: never fall back to the raw, un-normalized bytes.
        console.warn("[uploads] re-encode failed for public bucket, rejecting:", err);
        return {
          uploadedPath: null,
          mimeType: null,
          size: null,
          error: "No se pudo procesar la imagen. Probá con otra foto.",
        };
      }
      // Private-ish bucket (opt-in strip): non-fatal fallback to original file.
      console.warn("[uploads] EXIF strip failed (non-fatal), uploading original:", err);
      uploadBody = file;
    }
  }

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filename, uploadBody, { contentType: detectedMime });
  if (uploadError) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: `No se pudo subir la imagen: ${uploadError.message}`,
    };
  }
  // Report the size of what was actually stored — the re-encoded buffer differs
  // from the original file size when sharp re-encoded it.
  const storedSize = Buffer.isBuffer(uploadBody) ? uploadBody.length : file.size;
  return { uploadedPath: filename, mimeType: detectedMime, size: storedSize, error: null };
}
