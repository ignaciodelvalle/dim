"use server";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod/v4";

import { auditLog, db, notifications, ownerships, petEvents, pets, profiles } from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Reason sets per actor kind
// ---------------------------------------------------------------------------

const OWNER_REASONS = [
  "damaged",
  "unreadable",
  "owner_request",
  "device_failure",
  "other",
] as const;

const VET_REASONS = [...OWNER_REASONS, "duplicate_detected"] as const;

const ADMIN_REASONS = [...VET_REASONS, "fraud_detected"] as const;

// new_chip_number=null (pure revocation) is only valid for these reasons.
const REVOCATION_REASONS = ["fraud_detected", "device_failure", "owner_request"] as const;

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const replaceMicrochipSchema = z.object({
  petId: z.string().uuid(),
  previousChipNumber: z.string().min(1),
  newChipNumber: z.string().nullable(),
  reason: z.enum([
    "damaged",
    "unreadable",
    "duplicate_detected",
    "fraud_detected",
    "owner_request",
    "device_failure",
    "other",
  ]),
  replacedBy: z.string().nullable().optional(),
  replacedAt: z.string(),
  notes: z.string().nullable().optional(),
  actorContext: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("owner") }),
    z.object({ kind: z.literal("vet_in_org"), organizationId: z.string().uuid() }),
    z.object({ kind: z.literal("admin") }),
  ]),
});

export type ReplaceMicrochipInput = z.infer<typeof replaceMicrochipSchema>;

export type ReplaceMicrochipResult =
  | { ok: true; eventId: string; caseId: string | null }
  | { error: string };

// ---------------------------------------------------------------------------
// Inner writer — testable without Next.js request context.
//
// The outer action (replaceMicrochipAction) gates via the Supabase session.
// Tests call replaceMicrochipForUser directly with a known userId.
// ---------------------------------------------------------------------------

