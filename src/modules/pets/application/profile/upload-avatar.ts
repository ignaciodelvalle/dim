// upload-avatar.ts — uploadAvatarForUser use-case.
//
// Validates the BYTES (size + magic-byte type), checks profile existence,
// uploads to the "avatars" private Supabase Storage bucket (or a test stub),
// updates the profiles row, and inserts an audit_log entry.
// Storage bucket: "avatars" (private).
//   - If bucket is missing, uploadAvatarForUser fails gracefully and logs
//     'profile_avatar_upload_failed' to audit_log.
//   - A _storageStub escape hatch lets tests inject a fake upload function.
//
// WHAT CHANGED, AND WHY IT WAS A HOLE (audit 2026-09-fresh, finding A07-2).
// ---------------------------------------------------------------------------
// The size ceiling used to be enforced against `input.fileSize` — a NUMBER the
// caller sends on the wire, next to the blob but independent of it. Every one
// of the four fields (`fileBlob`, `fileName`, `mimeType`, `fileSize`) is
// caller-controlled and nothing tied them together, so `fileSize: 1` with a
// 50 MB `fileBlob` passed validation and was uploaded through the SERVICE ROLE
// client. `mimeType` was trusted the same way: an arbitrary payload labelled
// `image/jpeg` was stored under that content type.
//
// A limit the client volunteers is not a limit. Both halves now come off the
// bytes: `fileBlob.size` for the ceiling and `detectRasterMime` for the type —
// the same magic-byte table `lib/infra/uploads.ts` and `pet-photo-upload.ts`
// use, deliberately imported rather than restated (`lib/media/validate.ts`:
// "IT IS ONE COPY, NOT A SECOND ONE").
//
// The BUCKET is the other half and it is not this file's: migration 0218 gives
// `avatars` its own `file_size_limit` and `allowed_mime_types`, so a caller who
// reaches the Storage API directly with its own token — never running this
// code — is bounded too. This check exists so the person gets a Spanish
// sentence telling them what to do instead of an opaque storage error.
//
// THE DECLARED MIME IS NOW A SIGNAL, NOT A GATE, and that is a deliberate
// reversal of the first draft of this fix. That draft kept the old zod enum as
// a "cheap pre-check" while calling it something that "decides nothing" — and
// it was not true in the negative: `File.type` is filled in by the operating
// system from the FILE EXTENSION, so a perfectly real JPEG that somebody saved
// as `foto.heic` arrives declared `image/heic` and that enum refused it before
// a single byte was read. A false refusal, produced by the layer with no
// authority, against a person who did nothing wrong. Once the declared type
// decides nothing it may not refuse anything either, so the enum is gone: the
// bytes are the only gate. What the caller declared is recorded on the audit
// row when it DISAGREES with the bytes — a mismatch is usually that same
// harmless rename, but a polyglot upload is the same shape and must not pass
// through leaving no trace at all.
//
// `fileName` survives on the input type for wire compatibility with
// `uploadAvatarAction` and reaches NOTHING: not the object key (see
// `avatarObjectKey`), not the audit row, not the upload.

import { eq } from "drizzle-orm";

import { db, profiles } from "@/db";
import { writeAuditLog } from "@/lib/infra/audit-log";
import {
  MAX_IMAGE_BYTES,
  type RasterMime,
  detectRasterMime,
  rasterExtension,
} from "@/lib/media/validate";
import { createAdminClient } from "@/lib/supabase/admin";

import type { UploadAvatarResult } from "./types";

// ---------------------------------------------------------------------------
// The object key
// ---------------------------------------------------------------------------

/**
 * The storage key for a user's avatar, derived from the VALIDATED mime.
 *
 * EXPORTED SO IT CAN BE TESTED, which is the whole reason it is a function at
 * all. It used to be two inline lines ending in `fileName.split(".").pop()` —
 * a client string in the object key, which is how `x.jpg/../../evil` gets into
 * a storage path. `lib/infra/uploads.ts:84` derives it from the validated mime
 * for the same reason. Inline, the fix was unobservable: every test drove the
 * writer through `_storageStub`, which computes no key, so restoring the old
 * line left the whole suite green. Key derivation now lives in exactly one
 * place and that place has a test.
 *
 * Nothing the caller sent reaches the return value.
 */
export function avatarObjectKey(userId: string, mimeType: RasterMime): string {
  return `${userId}/${Date.now()}.${rasterExtension(mimeType)}`;
}

// ---------------------------------------------------------------------------
// Storage upload helper type (injectable for tests)
// ---------------------------------------------------------------------------

type StorageUploadResult = { storagePath: string; publicUrl: string };
type StorageUploadFn = (opts: {
  userId: string;
  /** The bytes, read ONCE by the caller — a 5 MiB blob is not materialised twice. */
  body: ArrayBuffer;
  /** The mime decided by the magic bytes — never the one the caller declared. */
  mimeType: RasterMime;
}) => Promise<StorageUploadResult>;

