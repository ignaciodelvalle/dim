import { randomUUID } from "node:crypto";

const MAX_BYTES = 5 * 1024 * 1024;

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
  if (!file.type.startsWith("image/")) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "El archivo debe ser una imagen.",
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "La imagen no puede superar los 5 MB.",
    };
  }
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const filename = `${randomUUID()}.${ext}`;

  // EXIF stripping (opt-in). Only attempted for raster images when stripMetadata:true.
  // Non-fatal: if sharp throws (corrupt file, unsupported format, etc.), we fall
  // back to uploading the original File unchanged.
  let uploadBody: File | Buffer = file;
  if (options?.stripMetadata) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);
      uploadBody = await stripExifFromBuffer(inputBuffer);
    } catch (err) {
      console.warn("[uploads] EXIF strip failed (non-fatal), uploading original:", err);
      uploadBody = file;
    }
  }

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filename, uploadBody, { contentType: file.type });
  if (uploadError) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: `No se pudo subir la imagen: ${uploadError.message}`,
    };
  }
  // Report the size of what was actually stored — the EXIF-stripped buffer
  // differs from the original file size when stripMetadata re-encoded it.
  const storedSize = Buffer.isBuffer(uploadBody) ? uploadBody.length : file.size;
  return { uploadedPath: filename, mimeType: file.type, size: storedSize, error: null };
}
