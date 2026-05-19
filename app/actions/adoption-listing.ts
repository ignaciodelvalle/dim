"use server";

// Org-side actions for the adoption listing feature (spec
// adoption-listing-public v1.3 §12 Fase 2). Three actions:
//
//   setAdoptionListingStatusAction  — publish / unpublish / pause / unpause
//   updateAdoptionListingContentAction — story, requirements, buckets, etc.
//
// Both are gated on the new `adoption.listing.manage` capability + the
// pet being in shelter_custody of the actor's org. The status action
// also enforces the four cross-spec preconditions on publish (D18 not
// lost/deceased, D19 adoption_eligible=true, D20 not in_custody_dispute,
// D21 rabies not in_progress). Listing content edits do NOT emit
// pet_events — this is shelter-curated marketing copy, not pet facts.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, ownerships, pets } from "@/db";
import {
  ADOPTION_AGE_BUCKETS,
  ADOPTION_ENERGY_LEVELS,
  ADOPTION_SIZE_ESTIMATES,
  type AgeBucket,
  type EnergyLevel,
  type SizeEstimate,
} from "@/lib/adoption-listing";
import { requireCapability } from "@/lib/capabilities";

export type AdoptionListingResult = { ok: true } | { error: string };

async function loadShelterPet(
  publicToken: string,
  organizationId: string,
): Promise<{ row: typeof pets.$inferSelect } | { error: string }> {
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerOrganizationId, organizationId),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!petRow) {
    return { error: "Mascota no encontrada o no está bajo custodia de tu organización." };
  }
  return { row: petRow.pet };
}

// Status transitions ------------------------------------------------------

export type AdoptionListingStatusInput = {
  petPublicToken: string;
  action: "publish" | "pause" | "unpause" | "unpublish";
};

export async function setAdoptionListingStatusAction(
  input: AdoptionListingStatusInput,
): Promise<AdoptionListingResult> {
  const auth = await requireCapability("adoption.listing.manage");
  if (auth.error !== null) return { error: auth.error };
  const { organization } = auth;

  const loaded = await loadShelterPet(input.petPublicToken, organization.id);
  if ("error" in loaded) return loaded;
  const pet = loaded.row;

  const now = new Date();

  if (input.action === "publish") {
    // Cross-spec guards (D18, D19, D20, D21) — block publish when the pet
    // isn't eligible for the public listing. Reasons surfaced with a CTA
    // so the org operator knows what to fix first.
    if (pet.status === "lost") {
      return {
        error: "Esta mascota está reportada como perdida. Marcala recuperada antes de publicar.",
      };
    }
    if (pet.status === "deceased") {
      return { error: "Esta mascota está registrada como fallecida." };
    }
    if (pet.adoptionEligible !== true) {
      return {
        error:
          "Marcá esta mascota como apta para adopción antes de publicar (desde la pestaña de elegibilidad).",
      };
    }
    if (pet.inCustodyDispute === true) {
      return {
        error: "Esta mascota está en disputa de custodia. Resolvé la dispute antes de publicar.",
      };
    }
    if (pet.rabiesObservationStatus === "in_progress") {
      return {
        error:
          "Esta mascota está en período de observación sanitaria. Esperá al cierre del período antes de publicar.",
      };
    }

    await db
      .update(pets)
      .set({
        adoptionListedAt: pet.adoptionListedAt ?? now,
        adoptionListingPausedAt: null,
        updatedAt: now,
      })
      .where(eq(pets.id, pet.id));
  } else if (input.action === "unpublish") {
    await db
      .update(pets)
      .set({
        adoptionListedAt: null,
        adoptionListingPausedAt: null,
        updatedAt: now,
      })
      .where(eq(pets.id, pet.id));
  } else if (input.action === "pause") {
    if (!pet.adoptionListedAt) {
      return { error: "La mascota no está publicada — pausar no aplica." };
    }
    await db
      .update(pets)
      .set({ adoptionListingPausedAt: now, updatedAt: now })
      .where(eq(pets.id, pet.id));
  } else {
    // unpause — re-check cross-spec guards because state may have changed
    // since the pause. We don't want a paused-then-fell-into-dispute pet to
    // pop back into /adoptar without revalidation.
    if (pet.adoptionEligible !== true) {
      return {
        error: "Antes de reanudar, marcá esta mascota como apta para adopción.",
      };
    }
    if (pet.inCustodyDispute === true) {
      return {
        error: "Hay una disputa de custodia abierta. Resolvé antes de reanudar.",
      };
    }
    if (pet.rabiesObservationStatus === "in_progress") {
      return {
        error: "Período de observación sanitaria activo. Esperá al cierre.",
      };
    }
    await db
      .update(pets)
      .set({ adoptionListingPausedAt: null, updatedAt: now })
      .where(eq(pets.id, pet.id));
  }

  revalidatePath(`/org/${organization.publicToken}/mascotas/${pet.publicToken}`);
  revalidatePath("/adoptar");
  revalidatePath(`/adoptar/${pet.publicToken}`);
  return { ok: true };
}

