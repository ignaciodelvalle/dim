// Use-case: amendEvent — strangler migration 27/61.
//
// Pure writer: receives the validated auth context (user + pet + eventAuthorship)
// and input, runs the DB operations, and returns the result.
// No auth logic here — the outer shim (app/actions/amendment.ts) gates via
// requireAlivePetAccess.
//
// Amendment-of-amendment is allowed (D5 edge): the action always resolves the
// original target_event_id, so the chain stays one hop from the root event.

import { createHash } from "node:crypto";

import { auditLog, db, notifications, ownerships, petEvents, profiles } from "@/db";
import { deriveBulkIdempotencyKey, insertEventIdempotent } from "@/lib/events/event-idempotency";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { ADMIN_AMENDMENT_NOTIFICATION_TYPE, isAmendableEventType } from "@/lib/infra/amendment";
import type { PetEventAuthorship } from "@/lib/infra/pet-access";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { refreshPetCacheAfterAmendment } from "./refresh-pet-cache-after-amendment";
import type { AmendEventInput, AmendEventResult } from "./types";

/**
 * Server-derived idempotency key for an amendment (EL-F1). Deterministic in
 * (targetEventId, actorUserId, changes) so a double-click on "Corregir" that
 * fires the same correction twice dedupes at the DB unique index instead of
 * appending a second event_amended row (+ duplicate audit_log + notification).
 * Distinct corrections (different changes) still produce distinct keys and
 * append normally. No form/client change required.
 */
export function deriveAmendmentIdempotencyKey(
  targetEventId: string,
  actorUserId: string,
  changes: unknown,
): string {
  const changesHash = createHash("sha256")
    .update(JSON.stringify(changes ?? []))
    .digest("hex")
    .slice(0, 16);
  return deriveBulkIdempotencyKey(`amend:${targetEventId}:${changesHash}`, actorUserId);
}

