// upload-avatar.ts — uploadAvatarForUser use-case.
//
// Validates mime type + file size, checks profile existence, uploads to the
// "avatars" private Supabase Storage bucket (or a test stub), updates the
// profiles row, and inserts an audit_log entry.
// Storage bucket: "avatars" (private).
//   - If bucket is missing, uploadAvatarForUser fails gracefully and logs
//     'profile_avatar_upload_failed' to audit_log.
//   - A _storageStub escape hatch lets tests inject a fake upload function.

import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db, profiles } from "@/db";
import { writeAuditLog } from "@/lib/infra/audit-log";
import { createAdminClient } from "@/lib/supabase/admin";

import type { UploadAvatarResult } from "./types";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const uploadAvatarSchema = z.object({
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    error: "Solo se aceptan imágenes JPEG, PNG o WebP",
  }),
  fileSize: z.number().max(MAX_FILE_SIZE_BYTES, "La imagen no puede superar 2 MB"),
  fileName: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Storage upload helper type (injectable for tests)
// ---------------------------------------------------------------------------

type StorageUploadResult = { storagePath: string; publicUrl: string };
type StorageUploadFn = (opts: {
  userId: string;
  fileName: string;
  fileBlob: Blob;
  mimeType: string;
}) => Promise<StorageUploadResult>;

async function defaultStorageUpload({
  userId,
  fileName,
  fileBlob,
  mimeType,
}: {
  userId: string;
  fileName: string;
  fileBlob: Blob;
  mimeType: string;
}): Promise<StorageUploadResult> {
  const supabase = createAdminClient();
  const ext = fileName.split(".").pop() ?? "jpg";
  const storagePath = `${userId}/${Date.now()}.${ext}`;

  const arrayBuffer = await fileBlob.arrayBuffer();
  const { error } = await supabase.storage.from("avatars").upload(storagePath, arrayBuffer, {
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
    fileName: string;
    mimeType: string;
    fileSize: number;
    // Escape hatch for tests — bypasses Supabase storage
    _storageStub?: StorageUploadFn;
  },
): Promise<UploadAvatarResult> {
  // 1. Validate mime + size
  const parsed = uploadAvatarSchema.safeParse({
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    fileName: input.fileName,
  });
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: `VALIDATION_ERROR: ${firstError.message}` };
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
      fileName: input.fileName,
      fileBlob: input.fileBlob,
      mimeType: input.mimeType,
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
          mime_type: input.mimeType,
          file_size: input.fileSize,
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
      payload: { storage_path: uploadResult.storagePath },
      before: { avatar_url: current.avatarUrl },
      after: { avatar_url: uploadResult.publicUrl },
    });
  });

  return { ok: true, avatarUrl: uploadResult.publicUrl };
}