export async function replaceMicrochipForUser(
  userId: string,
  rawInput: ReplaceMicrochipInput,
): Promise<ReplaceMicrochipResult> {
  let parsed: ReplaceMicrochipInput;
  try {
    parsed = replaceMicrochipSchema.parse(rawInput);
  } catch (err) {
    return {
      error: `Invalid input: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Validate allowed reasons per actor kind.
  const allowedReasons: readonly string[] =
    parsed.actorContext.kind === "owner"
      ? OWNER_REASONS
      : parsed.actorContext.kind === "vet_in_org"
        ? VET_REASONS
        : ADMIN_REASONS;

  if (!allowedReasons.includes(parsed.reason)) {
    return {
      error: `Reason '${parsed.reason}' not allowed for actor '${parsed.actorContext.kind}'.`,
    };
  }

  // Validate that pure revocation (newChipNumber=null) uses a terminal reason.
  if (
    parsed.newChipNumber === null &&
    !(REVOCATION_REASONS as readonly string[]).includes(parsed.reason)
  ) {
    return {
      error:
        "Pure revocation (newChipNumber=null) requires reason 'fraud_detected', 'device_failure', or 'owner_request'.",
    };
  }

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];
  let result: { ok: true; eventId: string; caseId: string | null };

  try {
    result = await db.transaction(async (tx) => {
      // Load the pet.
      const [pet] = await tx.select().from(pets).where(eq(pets.id, parsed.petId)).limit(1);
      if (!pet) throw new Error("Pet not found.");

      // Actor-pet gate.
      if (parsed.actorContext.kind === "owner") {
        const [ownership] = await tx
          .select({ id: ownerships.id })
          .from(ownerships)
          .where(
            and(
              eq(ownerships.petId, pet.id),
              eq(ownerships.ownerUserId, userId),
              isNull(ownerships.endedAt),
            ),
          )
          .limit(1);
        if (!ownership) throw new Error("No active ownership for this user on this pet.");
      } else if (parsed.actorContext.kind === "vet_in_org") {
        const [custody] = await tx
          .select({ id: ownerships.id })
          .from(ownerships)
          .where(
            and(
              eq(ownerships.petId, pet.id),
              eq(ownerships.ownerOrganizationId, parsed.actorContext.organizationId),
              isNull(ownerships.endedAt),
              inArray(ownerships.role, ["shelter_custody", "foster"]),
            ),
          )
          .limit(1);
        if (!custody)
          throw new Error(
            "Organization does not hold active shelter_custody or foster on this pet.",
          );
      } else {
        // admin — verify caller actually has admin role.
        const [profile] = await tx
          .select({
            role: profiles.role,
            accountType: profiles.accountType,
            deactivatedAt: profiles.deactivatedAt,
          })
          .from(profiles)
          .where(eq(profiles.id, userId))
          .limit(1);
        if (
          !profile ||
          profile.role !== "admin" ||
          profile.accountType !== "institutional" ||
          profile.deactivatedAt !== null
        ) {
          throw new Error("Caller does not have active admin role.");
        }
      }

      // Cross-pet duplicate scan — only for duplicate_detected.
      let secondaryPetId: string | null = null;
      if (parsed.reason === "duplicate_detected") {
        const dupes = await tx
          .select({ id: pets.id })
          .from(pets)
          .where(
            and(
              eq(pets.microchipId, parsed.previousChipNumber),
              ne(pets.id, pet.id),
              // pets has no deletedAt; filter out deceased/lost to find active duplicates.
              inArray(pets.status, ["active", "lost"]),
            ),
          )
          .limit(1);
        secondaryPetId = dupes[0]?.id ?? null;
      }

      // Open a microchip_remediation case for fraud or duplicate reasons.
      let caseId: string | null = null;
      if (parsed.reason === "fraud_detected" || parsed.reason === "duplicate_detected") {
        const secondaryNote = secondaryPetId ? ` secondaryPetId=${secondaryPetId}` : "";
        const caseRow = await openCase(
          {
            kind: "microchip_remediation",
            primarySubjectKind: "registered_pet",
            primaryPetId: pet.id,
            jurisdictionProvince: pet.jurisdictionProvince,
            jurisdictionLocality: pet.jurisdictionLocality,
            openedByUserId: userId,
            openedReason: `auto: microchip_replaced reason=${parsed.reason}${secondaryNote}`,
          },
          tx,
        );
        caseId = caseRow.id;
      }

      // Resolve authorship fields — inlined per decision (no separate helper for
      // a single action).
      //
      // authorRole maps actorContext.kind to the petEvents DB enum
      // ["owner","scanner","vet","shelter","govt","system"]. The DB enum has no
      // "admin" value; admin actors map to "govt" here (platform authority).
      // The event payload carries actor_role="admin" separately via the Zod
      // schema, which does allow it.
      const authorRole =
        parsed.actorContext.kind === "owner"
          ? ("owner" as const)
          : parsed.actorContext.kind === "vet_in_org"
            ? ("vet" as const)
            : ("govt" as const);

      const authorOrganizationId =
        parsed.actorContext.kind === "vet_in_org" ? parsed.actorContext.organizationId : null;

      // For authorVerified: vets/admins acting in an org context are considered
      // verified; owners are not. This mirrors the intake.ts pattern where
      // `organization.verified` is spread into the event.
      const authorVerified = parsed.actorContext.kind !== "owner";

      // Build and validate the event payload.
      const eventPayload = validateEventPayload("microchip_replaced", {
        previous_chip_number: parsed.previousChipNumber,
        new_chip_number: parsed.newChipNumber,
        reason: parsed.reason,
        replaced_by: parsed.replacedBy ?? null,
        replaced_at: parsed.replacedAt,
        actor_role: authorRole,
        actor_user_id: userId,
        notes: parsed.notes ?? null,
      });

      const now = new Date();

      // Insert the event row.
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "microchip_replaced",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: userId,
          authorRole,
          authorOrganizationId,
          authorVerified,
          payload: eventPayload,
          caseId,
        })
        .returning();

      // Update pets.microchipId (the denormalized chip column).
      await tx
        .update(pets)
        .set({ microchipId: parsed.newChipNumber, updatedAt: now })
        .where(eq(pets.id, pet.id));

      // Write audit_log row. The audit_log table has no targetPetId column;
      // pet identity is carried in the JSONB payload alongside event_id.
      await tx.insert(auditLog).values({
        actorUserId: userId,
        action: "microchip.replace",
        payload: {
          reason: parsed.reason,
          actor_context_kind: parsed.actorContext.kind,
          event_id: event.id,
          case_id: caseId,
          target_pet_id: pet.id,
        },
      });

      // Build notifications inside the tx so they share the case/event IDs,
      // but collect into pendingNotifications and insert outside the tx
      // (same pattern as intake.ts and cross-org-transfer.ts — notification
      // failure must not roll back the committed mutation).

      if (parsed.reason === "fraud_detected") {
        // Fan out to all active institutional admins.
        const admins = await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(
            and(
              eq(profiles.role, "admin"),
              eq(profiles.accountType, "institutional"),
              isNull(profiles.deactivatedAt),
            ),
          );
        for (const admin of admins) {
          pendingNotifications.push({
            userId: admin.id,
            notificationType: "microchip_fraud_detected",
            severity: "urgent",
            title: `Microchip fraud detected — ${pet.name}`,
            body: `A microchip_replaced event with reason='fraud_detected' was emitted for ${pet.name}. Review case ${caseId}.`,
            relatedPetId: pet.id,
            relatedCaseId: caseId,
            relatedEventId: event.id,
          });
        }
      }

      if (parsed.reason === "duplicate_detected" && secondaryPetId) {
        // Fan out to govt users covering the jurisdiction, falling back to admins.
        const govtOrAdminIds =
          pet.jurisdictionProvince && pet.jurisdictionLocality
            ? await findAuthoritiesForJurisdiction({
                province: pet.jurisdictionProvince,
                locality: pet.jurisdictionLocality,
              })
            : await tx
                .select({ id: profiles.id })
                .from(profiles)
                .where(
                  and(
                    eq(profiles.role, "admin"),
                    eq(profiles.accountType, "institutional"),
                    isNull(profiles.deactivatedAt),
                  ),
                )
                .then((rows) => rows.map((r) => r.id));

        for (const uid of govtOrAdminIds) {
          pendingNotifications.push({
            userId: uid,
            notificationType: "microchip_duplicate_detected",
            severity: "warning",
            title: `Duplicate microchip detected — ${pet.name}`,
            body: `Chip ${parsed.previousChipNumber} appears on multiple pets. Review case ${caseId}.`,
            relatedPetId: pet.id,
            relatedCaseId: caseId,
            relatedEventId: event.id,
          });
        }
      }

      // Heads-up to the pet owner when a vet or admin emits the event.
      if (parsed.actorContext.kind !== "owner") {
        const [ownerRow] = await tx
          .select({ ownerUserId: ownerships.ownerUserId })
          .from(ownerships)
          .where(
            and(
              eq(ownerships.petId, pet.id),
              eq(ownerships.role, "owner"),
              isNull(ownerships.endedAt),
            ),
          )
          .limit(1);

        if (ownerRow?.ownerUserId) {
          pendingNotifications.push({
            userId: ownerRow.ownerUserId,
            notificationType: "microchip_updated_by_institution",
            severity: parsed.reason === "fraud_detected" ? "urgent" : "info",
            title: `Microchip de ${pet.name} actualizado`,
            body: `Motivo: ${parsed.reason}. Si no reconocés el cambio, contactá soporte.`,
            relatedPetId: pet.id,
            relatedEventId: event.id,
            ...(caseId ? { relatedCaseId: caseId } : {}),
          });
        }
      }

      return { ok: true, eventId: event.id, caseId };
    });
  } catch (err) {
    return {
      error: `replaceMicrochipForUser failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Insert notifications outside the transaction — failure must not roll back
  // the committed mutation (D8 pattern, same as intake.ts and cross-org-transfer.ts).
  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (replaceMicrochipForUser did succeed)", e);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Outer server action — gates via Supabase session, then delegates to writer.
// ---------------------------------------------------------------------------

export async function replaceMicrochipAction(
  rawInput: ReplaceMicrochipInput,
): Promise<ReplaceMicrochipResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  return replaceMicrochipForUser(user.id, rawInput);
}
