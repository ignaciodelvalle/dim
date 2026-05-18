"use server";

// Adoption eligibility — set / clear the per-pet flag (spec
// foster-volunteers-pool v1.4 §17). Org members with `intake.create`
// capability flip it (intake is the natural authority for "is this animal
// ready to be adopted?"). The action validates the input shape against the
// same enum and CHECKs that `pets` enforces, snapshots the previous state,
// updates the pets row, and emits an `adoption_eligibility_set` event with
// the previous_state baked into the payload so the timeline reads cleanly.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, ownerships, petEvents, pets } from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { validateEventPayload } from "@/lib/event-schemas";

const INELIGIBLE_REASONS = [
  "medical_treatment",
  "behavioral_evaluation",
  "recovery",
  "quarantine",
  "legal_hold",
  "age",
  "pending_intake_eval",
  "other",
] as const;
type IneligibleReason = (typeof INELIGIBLE_REASONS)[number];

export type SetAdoptionEligibilityInput = {
  petPublicToken: string;
  eligible: boolean;
  ineligibleReason?: IneligibleReason | null;
  ineligibleReasonNotes?: string | null;
  ineligibleUntilIso?: string | null;
};

export type SetAdoptionEligibilityResult = { ok: true } | { error: string };

export async function setAdoptionEligibilityAction(
  input: SetAdoptionEligibilityInput,
): Promise<SetAdoptionEligibilityResult> {
  // Capability gates the org context too — the most-recently-joined active
  // membership wins; if the caller belongs to multiple orgs, the UI scopes
  // by routing them through `/org/[orgToken]/...`.
  const auth = await requireCapability("intake.create");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  // Input shape validation. The DB CHECKs would reject these, but failing
  // early at the boundary gives a clearer error message to the UI.
  if (!input.eligible && !input.ineligibleReason) {
    return { error: "Indicá la razón cuando la mascota no es apta para adopción." };
  }
  if (input.eligible && input.ineligibleReason) {
    return { error: "No corresponde razón cuando la mascota es apta para adopción." };
  }
  if (input.ineligibleReason && !INELIGIBLE_REASONS.includes(input.ineligibleReason)) {
    return { error: "Razón inválida." };
  }
  if (
    input.ineligibleReason === "other" &&
    (input.ineligibleReasonNotes == null || input.ineligibleReasonNotes.trim().length === 0)
  ) {
    return { error: "Cuando la razón es 'other' necesitamos una nota descriptiva." };
  }
  const ineligibleUntil = input.ineligibleUntilIso ? new Date(input.ineligibleUntilIso) : null;
  if (
    input.ineligibleUntilIso &&
    (!ineligibleUntil || !Number.isFinite(ineligibleUntil.getTime()))
  ) {
    return { error: "Fecha 'ineligibleUntil' inválida." };
  }

  // Load the pet and verify it is in active shelter_custody of this org.
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, input.petPublicToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!petRow) {
    return { error: "Mascota no encontrada o no está bajo custodia de tu organización." };
  }
  const pet = petRow.pet;

  const now = new Date();
  const previousState = {
    eligible: pet.adoptionEligible,
    reason: pet.adoptionIneligibleReason,
  };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(pets)
        .set({
          adoptionEligible: input.eligible,
          adoptionIneligibleReason: input.eligible ? null : (input.ineligibleReason ?? null),
          adoptionIneligibleReasonNotes: input.eligible
            ? null
            : input.ineligibleReasonNotes?.trim() || null,
          adoptionIneligibleUntil: input.eligible ? null : ineligibleUntil,
          adoptionEligibilitySetAt: now,
          adoptionEligibilitySetByUserId: user.id,
          updatedAt: now,
        })
        .where(eq(pets.id, pet.id));

      const payload = validateEventPayload("adoption_eligibility_set", {
        eligible: input.eligible,
        ineligible_reason: input.eligible ? null : (input.ineligibleReason ?? null),
        ineligible_reason_notes: input.eligible
          ? null
          : input.ineligibleReasonNotes?.trim() || null,
        ineligible_until: input.eligible
          ? null
          : ineligibleUntil
            ? ineligibleUntil.toISOString()
            : null,
        previous_state: previousState,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "adoption_eligibility_set",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload,
      });
    });
  } catch (err) {
    console.error("setAdoptionEligibilityAction tx failed:", err);
    return {
      error: `No se pudo actualizar la elegibilidad: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  revalidatePath(`/org/${organization.publicToken}/mascotas/${pet.publicToken}`);
  return { ok: true };
}
