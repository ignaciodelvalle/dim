"use server";

// Foster volunteers pool — server actions for the volunteer side (spec
// foster-volunteers-pool v1.4 §10 + §13 pre-conditions). All three actions
// here are authored by the volunteer themselves (personal account); the org
// side lives in app/actions/foster-proposals.ts.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  cases,
  db,
  fosterProposals,
  fosterVolunteers,
  notifications,
  ownerships,
  petEvents,
  profiles,
} from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";
import { createClient } from "@/lib/supabase/server";

// Inputs ------------------------------------------------------------------

// `mode`: "enroll" increments availableSlots by 1 (D16 — one re-enrollment
// equals one capacity unit). "update_preferences_only" leaves slots alone.
export type UpsertFosterVolunteerInput = {
  mode: "enroll" | "update_preferences_only";
  status: "active" | "paused";
  jurisdictionProvince?: string | null;
  jurisdictionLocality?: string | null;
  acceptsDogs: boolean;
  acceptsCats: boolean;
  acceptsOtherSpecies: boolean;
  acceptsSizeSmall: boolean;
  acceptsSizeMedium: boolean;
  acceptsSizeLarge: boolean;
  acceptsPuppies: boolean;
  acceptsSeniors: boolean;
  acceptsChronicConditions: boolean;
  acceptsDangerousBreeds: boolean;
  maxDurationWeeks?: number | null;
  householdOtherPets?: boolean | null;
  householdKids?: boolean | null;
  notes?: string | null;
};

export type UpsertFosterVolunteerResult =
  | { volunteerId: string; availableSlots: number }
  | { error: string };

export type WithdrawFosterVolunteerResult = { ok: true } | { error: string };

export type SetCoFosterAllowedInput = {
  fosterOwnershipId: string;
  allowCoFoster: boolean;
};

export type SetCoFosterAllowedResult = { ok: true } | { error: string };

// upsertFosterVolunteerAction --------------------------------------------

