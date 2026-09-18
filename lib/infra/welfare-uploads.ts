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

import {
  HEIF_SNIFF_BYTES,
  heicRefusalMessage,
  isDeclaredHeic,
  isHeifContainer,
  metadataStripRefusalMessage,
} from "@/lib/media/heic";
import { reencodeRaster } from "@/lib/media/validate";

const BUCKET = "welfare-evidence";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
// HEIC/HEIF are NOT here, and that is a decision, not an omission: PO D4
// (2026-09-18) refuses them rather than transcoding. See lib/media/heic.ts.
// Video stays accepted with its metadata until the D4b neutraliser lands
// (docs/handoff/rumbo-al-piloto.md, T2-P3).
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

// Raster image types re-encoded through sharp to strip EXIF/GPS metadata. The
// strip FAILS CLOSED: a file of one of these types is stored stripped or not at
// all. GIF is not re-encoded (sharp would flatten an animation); it has no
// camera EXIF block, which is where a phone writes its GPS position.
const STRIP_EXIF_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * ¿Podemos garantizar que este archivo se guardó SIN metadatos (GPS incluido)?
 *
 * Sólo para los tipos que `sharp` re-encodea acá, y para esos la garantía es
 * dura: si el re-encode falla, la subida se rechaza y se deshace (D4, fail
 * closed), nunca se guarda el original. HEIC/HEIF ya no se aceptan (D4). Para
 * GIF y video los bytes se suben tal cual: un GIF no lleva EXIF de cámara, y el
 * video del iPhone SÍ lleva GPS hasta que llegue el neutralizador de D4b.
 *
 * POR QUÉ SIGUE EXPORTADA AUNQUE HOY NO GATEA NINGUNA SUPERFICIE VIVA. Guardaba
 * el comprobante público (`/denuncias/codigo/[code]`): esa lectura SIN sesión
 * condicionaba a esto si firmaba una URL hacia la evidencia. La página fue
 * endurecida después y hoy NO lee `welfareReportAttachments` ni firma ninguna
 * URL en absoluto — el denunciante conserva sus propios archivos y el organismo
 * los recibe por su camino autenticado (Ley 14.346) — así que esta función no
 * gatea nada en producción. Sigue exportada y probada
 * (`__tests__/welfare-coordinates-precision.test.ts`, que además pin-ea que el
 * comprobante NO la llama) por si una superficie pública vuelve a servir
 * evidencia y necesita el mismo criterio.
 *
 * Si se reactiva, falla cerrado por construcción: si mañana se agrega un
 * formato a ALLOWED_MIME sin sumarlo acá, la respuesta correcta es NO
 * exponerlo, no filtrarlo.
 */
export function isMetadataStripped(mimeType: string | null | undefined): boolean {
  return mimeType !== null && mimeType !== undefined && STRIP_EXIF_MIME.has(mimeType);
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

/**
 * The checks that need no storage: count, HEIC/HEIF, type, size. Returns the
 * es-AR refusal, or null when the set may be uploaded.
 *
 * Exported so a caller that writes a row BEFORE uploading (the denuncia
 * actions insert the report first, by design) can refuse up front instead of
 * leaving a report behind with no evidence. `uploadWelfareEvidence` runs it
 * again, so a caller that skips it is still refused — just later.
 *
 * HEIC is recognised by its declared type or extension AND by the bytes: a
 * picker can hand over an iPhone photo labelled `image/jpeg` or with no type at
 * all, and the first bytes are the only thing the client does not choose.
 */
export async function checkWelfareEvidence(files: File[]): Promise<string | null> {
  const real = files.filter((f) => f && f.size > 0);
  if (real.length > MAX_FILES) return `No podés adjuntar más de ${MAX_FILES} archivos.`;
  for (const f of real) {
    const head = new Uint8Array(await f.slice(0, HEIF_SNIFF_BYTES).arrayBuffer());
    if (isDeclaredHeic(f) || isHeifContainer(head)) return heicRefusalMessage(f.name || null);
    if (!ALLOWED_MIME.has(f.type)) {
      return `Tipo de archivo no soportado: ${f.type || "desconocido"}. Solo imágenes y videos.`;
    }
    if (f.size > MAX_FILE_BYTES) return `Archivo "${f.name}" supera el límite de 25 MB.`;
  }
  return null;
}

export async function uploadWelfareEvidence(
  reportId: string,
  files: File[],
): Promise<WelfareUploadResult> {
  const real = files.filter((f) => f && f.size > 0);
  if (real.length === 0) return { error: null, uploaded: [], uploadedPaths: [] };
  const refusal = await checkWelfareEvidence(real);
  if (refusal) return { error: refusal, uploaded: [], uploadedPaths: [] };

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
    //
    // FAILS CLOSED (D4). This used to fall back to the ORIGINAL bytes when sharp
    // threw, on the reasoning "we'd rather store metadata than fail the whole
    // denuncia" — which stored exactly the position the strip exists to drop,
    // for exactly the files sharp could not read. Now the submission is refused
    // and everything this call already stored is removed, the same shape as
    // `claimStagedEventAttachment` (lib/infra/staged-event-attachment.ts).
    let uploadBody: File | Buffer = f;
    let storedSize = f.size;
    if (STRIP_EXIF_MIME.has(f.type)) {
      try {
        const processed = await reencodeRaster(Buffer.from(await f.arrayBuffer()));
        uploadBody = processed;
        storedSize = processed.length;
      } catch (err) {
        console.warn("[welfare-uploads] EXIF strip failed, refusing rather than storing raw:", {
          message: err instanceof Error ? err.message : String(err),
        });
        await removeWelfareEvidence(uploadedPaths);
        return {
          error: metadataStripRefusalMessage(f.name || null),
          uploaded: [],
          uploadedPaths: [],
        };
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
  if (mime === "image/gif") return ".gif";
  if (mime === "video/mp4") return ".mp4";
  if (mime === "video/webm") return ".webm";
  if (mime === "video/quicktime") return ".mov";
  return "";
}
