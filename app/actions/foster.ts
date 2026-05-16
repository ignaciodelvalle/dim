"use server";

// Foster assignment — a refugio coordinator with `foster.assign` capability
// assigns a member (with active membership in the SAME org) to physically
// care for an animal currently in shelter_custody.
//
// The foster's ownership row coexists with the org's shelter_custody row.
// Both stay active until the foster ends or the animal is adopted. AGENTS.md
// → "Foster is distinct from shelter_custody" — neither replaces the other.

import { db, notifications, organizationMemberships, ownerships, petEvents, pets } from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { validateEventPayload } from "@/lib/event-schemas";
import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

export type AssignFosterFormState = {
  error: string | null;
};

export async function assignFosterAction(
  publicToken: string,
  _previous: AssignFosterFormState,
  formData: FormData,
): Promise<AssignFosterFormState> {
  const auth = await requireCapability("foster.assign");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const fosterUserId = String(formData.get("fosterUserId") ?? "").trim();
  const expectedWeeksRaw = String(formData.get("expectedWeeks") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!fosterUserId) return { error: "Elegí un voluntario para el tránsito." };
  const expectedWeeks = expectedWeeksRaw
    ? Math.max(0, Number.parseInt(expectedWeeksRaw, 10) || 0)
    : null;

  // Pet must exist and currently be in shelter_custody by THIS org. We use a
  // single join so a pet held by a different org returns zero rows (instead of
  // leaking the existence of the pet to the wrong org).
  const [petRow] = await db
    .select({ pet: pets, custodyId: ownerships.id })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
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

  // Foster must have an active membership in the same org. AGENTS.md →
  // "A foster requires an active organization_membership linking the foster
  // to the umbrella org." Role within the org doesn't matter for v1 — any
  // active member can take a foster role (refugios commonly use volunteers
  // and even coordinators as fosters).
  const [fosterMembership] = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, fosterUserId),
        eq(organizationMemberships.organizationId, organization.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);
  if (!fosterMembership) {
    return { error: "Esa persona no es miembro activo de la organización." };
  }

  // No active foster row for the same pet — one foster at a time in v1.
  const [existingFoster] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  if (existingFoster) {
    return { error: "Este animal ya tiene un tránsito activo. Finalizalo antes de asignar otro." };
  }

  const now = new Date();
  const authorVerified = organization.verified;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(ownerships).values({
        petId: pet.id,
        ownerUserId: fosterUserId,
        role: "foster",
        startedAt: now,
      });

      const payload = validateEventPayload("foster_assigned", {
        foster_user_id: fosterUserId,
        expected_weeks: expectedWeeks,
        notes,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "foster_assigned",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified,
        payload,
      });

      await tx.insert(notifications).values({
        userId: fosterUserId,
        notificationType: "foster_assigned",
        title: `Te asignaron tránsito: ${pet.name}`,
        body: `${organization.displayName} te asignó como tránsito de ${pet.name}.`,
        severity: "info",
        ctaLabel: "Ver detalles",
        ctaUrl: "/mis-mascotas",
        relatedPetId: pet.id,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo asignar el tránsito: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/refugio/mascotas?foster=${publicToken}`);
}

// ---------------------------------------------------------------------------
// End foster — closes an active foster ownership row + emits foster_ended.
// Gated on `foster.end`. Used when a tránsito returns the animal early,
// can't continue, or the refugio reassigns. Adoption-driven foster closures
// flow through `adoption_finalized`, not this action.
// ---------------------------------------------------------------------------

export type EndFosterFormState = {
  error: string | null;
};

type FosterEndedBy = "shelter" | "foster_returned" | "other";
const FOSTER_ENDED_BY: readonly FosterEndedBy[] = ["shelter", "foster_returned", "other"];

export async function endFosterAction(
  publicToken: string,
  _previous: EndFosterFormState,
  formData: FormData,
): Promise<EndFosterFormState> {
  const auth = await requireCapability("foster.end");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const endedByRaw = String(formData.get("endedBy") ?? "").trim();
  const endedBy: FosterEndedBy = FOSTER_ENDED_BY.includes(endedByRaw as FosterEndedBy)
    ? (endedByRaw as FosterEndedBy)
    : "shelter";
  const reason = String(formData.get("reason") ?? "").trim() || null;

  // Verify the pet is held by THIS org AND has an active foster row. We join
  // shelter_custody/owner/etc. through ownerships to confirm the org owns the
  // ability to close the foster.
  const [petRow] = await db
    .select({ pet: pets, custodyId: ownerships.id })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!petRow) {
    return { error: "Mascota no encontrada o no está bajo custodia de tu organización." };
  }
  const pet = petRow.pet;

  const [fosterRow] = await db
    .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  if (!fosterRow || !fosterRow.ownerUserId) {
    return { error: "Este animal no tiene un tránsito activo para finalizar." };
  }

  // Find the original foster_assigned event for this foster, if it exists,
  // so the foster_ended payload can link back to it. Best-effort — older
  // rows might be missing the event (e.g. fosters assigned directly in SQL).
  const [assignedEvent] = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "foster_assigned")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  const now = new Date();
  const authorVerified = organization.verified;
  const fosterUserId = fosterRow.ownerUserId;

  try {
    await db.transaction(async (tx) => {
      await tx.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, fosterRow.id));

      const payload = validateEventPayload("foster_ended", {
        foster_user_id: fosterUserId,
        foster_assigned_event_id: assignedEvent?.id ?? null,
        ended_by: endedBy,
        reason,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "foster_ended",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified,
        payload,
      });

      await tx.insert(notifications).values({
        userId: fosterUserId,
        notificationType: "foster_ended",
        title: `Finalizó tu tránsito: ${pet.name}`,
        body: `${organization.displayName} cerró el tránsito de ${pet.name}.${
          reason ? ` Motivo: ${reason}` : ""
        }`,
        severity: "info",
        ctaLabel: "Ver detalles",
        ctaUrl: "/mis-mascotas",
        relatedPetId: pet.id,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo finalizar el tránsito: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/refugio/mascotas?fostend=${publicToken}`);
}