// First enrollment creates the row with availableSlots=1 (when mode=enroll)
// or =0 (when mode=update_preferences_only — strange but legal). Subsequent
// enrollments stack: each mode='enroll' adds +1. Preference updates never
// touch slots. The active-with-no-species guard fires only when status is
// 'active' — a paused row may legitimately have no species selected.
export async function upsertFosterVolunteerAction(
  input: UpsertFosterVolunteerInput,
): Promise<UpsertFosterVolunteerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // D13 pre-conditions — eligibility checks for joining the pool. Each is a
  // surface concern but blocking them at the action keeps the UI from
  // silently failing.
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) return { error: "Perfil no encontrado." };
  if (profile.accountType !== "personal" || profile.role !== "owner") {
    return { error: "Solo cuentas personales con rol owner pueden inscribirse como voluntario." };
  }
  if (!profile.dniVerified) {
    return { error: "Verificá tu DNI antes de inscribirte como voluntario." };
  }
  if (!profile.displayName?.trim()) {
    return { error: "Completá tu nombre antes de inscribirte." };
  }
  if (!profile.phone?.trim()) {
    return { error: "Agregá tu teléfono antes de inscribirte." };
  }

  if (
    input.status === "active" &&
    !input.acceptsDogs &&
    !input.acceptsCats &&
    !input.acceptsOtherSpecies
  ) {
    return { error: "Elegí al menos una especie que aceptás." };
  }

  if (input.maxDurationWeeks != null && input.maxDurationWeeks < 0) {
    return { error: "La duración máxima no puede ser negativa." };
  }

  const now = new Date();
  let row: { id: string; availableSlots: number } | null = null;

  try {
    row = await db.transaction(async (tx): Promise<{ id: string; availableSlots: number }> => {
      const [existing] = await tx
        .select()
        .from(fosterVolunteers)
        .where(eq(fosterVolunteers.userId, user.id))
        .limit(1);

      if (!existing) {
        const [inserted] = await tx
          .insert(fosterVolunteers)
          .values({
            userId: user.id,
            status: input.status,
            availableSlots: input.mode === "enroll" ? 1 : 0,
            jurisdictionProvince: input.jurisdictionProvince ?? null,
            jurisdictionLocality: input.jurisdictionLocality ?? null,
            acceptsDogs: input.acceptsDogs,
            acceptsCats: input.acceptsCats,
            acceptsOtherSpecies: input.acceptsOtherSpecies,
            acceptsSizeSmall: input.acceptsSizeSmall,
            acceptsSizeMedium: input.acceptsSizeMedium,
            acceptsSizeLarge: input.acceptsSizeLarge,
            acceptsPuppies: input.acceptsPuppies,
            acceptsSeniors: input.acceptsSeniors,
            acceptsChronicConditions: input.acceptsChronicConditions,
            acceptsDangerousBreeds: input.acceptsDangerousBreeds,
            maxDurationWeeks: input.maxDurationWeeks ?? null,
            householdOtherPets: input.householdOtherPets ?? null,
            householdKids: input.householdKids ?? null,
            notes: input.notes?.trim() || null,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: fosterVolunteers.id, availableSlots: fosterVolunteers.availableSlots });
        return inserted;
      }

      // Withdrawn rows must re-enroll to rejoin the pool — status flips back
      // to 'active', slots reset to 1 (single fresh capacity). This is the
      // safe semantic: a withdrawn volunteer doesn't accumulate "lost" slots.
      const newSlots =
        existing.status === "withdrawn"
          ? input.mode === "enroll"
            ? 1
            : 0
          : input.mode === "enroll"
            ? existing.availableSlots + 1
            : existing.availableSlots;

      const [updated] = await tx
        .update(fosterVolunteers)
        .set({
          status: input.status,
          availableSlots: newSlots,
          jurisdictionProvince: input.jurisdictionProvince ?? null,
          jurisdictionLocality: input.jurisdictionLocality ?? null,
          acceptsDogs: input.acceptsDogs,
          acceptsCats: input.acceptsCats,
          acceptsOtherSpecies: input.acceptsOtherSpecies,
          acceptsSizeSmall: input.acceptsSizeSmall,
          acceptsSizeMedium: input.acceptsSizeMedium,
          acceptsSizeLarge: input.acceptsSizeLarge,
          acceptsPuppies: input.acceptsPuppies,
          acceptsSeniors: input.acceptsSeniors,
          acceptsChronicConditions: input.acceptsChronicConditions,
          acceptsDangerousBreeds: input.acceptsDangerousBreeds,
          maxDurationWeeks: input.maxDurationWeeks ?? null,
          householdOtherPets: input.householdOtherPets ?? null,
          householdKids: input.householdKids ?? null,
          notes: input.notes?.trim() || null,
          updatedAt: now,
        })
        .where(eq(fosterVolunteers.id, existing.id))
        .returning({ id: fosterVolunteers.id, availableSlots: fosterVolunteers.availableSlots });
      return updated;
    });
  } catch (err) {
    return {
      error: `No se pudo guardar la inscripción: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  if (!row) return { error: "Error inesperado al guardar." };

  revalidatePath("/cuenta/ofrecerme-como-transito");
  return { volunteerId: row.id, availableSlots: row.availableSlots };
}

// withdrawFosterVolunteerAction ------------------------------------------

// Withdrawal: row stays for history (D16: the volunteer might re-enroll
// later), status flips to 'withdrawn', slots zero out, and any pending
// proposals dirigidas a este voluntario se cancelan en cascada con motivo
// 'volunteer_withdrew' — also emit foster_proposal_cancelled events.
export async function withdrawFosterVolunteerAction(): Promise<WithdrawFosterVolunteerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(fosterVolunteers)
        .where(eq(fosterVolunteers.userId, user.id))
        .limit(1);
      if (!existing) {
        throw new Error("No estás inscripto en el pool de voluntarios.");
      }

      await tx
        .update(fosterVolunteers)
        .set({ status: "withdrawn", availableSlots: 0, updatedAt: now })
        .where(eq(fosterVolunteers.id, existing.id));

      // Cancel pending proposals + emit foster_proposal_cancelled events.
      const pendingProposals = await tx
        .select()
        .from(fosterProposals)
        .where(
          and(eq(fosterProposals.volunteerUserId, user.id), eq(fosterProposals.status, "pending")),
        );

      for (const p of pendingProposals) {
        await tx
          .update(fosterProposals)
          .set({
            status: "cancelled",
            cancelledAt: now,
            cancelledByUserId: user.id,
            cancellationReason: "volunteer_withdrew",
            updatedAt: now,
          })
          .where(eq(fosterProposals.id, p.id));

        const payload = validateEventPayload("foster_proposal_resolved", {
          proposal_public_token: p.publicToken,
          outcome: "cancelled",
          cancellation_reason: "volunteer_withdrew",
          auto_cancelled: true,
        });
        await tx.insert(petEvents).values({
          petId: p.petId,
          eventType: "foster_proposal_resolved",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          authorOrganizationId: null,
          authorVerified: false,
          payload,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo retirar del pool: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  revalidatePath("/cuenta/ofrecerme-como-transito");
  return { ok: true };
}

// setCoFosterAllowedAction -----------------------------------------------

// D17 — the first foster of a pet can opt into accepting a co-foster.
// Toggleable after the fact: emit an event each time so the timeline shows
// who flipped and when. The action confirms ownership (only the foster
// themselves can flip their own flag).
export async function setCoFosterAllowedAction(
  input: SetCoFosterAllowedInput,
): Promise<SetCoFosterAllowedResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const [ownership] = await tx
        .select()
        .from(ownerships)
        .where(
          and(
            eq(ownerships.id, input.fosterOwnershipId),
            eq(ownerships.role, "foster"),
            eq(ownerships.ownerUserId, user.id),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);
      if (!ownership) {
        throw new Error("Tránsito no encontrado o no es tuyo.");
      }

      await tx
        .update(ownerships)
        .set({ allowCoFoster: input.allowCoFoster })
        .where(eq(ownerships.id, input.fosterOwnershipId));

      const payload = validateEventPayload("foster_co_foster_allowed", {
        allow_co_foster: input.allowCoFoster,
        foster_ownership_id: input.fosterOwnershipId,
      });
      // Cases system (Fase D5): attach to the open foster_placement
      // case for this pet so the toggle event lands in the case timeline.
      const [fosterCase] = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(
          and(
            eq(cases.primaryPetId, ownership.petId),
            eq(cases.caseKind, "foster_placement"),
            eq(cases.status, "open"),
          ),
        )
        .limit(1);
      await tx.insert(petEvents).values({
        petId: ownership.petId,
        eventType: "foster_co_foster_allowed",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        authorOrganizationId: null,
        authorVerified: false,
        payload,
        caseId: fosterCase?.id ?? null,
      });

      // Optional: notify orgs holding shelter_custody on this pet so they can
      // re-evaluate their search for a second co-foster. v1 keeps it simple
      // — the org will see the toggle from their portal anyway.
      const orgCustodies = await tx
        .select({ orgId: ownerships.ownerOrganizationId })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, ownership.petId),
            eq(ownerships.role, "shelter_custody"),
            isNull(ownerships.endedAt),
          ),
        );
      for (const oc of orgCustodies) {
        if (!oc.orgId) continue;
        await tx.insert(notifications).values({
          userId: user.id,
          notificationType: input.allowCoFoster
            ? "foster_co_foster_enabled"
            : "foster_co_foster_disabled",
          severity: "info",
          title: input.allowCoFoster
            ? "Tu tránsito ahora admite co-foster"
            : "Tu tránsito ya no admite co-foster",
          body: input.allowCoFoster
            ? "Los refugios con custodia podrán proponer un segundo voluntario."
            : "Quedaste como único tránsito por ahora.",
          relatedPetId: ownership.petId,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo actualizar el co-foster: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  revalidatePath("/mis-mascotas");
  return { ok: true };
}