async function defaultStorageUpload({
  userId,
  body,
  mimeType,
}: {
  userId: string;
  body: ArrayBuffer;
  mimeType: RasterMime;
}): Promise<StorageUploadResult> {
  const supabase = createAdminClient();
  const storagePath = avatarObjectKey(userId, mimeType);

  const { error } = await supabase.storage.from("avatars").upload(storagePath, body, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) throw new Error(error.message);

  // Store the storage path; a signed URL can be generated at render time.
  // This avoids baking a 1-year expiry into the DB row and makes the avatarUrl
  // bucket-relative — easy to regenerate if the signed URL expires.
  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/avatars/${storagePath}`;
  return { storagePath, publicUrl };
}

// ---------------------------------------------------------------------------
// Writer: uploadAvatarForUser
// ---------------------------------------------------------------------------

export async function uploadAvatarForUser(
  userId: string,
  input: {
    fileBlob: Blob;
    /**
     * REACHES NOTHING. Wire compatibility with `uploadAvatarAction` only — not
     * the object key, not the audit row, not the upload. See the header.
     */
    fileName: string;
    /** The caller's CLAIM about the type. Recorded on disagreement; gates nothing. */
    mimeType: string;
    /**
     * IGNORED for every decision. The caller's CLAIM about the blob's size,
     * kept only for wire compatibility with `uploadAvatarAction`. The bound is
     * `fileBlob.size`; see this file's header for what happened when it wasn't.
     */
    fileSize?: number;
    // Escape hatch for tests — bypasses Supabase storage
    _storageStub?: StorageUploadFn;
  },
): Promise<UploadAvatarResult> {
  // 1a. THE decision, and it is taken off the blob. `fileBlob.size` is the
  // length of the bytes this process is holding — there is no wire field
  // between it and the upload for a caller to disagree with.
  if (input.fileBlob.size > MAX_IMAGE_BYTES) {
    return {
      error:
        "VALIDATION_ERROR: La imagen no puede superar los 5 MB. Probá con una foto más liviana.",
    };
  }

  // 1b. The type, likewise: the file signature decides, not `input.mimeType`.
  // An SVG, an HTML document or a ZIP labelled `image/jpeg` all die here — and
  // so does a real HEIC, which no branch of this accepts under any label.
  //
  // Read ONCE. `body` is handed to the upload function rather than re-read
  // there, so a 5 MiB photo is materialised a single time.
  const body = await input.fileBlob.arrayBuffer();
  const detectedMime = detectRasterMime(new Uint8Array(body));
  if (!detectedMime) {
    return {
      error:
        "VALIDATION_ERROR: El archivo debe ser una imagen JPG, PNG o WebP. Probá con otra foto.",
    };
  }

  // 2. Existence check
  const [current] = await db
    // avatarUrl is read for the audit row's `before` state — replacing an
    // avatar and setting the first one are different facts.
    .select({ id: profiles.id, avatarUrl: profiles.avatarUrl })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!current) return { error: "NOT_FOUND" };

  // 3. Upload
  const uploadFn = input._storageStub ?? defaultStorageUpload;

  let uploadResult: StorageUploadResult;
  try {
    uploadResult = await uploadFn({
      userId,
      body,
      mimeType: detectedMime,
    });
  } catch (err) {
    // Graceful failure: log to audit_log and return error.
    // Deliberately NOT transactional — there is no DB mutation to pair with;
    // the failed thing was a storage upload, and this row IS the whole fact.
    try {
      await writeAuditLog(db, {
        action: "profile_avatar_upload_failed",
        actorUserId: userId,
        targetUserId: userId,
        payload: {
          error: err instanceof Error ? err.message : String(err),
          // The validated facts, not the declared ones — an audit row that
          // records the caller's claim records the wrong number.
          mime_type: detectedMime,
          file_size: input.fileBlob.size,
        },
      });
    } catch {
      // Swallow audit failure — don't mask original error
    }
    return { error: `STORAGE_FAILED: ${err instanceof Error ? err.message : "unknown error"}` };
  }

  // 4+5. Update profile + audit — ONE transaction (2026-08-16). The storage
  // object is already written and cannot join a Postgres transaction, but the
  // profiles row pointing AT it and the record of who pointed it there are one
  // fact and must commit together.
  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({ avatarUrl: uploadResult.publicUrl, updatedAt: new Date() })
      .where(eq(profiles.id, userId));

    await writeAuditLog(tx, {
      action: "profile_avatar_updated",
      actorUserId: userId,
      targetUserId: userId,
      payload: {
        storage_path: uploadResult.storagePath,
        // RECORDED ONLY WHEN THEY DISAGREE. A mismatch is nearly always an
        // honest rename — `File.type` comes from the OS extension mapping, so
        // a JPEG saved as `.png` arrives declared PNG — and refusing it would
        // punish that person for nothing. But a polyglot deliberately labelled
        // to slip past a declared-type check has exactly the same shape, and
        // before this the success row recorded neither type, so it left no
        // trace anywhere. Writing the pair only on disagreement keeps the
        // signal without a false-positive tax on the ordinary upload.
        ...(input.mimeType !== detectedMime
          ? { mime_declared: input.mimeType, mime_detected: detectedMime }
          : {}),
      },
      before: { avatar_url: current.avatarUrl },
      after: { avatar_url: uploadResult.publicUrl },
    });
  });

  return { ok: true, avatarUrl: uploadResult.publicUrl };
}
