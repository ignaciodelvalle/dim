// Pre-upload use-case for revocation evidence attachments.
//
// The client uploads the file to Supabase Storage directly, then calls
// this function with the resulting storage path + metadata. The function creates
// an `attachments` row with all foreign-keys NULL (no audit_log_id yet).
// The revocation writer later "claims" the attachment by setting audit_log_id
// inside the transaction.
//
// Design §2f, spec REQ-6.

import { eq } from "drizzle-orm";

import { attachments, db, profiles } from "@/db";

export type UploadEvidenceInput = {
  storagePath: string;
  mimeType: string;
  fileSize?: number | null;
};

export type UploadEvidenceResult = { attachmentId: string } | { error: string };

// Validates that the caller is an admin or govt user, then inserts an
// attachments row with all FKs NULL. Returns the new attachment id.
//
// Note: this action deliberately does NOT call requireAdminOrGovtOrRedirect
// (which redirects) — it returns a typed error so the caller can handle it
// without a page redirect (the upload is triggered from a form, not a page
// navigation).
//
// @no-auth-required: caller passes `actorUserId`; the role check below
// (admin | govt) IS the auth gate. Matches the inner-writer contract but
// the name doesn't end in `ForUser`/`ForAuthority` — renaming is a
// follow-up. The role check stays inline for the typed-error return shape.
export async function uploadRevocationEvidence(
  actorUserId: string,
  input: UploadEvidenceInput,
): Promise<UploadEvidenceResult> {
  // Capability check — only admin/govt may upload revocation evidence.
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, actorUserId))
    .limit(1);
  if (!profile || (profile.role !== "admin" && profile.role !== "govt")) {
    return { error: "Solo admin o govt pueden subir evidencia de revocación." };
  }

  const [row] = await db
    .insert(attachments)
    .values({
      uploadedByUserId: actorUserId,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      fileSize: input.fileSize ?? null,
      // All domain FKs stay NULL at upload time — claimed by the writer.
    })
    .returning({ id: attachments.id });

  return { attachmentId: row.id };
}
