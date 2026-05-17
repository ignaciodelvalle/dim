"use server";

// User self-service profile actions (Slice 3a).
//
// Writer/wrapper pattern (matches admin-institutional.ts):
//   - Inner writers (updateProfileForUser, uploadAvatarForUser) are exported
//     for tests — no Next.js runtime dependency.
//   - Public wrappers (updateProfileAction, uploadAvatarAction) gate via
//     requireUserOrRedirect and call revalidatePath.
//
// Storage bucket: "avatars" (private).
//   - If bucket is missing, uploadAvatarForUser fails gracefully and logs
//     'profile_avatar_upload_failed' to audit_log.
//   - A _storageStub escape hatch lets tests inject a fake upload function.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

import { auditLog, db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Exported result types
// ---------------------------------------------------------------------------

export type UpdateProfileResult = { error: string } | { ok: true };

export type UploadAvatarResult = { error: string } | { ok: true; avatarUrl: string };

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

// Argentine phone — accepts common formats:
//   +54 9 11 1234-5678 | +5491112345678 | 011 15-1234-5678 | 11 1234-5678
// We allow empty string (caller sets phone to null when empty).
const AR_PHONE_RE =
  /^(\+?54\s?9?\s?\d{2,4}[\s-]?\d{4}[\s-]?\d{4}|0\d{2,4}\s?(?:15[\s-]?)?\d{4}[\s-]?\d{4}|\d{2,4}[\s-]?\d{4}[\s-]?\d{4})$/;

const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(80, "El nombre no puede superar 80 caracteres")
    .trim(),
  // phone semantics:
  //   undefined  → caller did not include phone in the update; leave DB value unchanged
  //   ""         → caller explicitly cleared phone; set to null in DB
  //   string     → validate AR format, then store as-is
  phone: z
    .string()
    .optional()
    .refine((v) => v === undefined || v === "" || AR_PHONE_RE.test(v.replace(/\s/g, " ").trim()), {
      message: "El teléfono no tiene un formato argentino válido",
    }),
});

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
// Inner writer: updateProfileForUser
// ---------------------------------------------------------------------------

export async function updateProfileForUser(
  userId: string,
  input: { displayName: string; phone?: string },
): Promise<UpdateProfileResult> {
  // 1. Validate
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: `VALIDATION_ERROR: ${firstError.message}` };
  }
  const { displayName, phone } = parsed.data;

  // 2. Load current profile for before-values + existence check
  const [current] = await db
    .select({ displayName: profiles.displayName, phone: profiles.phone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!current) return { error: "NOT_FOUND" };

  // 3. Build changed_fields + before_values for the audit payload
  const changedFields: string[] = [];
  const beforeValues: Record<string, unknown> = {};

  if (displayName !== current.displayName) {
    changedFields.push("displayName");
    beforeValues.displayName = current.displayName;
  }

  // phone: undefined → don't touch DB value.
  //        ""        → clear (set to null).
  //        string    → validate passed, store as-is.
  const phoneIsProvided = phone !== undefined;
  const newPhone = phoneIsProvided ? (phone === "" ? null : phone) : current.phone;
  if (newPhone !== current.phone) {
    changedFields.push("phone");
    beforeValues.phone = current.phone;
  }

  // 4. Update profiles
  const updateSet: Record<string, unknown> = {
    displayName,
    updatedAt: new Date(),
  };
  if (phoneIsProvided) {
    updateSet.phone = phone === "" ? null : phone;
  }

  await db.update(profiles).set(updateSet).where(eq(profiles.id, userId));

  // 5. Insert audit_log
  await db.insert(auditLog).values({
    actorUserId: userId,
    action: "profile_self_updated",
    targetUserId: userId,
    payload: {
      changed_fields: changedFields,
      before_values: beforeValues,
    },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public wrapper: updateProfileAction
// ---------------------------------------------------------------------------

export async function updateProfileAction(input: {
  displayName: string;
  phone?: string;
}): Promise<UpdateProfileResult> {
  const { user } = await requireUserOrRedirect();
  const result = await updateProfileForUser(user.id, input);
  if ("ok" in result) {
    revalidatePath("/cuenta");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inner writer: uploadAvatarForUser
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
    .select({ id: profiles.id })
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
    // Graceful failure: log to audit_log and return error
    try {
      await db.insert(auditLog).values({
        actorUserId: userId,
        action: "profile_avatar_upload_failed",
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

  // 4. Update profile
  await db
    .update(profiles)
    .set({ avatarUrl: uploadResult.publicUrl, updatedAt: new Date() })
    .where(eq(profiles.id, userId));

  // 5. Audit log
  await db.insert(auditLog).values({
    actorUserId: userId,
    action: "profile_avatar_updated",
    targetUserId: userId,
    payload: {
      storage_path: uploadResult.storagePath,
    },
  });

  return { ok: true, avatarUrl: uploadResult.publicUrl };
}

// ---------------------------------------------------------------------------
// Public wrapper: uploadAvatarAction
// ---------------------------------------------------------------------------

export async function uploadAvatarAction(input: {
  fileBlob: Blob;
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<UploadAvatarResult> {
  const { user } = await requireUserOrRedirect();
  const result = await uploadAvatarForUser(user.id, input);
  if ("ok" in result) {
    revalidatePath("/cuenta");
  }
  return result;
}
