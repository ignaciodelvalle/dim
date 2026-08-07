// Multi-file upload helper for welfare evidence.
//
// Kept separate from lib/uploads.ts — different bucket, different lifecycle
// (anonymous-capable), different MIME set, and multi-file semantics.
//
// STORAGE IDENTITY (RA-8 R2, migration 0164): the `welfare-evidence` bucket has
// no anon/authenticated policy. It used to grant `anon` unrestricted INSERT and
// a SELECT that named no caller at all, which made the whole national corpus of
// cruelty-complaint evidence anonymously listable and downloadable. Both legs
// now run as service role from here.
//
// The anonymous denuncia still works: "anonymous" describes the REPORTER, not
// the storage caller. The upload has always happened inside a server action
// (createWelfareReportAction and friends) after that action validated the
// submission — the browser never touched the bucket.
//
// Side effect worth naming: rollback actually works now. The bucket had no
// DELETE policy, so every `.remove()` in the failure paths was silently denied
// and leaked orphaned objects.

const BUCKET = "welfare-evidence";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

// Raster image types that sharp can re-encode to strip EXIF/GPS metadata.
// HEIC/HEIF and GIF are excluded — sharp support is optional/unreliable for
// those formats, so we leave them untouched rather than risk a corrupt upload.
const STRIP_EXIF_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Strips EXIF metadata (including GPS) from a raster image buffer via sharp.
 * `.rotate()` bakes orientation into pixels; omitting `.withMetadata()` means
 * sharp outputs the result with NO metadata attached.
 * Non-fatal: callers catch and fall back to the original bytes on any error.
 */
async function stripExif(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer).rotate().toBuffer();
}

export type WelfareUploadResult = {
  error: string | null;
  uploaded: Array<{
    storagePath: string;
    mimeType: string;
    fileSize: number;
    originalFilename: string | null;
  }>;
  // Paths to clean up if the calling code decides to roll back (e.g., the
  // attachments row insert fails).
  uploadedPaths: string[];
};

/** Service-role storage handle for the private welfare-evidence bucket. */
async function evidenceBucket() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return createAdminClient().storage.from(BUCKET);
}

/**
 * Delete welfare-evidence objects. Used by the transaction-rollback paths so a
 * failed denuncia does not leave orphaned evidence in the bucket.
 * Best-effort: never throws.
 */
export async function removeWelfareEvidence(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  try {
    await (await evidenceBucket()).remove(storagePaths);
  } catch (err) {
    console.warn("[welfare-uploads] evidence cleanup failed (non-fatal):", err);
  }
}

export async function uploadWelfareEvidence(
  reportId: string,
  files: File[],
): Promise<WelfareUploadResult> {
  const real = files.filter((f) => f && f.size > 0);
  if (real.length === 0) return { error: null, uploaded: [], uploadedPaths: [] };
  if (real.length > MAX_FILES) {
    return {
      error: `No podés adjuntar más de ${MAX_FILES} archivos.`,
      uploaded: [],
      uploadedPaths: [],
    };
  }
  for (const f of real) {
    if (!ALLOWED_MIME.has(f.type)) {
      return {
        error: `Tipo de archivo no soportado: ${f.type || "desconocido"}. Solo imágenes y videos.`,
        uploaded: [],
        uploadedPaths: [],
      };
    }
    if (f.size > MAX_FILE_BYTES) {
      return {
        error: `Archivo "${f.name}" supera el límite de 25 MB.`,
        uploaded: [],
        uploadedPaths: [],
      };
    }
  }

  const uploaded: WelfareUploadResult["uploaded"] = [];
  const uploadedPaths: string[] = [];

  let bucket: Awaited<ReturnType<typeof evidenceBucket>>;
  try {
    bucket = await evidenceBucket();
  } catch (err) {
    // Fail closed and loud: a missing service-role key means evidence cannot
    // be stored at all, and silently accepting a denuncia with no evidence is
    // worse than telling the reporter to retry.
    console.error("[welfare-uploads] service-role storage client unavailable:", err);
    return {
      error: "No se pudo guardar la evidencia. Intentá de nuevo en unos minutos.",
      uploaded: [],
      uploadedPaths: [],
    };
  }

  for (const f of real) {
    const ext = inferExtension(f.name, f.type);
    const attachmentId = crypto.randomUUID();
    const path = `${reportId}/${attachmentId}${ext}`;

    // Strip EXIF (including GPS) from raster images before storage so an
    // anonymous reporter's home location can't be inferred from photo metadata.
    // Non-fatal: if sharp throws (corrupt/unsupported file), fall back to the
    // original bytes — we'd rather store metadata than fail the whole denuncia.
    let uploadBody: File | Buffer = f;
    let storedSize = f.size;
    if (STRIP_EXIF_MIME.has(f.type)) {
      try {
        const arrayBuffer = await f.arrayBuffer();
        const processed = await stripExif(Buffer.from(arrayBuffer));
        uploadBody = processed;
        storedSize = processed.length;
      } catch (err) {
        console.warn("[welfare-uploads] EXIF strip failed (non-fatal), uploading original:", err);
      }
    }

    const { error } = await bucket.upload(path, uploadBody, {
      contentType: f.type,
      upsert: false,
    });
    if (error) {
      // Roll back what we already uploaded.
      await removeWelfareEvidence(uploadedPaths);
      return {
        error: `No se pudo subir "${f.name}": ${error.message}`,
        uploaded: [],
        uploadedPaths: [],
      };
    }
    uploaded.push({
      storagePath: path,
      mimeType: f.type,
      fileSize: storedSize,
      originalFilename: f.name || null,
    });
    uploadedPaths.push(path);
  }

  return { error: null, uploaded, uploadedPaths };
}

function inferExtension(filename: string, mime: string): string {
  const fromName = filename.includes(".") ? `.${filename.split(".").pop()?.toLowerCase()}` : "";
  if (fromName) return fromName;
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/heic") return ".heic";
  if (mime === "image/heif") return ".heif";
  if (mime === "image/gif") return ".gif";
  if (mime === "video/mp4") return ".mp4";
  if (mime === "video/webm") return ".webm";
  if (mime === "video/quicktime") return ".mov";
  return "";
}
