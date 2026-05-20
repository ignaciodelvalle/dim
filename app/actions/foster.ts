"use server";

// Foster assignment — a refugio coordinator with `foster.assign` capability
// assigns a member (with active membership in the SAME org) to physically
// care for an animal currently in shelter_custody.
//
// The foster's ownership row coexists with the org's shelter_custody row.
// Both stay active until the foster ends or the animal is adopted. AGENTS.md
// → "Foster is distinct from shelter_custody" — neither replaces the other.

import {
  cases,
  db,
  fosterVolunteers,
  notifications,
  organizationMemberships,
  ownerships,
  petEvents,
  pets,
} from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { closeCase, openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

export type AssignFosterFormState = {
  error: string | null;
};

export async function assignFosterAction(
  orgToken: string,
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

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      await tx.insert(ownerships).values({
        petId: pet.id,
        ownerUserId: fosterUserId,
        role: "foster",
        startedAt: now,
      });

      // Cases system (Fase D5): open a foster_placement case for this
      // (pet, org) so the foster lifecycle has a first-class home in
      // /casos. The foster_assigned event below carries case_id.
      const caseRow = await openCase(
        {
          kind: "foster_placement",
          primarySubjectKind: "registered_pet",
          primaryPetId: pet.id,
          jurisdictionProvince: pet.jurisdictionProvince,
          jurisdictionLocality: pet.jurisdictionLocality,
          openedByUserId: user.id,
          openedByOrganizationId: organization.id,
          openedReason: `Foster placement assigned by ${organization.displayName}${expectedWeeks ? ` — expected ${expectedWeeks} weeks` : ""}`,
        },
        tx,
      );

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
        caseId: caseRow.id,
      });

      pendingNotifications.push({
        userId: fosterUserId,
        notificationType: "foster_assigned",
        title: `Te asignaron tránsito: ${pet.name}`,
        body: `${organization.displayName} te asignó como tránsito de ${pet.name}.`,
        severity: "info",
        ctaLabel: "Ver detalles",
        ctaUrl: "/mis-mascotas",
        relatedPetId: pet.id,
        relatedCaseId: caseRow.id,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo asignar el tránsito: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  redirect(`/org/${orgToken}/mascotas?foster=${publicToken}`);
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

// UI-selectable subset of the foster_ended reason catalog. `pet_died` and
// `adoption` are programmatic-only (emitted by recordDeathAction and
// finalizeAdoptionAction respectively) — never offered in this form.
const END_FOSTER_UI_REASONS = [
  "returned",
  "early_return_by_foster",
  "lost_unrecovered",
  "other",
] as const;
type EndFosterUIReason = (typeof END_FOSTER_UI_REASONS)[number];

export async function endFosterAction(
  orgToken: string,
  publicToken: string,
  _previous: EndFosterFormState,
  formData: FormData,
): Promise<EndFosterFormState> {
  const auth = await requireCapability("foster.end");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason: EndFosterUIReason = END_FOSTER_UI_REASONS.includes(reasonRaw as EndFosterUIReason)
    ? (reasonRaw as EndFosterUIReason)
    : "returned";
  const notes = String(formData.get("notes") ?? "").trim() || null;

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

  const now = new Date();
  const authorVerified = organization.verified;
  const fosterUserId = fosterRow.ownerUserId;

  // Cases system (Fase D5): look up the open foster_placement so the
  // foster_ended event carries case_id and the case closes alongside.
  const [fosterCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, pet.id),
        eq(cases.caseKind, "foster_placement"),
        eq(cases.status, "open"),
      ),
    )
    .limit(1);

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      await tx.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, fosterRow.id));

      const payload = validateEventPayload("foster_ended", {
        foster_user_id: fosterUserId,
        reason,
        notes,
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
        caseId: fosterCase?.id ?? null,
      });

      // Map foster_ended reason → case closed_reason. Returned and
      // lost_unrecovered are real terminal outcomes; early_return is
      // closed `cancelled` because the engagement didn't run its course.
      if (fosterCase) {
        const closedReason: "resolved" | "cancelled" =
          reason === "early_return_by_foster" ? "cancelled" : "resolved";
        await closeCase(
          { caseId: fosterCase.id, reason: closedReason, closedByUserId: user.id },
          tx,
        );
      }

      pendingNotifications.push({
        userId: fosterUserId,
        notificationType: "foster_ended",
        title: `Finalizó tu tránsito: ${pet.name}`,
        body: `${organization.displayName} cerró el tránsito de ${pet.name}.${
          notes ? ` Nota: ${notes}` : ""
        }`,
        severity: "info",
        ctaLabel: "Ver detalles",
        ctaUrl: "/mis-mascotas",
        relatedPetId: pet.id,
      });

      // Post-close slots prompt: if the volunteer is in the pool with 0
      // available slots, surface a notification offering to re-enroll. The
      // foster_ended row IS the slot-consuming event from a UX perspective
      // (they finished the commitment), so this is the right moment to ask.
      const [volunteer] = await tx
        .select({ availableSlots: fosterVolunteers.availableSlots })
        .from(fosterVolunteers)
        .where(eq(fosterVolunteers.userId, fosterUserId))
        .limit(1);
      if (volunteer && volunteer.availableSlots === 0) {
        pendingNotifications.push({
          userId: fosterUserId,
          notificationType: "foster_volunteer_reenroll_prompt",
          title: `Tu tránsito con ${pet.name} terminó`,
          body: "¿Querés volver al pool y recibir nuevas propuestas?",
          severity: "info",
          ctaLabel: "Inscribirme de nuevo",
          ctaUrl: "/cuenta/ofrecerme-como-transito",
          relatedPetId: pet.id,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo finalizar el tránsito: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  redirect(`/org/${orgToken}/mascotas?fostend=${publicToken}`);
}
