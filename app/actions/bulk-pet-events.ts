"use server";

// Bulk vaccination recorder for refugios (Sprint 8 PR1).
//
// Pattern: mirrors bulk-actions.ts — one bulkActionId at the top, per-item
// try/catch (best-effort, NO outer tx over all items), returns BulkResult.
// Auth: requireCapability("event.write", org.id) called ONCE (not per pet).
// Ownership check: ONE batch query instead of per-pet requireAlivePetAccess
// (which would do N Supabase auth calls).
// Idempotency: clientIdempotencyKey per pet is a deterministic UUID v4-shaped
// hash of (bulkActionId + petId) so re-submitting with the same bulkActionId
// is a safe no-op. The column type is uuid so the key must be a valid UUID.

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { db, organizations, ownerships, petEvents, pets, reminders } from "@/db";
import { type RequireCapabilitySuccess, requireCapability } from "@/lib/capabilities";
import { insertEventIdempotent } from "@/lib/event-idempotency";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseDateInput } from "@/lib/format";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import type { BulkResult } from "./bulk-actions";
import type { BulkVaccinateInput } from "./bulk-vaccinate-types";

export async function bulkVaccinateAction(input: BulkVaccinateInput): Promise<BulkResult> {
  const bulkActionId = input.bulkActionId ?? randomUUID();

  // --- 1. Resolve org by publicToken ---
  const [orgRow] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.publicToken, input.orgToken))
    .limit(1);

  if (!orgRow) {
    return {
      bulkActionId,
      succeeded: [],
      failed: input.petPublicTokens.map((id) => ({
        id,
        reason: "Organización no encontrada.",
      })),
    };
  }

  // --- 2. requireCapability ONCE (not per pet) ---
  const cap = await requireCapability("event.write", orgRow.id);
  if (cap.error) {
    return {
      bulkActionId,
      succeeded: [],
      failed: input.petPublicTokens.map((id) => ({
        id,
        reason: cap.error as string,
      })),
    };
  }

  // cap.error is null here — narrow to the success shape.
  const capOk = cap as RequireCapabilitySuccess;
  const userId = capOk.user.id;
  const org = capOk.organization;

  // --- 3. Validate shared inputs ---
  const vaccineName = input.vaccineName?.trim() ?? "";
  if (!vaccineName) {
    return {
      bulkActionId,
      succeeded: [],
      failed: input.petPublicTokens.map((id) => ({
        id,
        reason: "Falta el nombre de la vacuna.",
      })),
    };
  }

  const occurredAt = parseDateInput(input.occurredAt);
  if (!occurredAt) {
    return {
      bulkActionId,
      succeeded: [],
      failed: input.petPublicTokens.map((id) => ({
        id,
        reason: "Fecha de aplicación inválida.",
      })),
    };
  }

  const nextDueAt = input.nextDueAt ? parseDateInput(input.nextDueAt) : null;
  if (input.nextDueAt && !nextDueAt) {
    return {
      bulkActionId,
      succeeded: [],
      failed: input.petPublicTokens.map((id) => ({
        id,
        reason: "Fecha de próxima dosis inválida.",
      })),
    };
  }

  // --- 4. Batch ownership query ---
  // Tokens not returned are not under active shelter_custody of this org,
  // or the pet is deceased. We gate on status != 'deceased' to mirror how
  // requireAlivePetAccess works in the single-pet path.
  const tokens = input.petPublicTokens;

  const ownedRows =
    tokens.length === 0
      ? []
      : await db
          .select({ petId: pets.id, publicToken: pets.publicToken })
          .from(pets)
          .innerJoin(ownerships, eq(ownerships.petId, pets.id))
          .where(
            and(
              inArray(pets.publicToken, tokens),
              eq(ownerships.ownerOrganizationId, org.id),
              eq(ownerships.role, "shelter_custody"),
              isNull(ownerships.endedAt),
              ne(pets.status, "deceased"),
            ),
          );

  const tokenToPetId = new Map<string, string>();
  for (const row of ownedRows) {
    tokenToPetId.set(row.publicToken, row.petId);
  }

  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const token of tokens) {
    const petId = tokenToPetId.get(token);
    if (!petId) {
      failed.push({
        id: token,
        reason: "No está bajo custodia activa de tu organización (o no está vivo).",
      });
      continue;
    }

    // --- 5. Best-effort per-pet transaction ---
    try {
      await db.transaction(async (tx) => {
        const now = new Date();
        // Deterministic UUID from SHA-256 of (bulkActionId + ":" + petId).
        // The column type is uuid so the key must be a valid UUID v4-shaped hex.
        // We take the first 32 hex chars of SHA-256 and apply version + variant bits.
        const hash = createHash("sha256").update(`${bulkActionId}:${petId}`).digest("hex");
        const variantNibble = (Number.parseInt(hash.charAt(16), 16) & 0x3) | 0x8;
        const clientIdempotencyKey = [
          hash.slice(0, 8),
          hash.slice(8, 12),
          `4${hash.slice(13, 16)}`, // version 4
          `${variantNibble.toString(16)}${hash.slice(17, 20)}`, // variant
          hash.slice(20, 32),
        ].join("-");

        const eventPayload = validateEventPayload("vaccination_administered", {
          vaccine_name: vaccineName,
          brand: input.brand?.trim() || null,
          batch: input.batch?.trim() || null,
          administered_by: input.administeredBy?.trim() || null,
          next_due_at: nextDueAt ? nextDueAt.toISOString() : null,
        });

        const { wasNoop } = await insertEventIdempotent(
          {
            petId,
            eventType: "vaccination_administered",
            occurredAt,
            recordedAt: now,
            recordedByUserId: userId,
            authorRole: "shelter",
            authorOrganizationId: org.id,
            authorVerified: org.verified,
            payload: eventPayload,
            notes: null,
            clientIdempotencyKey,
          },
          tx as Parameters<typeof insertEventIdempotent>[1],
        );

        // No-op = already written with this key (idempotent retry). Count as
        // succeeded — the event exists and is correct.
        if (wasNoop) return;

        // Auto-create a vaccine reminder when next dose is known.
        if (nextDueAt) {
          await tx.insert(reminders).values({
            petId,
            userId,
            reminderType: "vaccine",
            dueAt: nextDueAt,
            title: `Refuerzo: ${vaccineName}`,
            description: "Próxima dosis programada (lote masivo).",
          });
        }
      });

      succeeded.push(token);
    } catch (err) {
      failed.push({
        id: token,
        reason: err instanceof Error ? err.message : "Error desconocido.",
      });
    }
  }

  revalidatePath(`/org/${input.orgToken}/mascotas`);
  return { bulkActionId, succeeded, failed };
}