// Content edits -----------------------------------------------------------

export type AdoptionListingContentInput = {
  petPublicToken: string;
  story?: string | null;
  requirements?: string | null;
  ageBucket?: AgeBucket | null;
  sizeEstimate?: SizeEstimate | null;
  energyLevel?: EnergyLevel | null;
  goodWithKids?: boolean | null;
  goodWithDogs?: boolean | null;
  goodWithCats?: boolean | null;
  needsYard?: boolean | null;
  feeArs?: number | null;
};

const MAX_STORY_LEN = 5000;
const MAX_REQUIREMENTS_LEN = 2000;

export async function updateAdoptionListingContentAction(
  input: AdoptionListingContentInput,
): Promise<AdoptionListingResult> {
  const auth = await requireCapability("adoption.listing.manage");
  if (auth.error !== null) return { error: auth.error };
  const { organization } = auth;

  const loaded = await loadShelterPet(input.petPublicToken, organization.id);
  if ("error" in loaded) return loaded;
  const pet = loaded.row;

  // Validate enums client-side too — the DB CHECK is the real gate but a
  // clean error here is friendlier than a constraint violation.
  if (input.ageBucket && !(ADOPTION_AGE_BUCKETS as readonly string[]).includes(input.ageBucket)) {
    return { error: "Edad inválida." };
  }
  if (
    input.sizeEstimate &&
    !(ADOPTION_SIZE_ESTIMATES as readonly string[]).includes(input.sizeEstimate)
  ) {
    return { error: "Talle inválido." };
  }
  if (
    input.energyLevel &&
    !(ADOPTION_ENERGY_LEVELS as readonly string[]).includes(input.energyLevel)
  ) {
    return { error: "Nivel de energía inválido." };
  }
  if (input.feeArs != null && input.feeArs < 0) {
    return { error: "El aporte de adopción no puede ser negativo." };
  }
  if (input.story && input.story.length > MAX_STORY_LEN) {
    return { error: `La historia no puede superar ${MAX_STORY_LEN} caracteres.` };
  }
  if (input.requirements && input.requirements.length > MAX_REQUIREMENTS_LEN) {
    return {
      error: `Los requisitos no pueden superar ${MAX_REQUIREMENTS_LEN} caracteres.`,
    };
  }

  await db
    .update(pets)
    .set({
      adoptionStory: input.story?.trim() || null,
      adoptionRequirements: input.requirements?.trim() || null,
      adoptionAgeBucket: input.ageBucket ?? null,
      adoptionSizeEstimate: input.sizeEstimate ?? null,
      adoptionEnergyLevel: input.energyLevel ?? null,
      adoptionGoodWithKids: input.goodWithKids ?? null,
      adoptionGoodWithDogs: input.goodWithDogs ?? null,
      adoptionGoodWithCats: input.goodWithCats ?? null,
      adoptionNeedsYard: input.needsYard ?? null,
      adoptionFeeArs: input.feeArs ?? null,
      updatedAt: new Date(),
    })
    .where(eq(pets.id, pet.id));

  revalidatePath(`/org/${organization.publicToken}/mascotas/${pet.publicToken}`);
  revalidatePath(`/adoptar/${pet.publicToken}`);
  return { ok: true };
}
