import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { attachments, db, ownerships, petCaretakerGrants, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import {
  endCaretakerArrangementsForPet,
  endCaretakerGrantAtomically,
} from "@/lib/infra/end-pet-ownerships";
import { createNotification } from "@/lib/infra/notification-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { EraseSubjectDataResult } from "./types";

// ---------------------------------------------------------------------------
// ERRATA — the retention rationale written into the migrations is FALSE
// ---------------------------------------------------------------------------
// Migrations are immutable, so the wrong premise cannot be corrected where it
// was written. It is corrected HERE, at the live code site, so nobody inherits
// it by reading the migration headers:
//
//   * 0059_subject_rights_rpcs.sql:102-104 — "sus eventos sanitarios (libreta)
//     se preservan para la conservación obligatoria por norma (Res. SENASA,
//     Ley 14.072 ejercicio profesional, etc)".
//   * 0159_erase_subject_data_free_text_payload_keys.sql:6-7 — "retains
//     sanitary events by design (SENASA/Ord. CABA 41.831/Ley 14.072 retention
//     — see app/(app)/cuenta/privacidad/page.tsx)".
//
// Both cite the privacy page, and the privacy page cited them back. The claim
// was verified against docs/legal-framework-full.md and does not hold:
//   1. Ord. CABA 41.831 imposes registration and reporting duties on the OWNER
//      (art. 23 inscription at four months; art. 25 report of transfer, baja or
//      death). It fixes no event-log retention period at all.
//   2. Ley 14.072/1951 regulates the professional practice of veterinary
//      medicine (matriculación); it is not a data-retention rule, and its reach
//      is national/CABA — not a duty binding this system for a user in Salta.
//   3. No SENASA resolution in docs/legal-framework-full.md establishes a
//      retention period for these records either.
//
// Consequence: retention here is a PRODUCT decision (the health history
// outlives a single owner), not a legal obligation — and it may NOT be used to
// refuse a supresión request under Ley 25.326 art. 16 inc. 5, which permits
// refusal only "cuando existiera una obligación legal de conservar los datos".
// The user-facing copy was corrected accordingly (2026-08-17).
//
// This errata records what we SAY. It deliberately changes nothing about what
// we DO: the retention period itself is still an open PO + legal decision —
// docs/architecture/retention-policy-pending-decision.md. Do not add purge
// logic here on the strength of this note.
// ---------------------------------------------------------------------------

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

/**
 * END EVERY LIVE CARETAKER ARRANGEMENT THE SUBJECT IS PART OF — and why this is
 * here rather than inside `erase_subject_data`.
 *
 * Migration 0205 brought `pet_caretaker_grants` into both RPCs, but it scrubs
 * PII and flips PENDING invitations only. It deliberately does not flip an
 * ACCEPTED grant, because ending one is THREE writes that must land together —
 * close the `ownerships` row, emit `caretaker_ended`, flip the grant — and
 * there is exactly ONE definition of them, `endCaretakerGrantAtomically()`.
 * A status flip in SQL with no event would leave a grant the spine cannot
 * explain: `detect-pet-cache-drift` reports `pet_caretaker_ownership_drift`,
 * `rederive-pet-ownerships` reports the ownership row's `ended_at` as
 * unmatched, and `lib/projections/pet-caretaker.ts` leaves the interval open
 * forever. Invariant #3 is not negotiable for a compliance path either.
 *
 * The split follows the domain's own line, stated in lib/infra/end-pet-ownerships.ts:
 * "ACCEPTED → ended, through the atomic three-step. The arrangement happened,
 * so the spine owes an ending fact. PENDING → cancelled, a plain status flip
 * with no event." The RPC does the pending side; this does the accepted side.
 *
 * WHY IT RUNS FIRST. The RPC soft-deletes the subject's pets and cancels the
 * pending invitations on them. Leaving a live grant behind either way is the
 * zombie `caretakers-repository.ts` documents — an ownership row that still
 * grants write access on an animal, and a caretaker contact that
 * `caretaker-public-contact.ts` may still publish on a public credential,
 * because it decides that from the GRANT alone and never joins `ownerships`.
 *
 * BEST-EFFORT, like the Storage purge. A failure here is logged and does not
 * abort the erasure: the subject's right does not depend on our bookkeeping.
 */
async function endCaretakerArrangementsForErasure(userId: string): Promise<void> {
  const now = new Date();

  // A — the subject IS the caretaker of somebody else's animal. `withdraw` is
  // the domain's own name for this case: grant-state.ts defines it as "the
  // caretaker stepped down, or their account was deactivated/erased".
  const asCaretaker = await db
    .select({
      grantId: petCaretakerGrants.id,
      ownershipId: petCaretakerGrants.ownershipId,
      petId: petCaretakerGrants.petId,
      endsAt: petCaretakerGrants.endsAt,
      grantedByUserId: petCaretakerGrants.grantedByUserId,
      petName: pets.name,
      petPublicToken: pets.publicToken,
    })
    .from(petCaretakerGrants)
    .innerJoin(pets, eq(pets.id, petCaretakerGrants.petId))
    .where(
      and(
        eq(petCaretakerGrants.caretakerUserId, userId),
        eq(petCaretakerGrants.status, "accepted"),
      ),
    );

  for (const grant of asCaretaker) {
    // `ownership_id` is NOT NULL on an accepted row by the biconditional accept
    // CHECK (0192), but the column is nullable, so the type is honest and so is
    // this guard.
    const { ownershipId } = grant;
    if (ownershipId === null) continue;
    await db.transaction((tx) =>
      endCaretakerGrantAtomically(
        {
          grantId: grant.grantId,
          ownershipId,
          petId: grant.petId,
          outcome: "withdrawn_by_caretaker",
          endsAt: grant.endsAt,
          now,
          actorUserId: userId,
        },
        tx,
      ),
    );
    // The TITULAR has to be told: their animal may still be physically with the
    // person whose access just closed. The copy does NOT say why — that an
    // account was erased is the counterparty's own exercise of a legal right,
    // not news this product owes a third party.
    await createNotification({
      userId: grant.grantedByUserId,
      notificationType: "caretaker_grant_ended",
      severity: "warning",
      category: "custody",
      title: `El cuidado temporal de ${grant.petName} terminó`,
      body: `Volvés a tener el acceso completo a ${grant.petName}. Si el animal sigue con la persona que lo cuidaba, coordiná la devolución con ella.`,
      ctaLabel: "Ver mis mascotas",
      ctaUrl: grant.petPublicToken ? `/mis-mascotas/${grant.petPublicToken}` : "/mis-mascotas",
      relatedPetId: grant.petId,
      dedupeKey: `caretaker:grant_ended:${grant.grantId}:${grant.grantedByUserId}`,
    });
  }

  // B — the subject is the TITULAR. Every live arrangement on every animal they
  // own ends with them: `endCaretakerArrangementsForPet` does BOTH halves (the
  // atomic three-step for accepted, a plain flip for pending), so the pending
  // ones the RPC would also cancel are simply already cancelled by the time it
  // runs and it counts zero. Two paths cancelling the same row is idempotent;
  // neither path cancelling it is the invitation an erased owner's pet accepts
  // months later.
  const ownedPets = await db
    .select({ petId: ownerships.petId, name: pets.name, publicToken: pets.publicToken })
    .from(ownerships)
    .innerJoin(pets, eq(pets.id, ownerships.petId))
    .where(
      and(
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    );

  for (const pet of ownedPets) {
    const { endedCaretakerGrants } = await db.transaction((tx) =>
      endCaretakerArrangementsForPet(
        { petId: pet.petId, outcome: "revoked_by_owner", actorUserId: userId, now },
        tx,
      ),
    );
    // MUST be after the transaction commits (ARCH-P): a notification failure may
    // not roll back an erasure step. createNotification dead-letters rather than
    // throwing, so this cannot fail the caller.
    for (const ended of endedCaretakerGrants) {
      if (ended.caretakerUserId === null) continue;
      await createNotification({
        userId: ended.caretakerUserId,
        notificationType: "caretaker_grant_ended",
        severity: "warning",
        category: "custody",
        title: `Tu período de cuidado de ${pet.name} terminó`,
        body: `Ya no tenés acceso para cargar eventos de ${pet.name}. Si el animal sigue con vos, coordiná la entrega con quien lo tiene a cargo ahora.`,
        ctaLabel: "Ver mis mascotas",
        ctaUrl: "/mis-mascotas",
        relatedPetId: pet.petId,
        dedupeKey: `caretaker:grant_ended:${ended.grantId}:${ended.caretakerUserId}`,
      });
    }
  }
}

export async function eraseMySubjectDataAction(reason: string): Promise<EraseSubjectDataResult> {
  const { user } = await requireUserOrRedirect();
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: "Indicá brevemente el motivo (mínimo 5 caracteres)." };
  }

  const supabase = await createClient();

  // Step 0 — end every live caretaker arrangement through the spine's one
  // writer, BEFORE the RPC soft-deletes the pets and cancels the pending
  // invitations on them. See the function's own header for why this cannot live
  // inside erase_subject_data.
  try {
    await endCaretakerArrangementsForErasure(user.id);
  } catch (err) {
    console.error("[erase-subject-data] caretaker arrangement close failed", {
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

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
