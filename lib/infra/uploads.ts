import { randomUUID } from "node:crypto";

import {
  MAX_IMAGE_BYTES,
  RASTER_IMAGE_TYPES,
  detectRasterMime,
  reencodeRaster,
} from "@/lib/media/validate";

const MAX_BYTES = MAX_IMAGE_BYTES;

// Buckets whose objects are publicly readable. Uploads to these buckets MUST be
// re-encoded through sharp so attacker-controlled bytes (polyglots, embedded
// scripts, malformed rasters) never reach a public URL verbatim.
const PUBLIC_REENCODE_BUCKETS = new Set(["pet-photos"]);

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
      uploadBody = await reencodeRaster(inputBuffer);
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
