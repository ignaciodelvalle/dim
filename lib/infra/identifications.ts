// Pet identifications helper module (compliance handoff PR 0).
//
// `pet_identifications` is the polymorphic identifier table introduced in
// migration 0056. Chip, tattoo, collar tag, and (reserved) photo-biometric
// share one row shape keyed on `kind`. This module is the single entry point
// for adding / replacing / marking identifiers — server actions and lookups
// import from here, never write the table directly.

import { and, asc, eq } from "drizzle-orm";

import {
  type IdentificationKind,
  type IdentificationStatus,
  type PetIdentification,
  db,
  petIdentifications,
} from "@/db";
import { matchesDbError } from "@/lib/infra/db-errors";

// ---------------------------------------------------------------------------
// Add — creates a new active identifier for a pet.
// ---------------------------------------------------------------------------

export type AddChipInput = {
  petId: string;
  kind: "microchip_iso";
  code: string; // 15-digit ISO 11784/11785
  recordedAt?: Date | string;
  recordedByUserId?: string | null;
  recordedByLabel?: string | null;
  photoId?: string | null;
  implantationSite?: "lateral_cuello_izq" | "lateral_cuello_der" | "interescapular" | "otro" | null;
};

export type AddTattooInput = {
  petId: string;
  kind: "tattoo";
  code: string;
  recordedAt?: Date | string;
  recordedByUserId?: string | null;
  recordedByLabel?: string | null;
  photoId?: string | null;
  tattooLocation?: "inner_ear_left" | "inner_ear_right" | "inner_thigh" | "belly" | "other" | null;
  tattooDescription?: string | null;
};

export type AddCollarTagInput = {
  petId: string;
  kind: "collar_tag";
  code: string;
  recordedAt?: Date | string;
  recordedByUserId?: string | null;
  recordedByLabel?: string | null;
};

export type AddIdentificationInput = AddChipInput | AddTattooInput | AddCollarTagInput;

export type AddResult = { id: string } | { error: string };

function dateOnly(input: Date | string | undefined): string {
  if (!input) return new Date().toISOString().slice(0, 10);
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return input;
}

export async function addIdentification(input: AddIdentificationInput): Promise<AddResult> {
  try {
    if (input.kind === "microchip_iso") {
      if (!/^\d{15}$/.test(input.code)) {
        return { error: "El microchip debe tener exactamente 15 dígitos." };
      }
      const [row] = await db
        .insert(petIdentifications)
        .values({
          petId: input.petId,
          kind: "microchip_iso",
          code: input.code,
          recordedAt: dateOnly(input.recordedAt),
          recordedByUserId: input.recordedByUserId ?? null,
          recordedByLabel: input.recordedByLabel ?? null,
          photoId: input.photoId ?? null,
          isoCountryCode: input.code.slice(0, 3),
          isoManufacturerCode: input.code.slice(3, 7),
          isoNationalId: input.code.slice(7, 15),
          isoCompliant: true,
          implantationSite: input.implantationSite ?? null,
        })
        .returning({ id: petIdentifications.id });
      return { id: row.id };
    }

    if (input.kind === "tattoo") {
      const normalized = input.code.trim().toUpperCase().replace(/\s+/g, "");
      if (!normalized) return { error: "Falta el código del tatuaje." };
      const [row] = await db
        .insert(petIdentifications)
        .values({
          petId: input.petId,
          kind: "tattoo",
          code: normalized,
          recordedAt: dateOnly(input.recordedAt),
          recordedByUserId: input.recordedByUserId ?? null,
          recordedByLabel: input.recordedByLabel ?? null,
          photoId: input.photoId ?? null,
          tattooLocation: input.tattooLocation ?? null,
          tattooDescription: input.tattooDescription ?? null,
        })
        .returning({ id: petIdentifications.id });
      return { id: row.id };
    }

    // collar_tag
    const [row] = await db
      .insert(petIdentifications)
      .values({
        petId: input.petId,
        kind: "collar_tag",
        code: input.code.trim(),
        recordedAt: dateOnly(input.recordedAt),
        recordedByUserId: input.recordedByUserId ?? null,
        recordedByLabel: input.recordedByLabel ?? null,
      })
      .returning({ id: petIdentifications.id });
    return { id: row.id };
  } catch (err) {
    // drizzle 0.45 wraps pg errors; matchesDbError walks the `.cause` chain to
    // find the real constraint name (no longer on the top-level message).
    if (matchesDbError(err, { constraint: /pet_identifications_chip_unique/ })) {
      return { error: "Ese chip ya está registrado en otra mascota activa." };
    }
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return { error: `No se pudo registrar el identificador: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Replace — closes an existing identifier and creates a new active one.
//
// Atomic: the old row flips to `replaced` with `replaced_by_id` pointing at
// the new row, in the same transaction.
// ---------------------------------------------------------------------------

export type ReplacementReason = "damaged" | "migrated" | "illegible" | "medical" | "other";

export type ReplaceInput = {
  oldIdentificationId: string;
  reason: ReplacementReason;
  newPayload: AddIdentificationInput;
};

export type ReplaceResult = { newId: string } | { error: string };

export async function replaceIdentification(input: ReplaceInput): Promise<ReplaceResult> {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(petIdentifications)
        .where(eq(petIdentifications.id, input.oldIdentificationId))
        .limit(1);

      if (!existing) return { error: "Identificador no encontrado." };
      if (existing.status !== "active") {
        return { error: `El identificador ya está ${existing.status}.` };
      }
      if (existing.petId !== input.newPayload.petId) {
        return { error: "El nuevo identificador apunta a otra mascota." };
      }

      // Insert the new identifier first so we can FK back to it.
      const addResult = await addIdentification(input.newPayload);
      if ("error" in addResult) return addResult;

      await tx
        .update(petIdentifications)
        .set({
          status: "replaced",
          replacedById: addResult.id,
          replacementReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(petIdentifications.id, existing.id));

      return { newId: addResult.id };
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}

// ---------------------------------------------------------------------------
// Mark unreadable — keeps the row but flips status.
// ---------------------------------------------------------------------------

export async function markUnreadable(
  identificationId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const updated = await db
      .update(petIdentifications)
      .set({ status: "unreadable", updatedAt: new Date() })
      .where(
        and(eq(petIdentifications.id, identificationId), eq(petIdentifications.status, "active")),
      )
      .returning({ id: petIdentifications.id });
    if (updated.length === 0) {
      return { error: "Identificador no encontrado o ya no está activo." };
    }
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}

// ---------------------------------------------------------------------------
// List — read helper for the identification history page.
//
// Returns rows oldest-first so the UI can render a timeline. Includes
// replaced/removed/unreadable so the chain of custody is visible.
// ---------------------------------------------------------------------------

export async function listIdentificationsForPet(petId: string): Promise<PetIdentification[]> {
  return db
    .select()
    .from(petIdentifications)
    .where(eq(petIdentifications.petId, petId))
    .orderBy(asc(petIdentifications.recordedAt), asc(petIdentifications.createdAt));
}

// ---------------------------------------------------------------------------
// Re-exports for ergonomic call sites
// ---------------------------------------------------------------------------

export type { IdentificationKind, IdentificationStatus, PetIdentification };