export async function amendEvent(
  user: { id: string },
  pet: { id: string; name: string; publicToken: string },
  eventAuthorship: PetEventAuthorship,
  input: AmendEventInput,
): Promise<AmendEventResult> {
  const { publicToken, targetEventId, reason, changes } = input;

  // --- 2. Resolve target event + allowlist check (D4) ----------------------
  const [targetEvent] = await db
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(and(eq(petEvents.id, targetEventId), eq(petEvents.petId, pet.id)))
    .limit(1);

  if (!targetEvent) {
    return { ok: false, error: "Evento no encontrado." };
  }

  if (!isAmendableEventType(targetEvent.eventType)) {
    return {
      ok: false,
      error: `El tipo de evento "${targetEvent.eventType}" no admite enmiendas.`,
    };
  }

  // --- 3. Validate changes non-empty ----------------------------------------
  if (!changes || changes.length === 0) {
    return { ok: false, error: "Debés indicar al menos un cambio." };
  }

  // --- 4. Determine actor role + D5 sensitive path --------------------------
  // For v1 all access through requireAlivePetAccess is owner or org-shelter.
  // Admin/govt access is not yet routed through this page, but D5 is wired
  // here so when institutional actors gain pet access it works automatically.
  // We detect by checking profiles.role.
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const role = profile?.role ?? "owner";
  const isSensitive = role === "admin" || role === "govt";

  // D5: admin/govt reason is mandatory ≥5 chars.
  if (isSensitive) {
    if (!reason || reason.trim().length < 5) {
      return {
        ok: false,
        error:
          "El motivo es obligatorio para enmiendas de administrador/gobierno (mínimo 5 caracteres).",
      };
    }
  }

  // --- 5. Amendment-of-amendment: always reference the ORIGINAL event -------
  // If targetEvent is itself an event_amended, we follow its target_event_id
  // so the chain is always one hop from the root (auditable, not deeply nested).
  let resolvedTargetEventId = targetEvent.id;
  if (targetEvent.eventType === "event_amended") {
    const targetPayload = targetEvent.payload as Record<string, unknown>;
    if (typeof targetPayload.target_event_id === "string") {
      resolvedTargetEventId = targetPayload.target_event_id;
    }
  }

  // --- 6. Build + validate the amendment payload ----------------------------
  const rawPayload = {
    target_event_id: resolvedTargetEventId,
    reason: reason?.trim() ?? null,
    changes,
    actor_role: (role === "vet"
      ? "vet"
      : role === "admin"
        ? "admin"
        : role === "govt"
          ? "govt"
          : "owner") as "owner" | "vet" | "admin" | "govt",
    actor_user_id: user.id,
  };

  const validatedPayload = validateEventPayload("event_amended", rawPayload) as Record<
    string,
    unknown
  >;

  // --- 7. Insert the amendment event + refresh the denormalized pets cache --
  // ONE transaction: the amendment fact and the cache refresh it invalidates
  // commit together (Invariant #3 — a correction must supersede in the pets.*
  // caches too, not only in the projection read boundaries). The D5 audit +
  // notify writes join the same tx so a partial correction can never surface.
  const now = new Date();
  // EL-F1: server-derived key so an identical rapid resubmit dedupes.
  const idempotencyKey = deriveAmendmentIdempotencyKey(resolvedTargetEventId, user.id, changes);
  let amendmentEventId: string;
  try {
    amendmentEventId = await db.transaction(async (tx) => {
      // Route the append through the idempotency path (advisory lock + partial
      // unique index) instead of a raw insert (EL-F1): a double-submit with the
      // same key is a no-op that returns the original row rather than appending
      // a second event_amended (+ duplicate audit_log + notification).
      const { event: amendmentEvent, wasNoop } = await insertEventIdempotent(
        {
          petId: pet.id,
          eventType: "event_amended",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: eventAuthorship.authorRole,
          authorOrganizationId: eventAuthorship.authorOrganizationId,
          authorVerified: eventAuthorship.authorVerified,
          payload: validatedPayload,
          notes: null,
          clientIdempotencyKey: idempotencyKey,
        },
        tx as Parameters<typeof insertEventIdempotent>[1],
      );

      // Identical resubmit → the amendment already exists. Skip the cache
      // refresh, audit_log and notification so the append-only log isn't
      // polluted with duplicate correction side effects.
      if (wasNoop) return amendmentEvent.id;

      // Re-derive any pets cache column the corrected (root) event feeds. Reads
      // the full stream INCLUDING the row just inserted, so the correction is
      // already overlaid. Keyed by the root event's type — no pets.* UPDATE is
      // append-only-guarded (only pet_events is), so a plain UPDATE is fine.
      await refreshPetCacheAfterAmendment(tx, pet.id, resolvedTargetEventId);

      // --- D5 sensitive path: audit_log + notify owner ---------------------
      if (isSensitive) {
        await tx.insert(auditLog).values({
          actorUserId: user.id,
          action: "event_amended_sensitive",
          targetUserId: null,
          targetOrganizationId: null,
          payload: {
            pet_id: pet.id,
            target_event_id: resolvedTargetEventId,
            amendment_event_id: amendmentEvent.id,
            reason: reason?.trim(),
            changes,
            actor_role: rawPayload.actor_role,
          },
        });

        // Find the active owner of the pet to notify.
        const [ownerRow] = await tx
          .select({ userId: ownerships.ownerUserId })
          .from(ownerships)
          .where(
            and(
              eq(ownerships.petId, pet.id),
              eq(ownerships.role, "owner"),
              isNull(ownerships.endedAt),
            ),
          )
          .limit(1);

        if (ownerRow?.userId && ownerRow.userId !== user.id) {
          await tx.insert(notifications).values({
            userId: ownerRow.userId,
            notificationType: ADMIN_AMENDMENT_NOTIFICATION_TYPE,
            title: "Un administrador corrigió un registro de tu mascota",
            body: `Se corrigió un registro de **${pet.name}**. El original sigue visible en el historial. Motivo: ${reason?.trim() ?? "(sin especificar)"}.`,
            severity: "warning",
            ctaLabel: "Ver historial",
            ctaUrl: `/mis-mascotas/${pet.publicToken}?tab=historial`,
            relatedPetId: pet.id,
            relatedEventId: amendmentEvent.id,
          });
        }
      }

      return amendmentEvent.id;
    });
  } catch {
    return { ok: false, error: "Error al guardar la enmienda. Intentá de nuevo." };
  }

  // --- 9. Revalidate paths --------------------------------------------------
  revalidatePath(`/mis-mascotas/${publicToken}`);
  revalidatePath(`/mis-mascotas/${publicToken}/eventos/${targetEventId}`);

  return { ok: true, amendmentEventId };
}
