import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { attachments, db, ownerships } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { EraseSubjectDataResult } from "./types";

// Storage objects the RPC cannot reach (SQL has no object-store access): pet
// photos and event attachments hanging off the subject's owned pets. Each
// attachment row's bucket is inferred from its shape — an attachment carrying an
// event_id is an event attachment (private bucket); one with only a pet_id is a
// pet photo (public bucket), mirroring lib/infra/storage.ts.
async function purgeOwnedPetAttachments(userId: string): Promise<void> {
  // Owned pets (active custody). ownerships rows survive the RPC (only pets are
  // soft-deleted), so this resolves correctly whether run before or after it.
  //
  // role = 'owner' is load-bearing: ownerships also holds foster / caretaker /
  // shelter_custody rows under the SAME owner_user_id (foster-repository.ts
  // inserts role:'foster'). Without this filter the irreversible Storage delete
  // would purge the photos + event attachments of pets the subject merely
  // fosters/caretakes — third-party data. A true owner erasing their account is
  // correct; a foster is not.
  const owned = await db
    .select({ petId: ownerships.petId })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    );
  const petIds = owned.map((o) => o.petId);
  if (petIds.length === 0) return;

  // Event attachments carry pet_id too (schema.ts), so `pet_id IN (owned)`
  // captures both pet photos and event attachments on the subject's pets.
  const rows = await db
    .select({
      id: attachments.id,
      storagePath: attachments.storagePath,
      eventId: attachments.eventId,
    })
    .from(attachments)
    .where(inArray(attachments.petId, petIds));
  if (rows.length === 0) return;

  const eventPaths = rows.filter((r) => r.eventId !== null).map((r) => r.storagePath);
  const photoPaths = rows.filter((r) => r.eventId === null).map((r) => r.storagePath);

  const admin = createAdminClient();
  if (eventPaths.length > 0) {
    await admin.storage.from("event-attachments").remove(eventPaths);
  }
  if (photoPaths.length > 0) {
    await admin.storage.from("pet-photos").remove(photoPaths);
  }

  // Drop the DB rows too — storage_path + caption are the subject's data.
  await db.delete(attachments).where(
    inArray(
      attachments.id,
      rows.map((r) => r.id),
    ),
  );
}

export async function eraseMySubjectDataAction(reason: string): Promise<EraseSubjectDataResult> {
  const { user } = await requireUserOrRedirect();
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: "Indicá brevemente el motivo (mínimo 5 caracteres)." };
  }

  const supabase = await createClient();

  // Step 1 — redact the application-side subject data. The RPC soft-deletes the
  // profile, hashes/nulls every PII column, scrubs filed reports/transfers, and
  // (Wave D2, migration 0129) redacts third-party PII in owned-pet event
  // payloads. Must run BEFORE the auth row is deleted: the RPC authorizes on
  // auth.uid() and the trigger override it emits is attributed to that uid.
  const { error } = await supabase.rpc("erase_subject_data", {
    p_user_id: user.id,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // Step 2 — delete the auth.users row (Ley 25.326 art. 16). Without this the
  // email + password hash survive forever and the subject can simply log back in
  // to an account whose PII is already gone. Uses the service-role admin client
  // (the anon/cookie client cannot delete auth users). A failure here must NOT
  // block completion: the app-side data is already erased, so we log and still
  // report success — a residual auth row is a follow-up cleanup, not a reason to
  // leave the subject staring at an error after their data is gone.
  try {
    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("[erase-subject-data] auth.users deletion failed", {
        userId: user.id,
        message: deleteError.message,
      });
    }
  } catch (err) {
    console.error("[erase-subject-data] auth.users deletion threw", {
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 3 — purge Storage objects the RPC cannot reach (pet photos + event
  // attachments on the subject's owned pets, Ley 25.326 art. 16 — audit 27-#5).
  // Best-effort like the auth deletion: a Storage hiccup must not leave the
  // subject staring at an error after their DB data is already gone.
  try {
    await purgeOwnedPetAttachments(user.id);
  } catch (err) {
    console.error("[erase-subject-data] attachment/storage purge failed", {
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Drop the session — the profile row is now soft-deleted + PII hashed and the
  // auth row is gone.
  await supabase.auth.signOut();
  revalidatePath("/");
  return { ok: true };
}
