"use server";

// Adoption application submit (spec adoption-listing-public §8.4, Fase 5).
//
// Called from /adoptar/{petToken}/postular when the applicant submits the
// form. The action does, in order:
//
//   1. Auth (must be logged-in non-institutional account).
//   2. Re-check listability with the same 4 cross-spec guards as the rest
//      of the adoption surface (D18-D21).
//   3. Dedupe: refuse to write a second `_submitted` event for the same
//      (applicant_user_id, pet_id) when an earlier one has no posterior
//      `_approved` or `_rejected`. Reporting "ya postulaste" instead of
//      silently double-inserting avoids spam at the refugio.
//   4. Validate the form (housing_type enum, text length caps).
//   5. Inside a single transaction: insert pet_event `_submitted`, then
//      one notification per (admin | coordinator) of the shelter org so
//      the team can pick the application up from the org portal.
//
// Notifications use `notification_type='adoption_application_received'` —
// new value in the TEXT column (no schema migration needed). The CTA URL
// points to a future `/org/{orgToken}/adopciones/{appEventId}` page which
// will be built when the org-side review surface lands.

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, notifications, organizations, ownerships, petEvents, pets, profiles } from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { validateEventPayload } from "@/lib/event-schemas";
import { createClient } from "@/lib/supabase/server";

export type SubmitAdoptionApplicationInput = {
  petPublicToken: string;
  housingType: "casa_con_patio" | "casa_sin_patio" | "departamento" | "otro";
  otherPets: string | null;
  dailyRoutine: string | null;
  notes: string | null;
};

export type SubmitAdoptionApplicationResult =
  | { ok: true; applicationEventId: string }
  | { error: string };

const MAX_TEXT_LEN = 2000;

export async function submitAdoptionApplicationAction(
  input: SubmitAdoptionApplicationInput,
): Promise<SubmitAdoptionApplicationResult> {
  // 1) Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Necesitás iniciar sesión para postularte." };

  const [profile] = await db
    .select({ accountType: profiles.accountType })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.accountType === "institutional") {
    return {
      error:
        "Las cuentas institucionales no pueden postularse para adoptar. Si querés adoptar como persona, creá una cuenta personal con otro email.",
    };
  }

  // 2) Listability — same predicate as queryAdoptionListing / ficha page /
  // startApplyIntentAction. Each call site reads a different row shape; the
  // duplication is intentional.
  const [row] = await db
    .select({ pet: pets, org: organizations })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
    .where(
      and(
        eq(pets.publicToken, input.petPublicToken),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!row) return { error: "La mascota no existe o ya no está bajo custodia de un refugio." };
  const { pet, org } = row;
  const isListable =
    pet.adoptionListedAt !== null &&
    pet.adoptionListingPausedAt === null &&
    pet.status !== "deceased" &&
    pet.status !== "lost" &&
    pet.adoptionEligible === true &&
    pet.inCustodyDispute !== true &&
    pet.rabiesObservationStatus !== "in_progress" &&
    org.verified &&
    (org.orgType === "shelter" || org.orgType === "rescue_network");
  if (!isListable) {
    return { error: `${pet.name} ya no está disponible para adopción.` };
  }

  // 3) Dedupe — applicant's earlier _submitted with no posterior decision
  // means "still pending". Block the second submit rather than double-write.
  const pending = await db.execute<{ id: string }>(sql`
    SELECT e.id::text AS id
    FROM pet_events e
    WHERE e.pet_id = ${pet.id}
      AND e.event_type = 'adoption_application_submitted'
      AND e.payload->>'applicant_user_id' = ${user.id}
      AND NOT EXISTS (
        SELECT 1 FROM pet_events d
        WHERE d.pet_id = e.pet_id
          AND d.event_type = 'adoption_application_resolved'
          AND d.payload->>'application_event_id' = e.id::text
      )
    LIMIT 1
  `);
  if (pending.length > 0) {
    return {
      error: `Ya postulaste para adoptar a ${pet.name}. El refugio recibió tu postulación y la está revisando.`,
    };
  }

  // 4) Field-level validation. The Zod schema also enforces enum + UUID
  // shape; this block returns friendlier errors for length issues.
  const trim = (s: string | null) => (s ? s.trim() || null : null);
  const otherPets = trim(input.otherPets);
  const dailyRoutine = trim(input.dailyRoutine);
  const notes = trim(input.notes);
  for (const [label, val] of [
    ["Otras mascotas", otherPets],
    ["Rutina diaria", dailyRoutine],
    ["Notas", notes],
  ] as const) {
    if (val && val.length > MAX_TEXT_LEN) {
      return { error: `${label}: máximo ${MAX_TEXT_LEN} caracteres.` };
    }
  }

  // 5) Insert event + fan-out notifications atomically.
  const payload = validateEventPayload("adoption_application_submitted", {
    applicant_user_id: user.id,
    related_organization_id: org.id,
    housing_type: input.housingType,
    other_pets: otherPets,
    daily_routine: dailyRoutine,
    notes,
  });

  const now = new Date();
  let applicationEventId = "";
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const [eventRow] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "adoption_application_submitted",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          authorOrganizationId: null,
          authorVerified: false,
          payload,
        })
        .returning({ id: petEvents.id });
      applicationEventId = eventRow.id;

      // Fan-out to admin + coordinator of the shelter org. Raw SQL mirrors
      // the established booking.ts pattern (org members → notifications).
      const orgMembers = await tx.execute<{ user_id: string }>(sql`
        SELECT user_id
        FROM organization_memberships
        WHERE organization_id = ${org.id}
          AND left_at IS NULL
          AND role IN ('admin', 'coordinator')
        LIMIT 25
      `);
      for (const m of orgMembers) {
        pendingNotifications.push({
          userId: m.user_id,
          notificationType: "adoption_application_received",
          title: `Nueva postulación para ${pet.name}`,
          body: "Una persona se postuló para adoptar. Entrá para revisar la historia y decidir.",
          severity: "info" as const,
          ctaLabel: "Revisar postulación",
          ctaUrl: `/org/${org.publicToken}/adopciones/${eventRow.id}`,
          relatedPetId: pet.id,
          relatedEventId: eventRow.id,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo enviar la postulación: ${
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

  return { ok: true, applicationEventId };
}

// ============================================================================
// Org-side review (spec adoption-listing-public §11 + Fase 6 follow-up).
//
// The shelter's admin/coordinator opens a pending application from
// /org/{orgToken}/adopciones/{appEventId} and either approves it (signals
// to the applicant the refugio wants to move forward — coordination
// happens by email, the actual ownership transition is still
// adoption_finalized) or rejects it.
//
// Both actions are gated on `adoption.review` and check:
//   - the application event exists and belongs to the org's pet,
//   - it has not already been resolved (any _approved/_rejected later),
//   - the pet has not been finalized (an adoption_finalized event closes
//     the door — the F5.5 cascade should have handled this, but we re-check
//     defensively).
// ============================================================================

export type ReviewAdoptionInput = {
  applicationEventId: string;
  notes?: string | null;
};

export type ReviewAdoptionResult = { ok: true } | { error: string };

async function loadPendingApplication(
  applicationEventId: string,
  organizationId: string,
): Promise<
  | { error: string }
  | {
      application: typeof petEvents.$inferSelect;
      pet: typeof pets.$inferSelect;
    }
> {
  const [row] = await db
    .select({ application: petEvents, pet: pets })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(petEvents.id, applicationEventId),
        eq(petEvents.eventType, "adoption_application_submitted"),
        eq(ownerships.ownerOrganizationId, organizationId),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!row) {
    return { error: "Postulación no encontrada o no pertenece a tu organización." };
  }

  // Defensive: any later resolution closes the door.
  const decided = await db.execute<{ id: string }>(sql`
    SELECT id FROM pet_events
    WHERE pet_id = ${row.pet.id}
      AND event_type = 'adoption_application_resolved'
      AND payload->>'application_event_id' = ${applicationEventId}
    LIMIT 1
  `);
  if (decided.length > 0) {
    return { error: "Esta postulación ya fue resuelta." };
  }

  const finalized = await db.execute<{ id: string }>(sql`
    SELECT id FROM pet_events
    WHERE pet_id = ${row.pet.id}
      AND event_type = 'adoption_finalized'
    LIMIT 1
  `);
  if (finalized.length > 0) {
    return { error: "Esta mascota ya fue adoptada — no es posible revisar postulaciones." };
  }

  return { application: row.application, pet: row.pet };
}

export async function approveAdoptionApplicationAction(
  orgToken: string,
  input: ReviewAdoptionInput,
): Promise<ReviewAdoptionResult> {
  const auth = await requireCapability("adoption.review");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;
  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const loaded = await loadPendingApplication(input.applicationEventId, organization.id);
  if ("error" in loaded) return loaded;
  const { application, pet } = loaded;

  const notes = input.notes?.trim() || null;
  const now = new Date();
  const payload = validateEventPayload("adoption_application_resolved", {
    application_event_id: application.id,
    reviewer_user_id: user.id,
    outcome: "approved",
    notes,
  });

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotificationsApprove: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "adoption_application_resolved",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload,
      });

      const applicantUserId = (application.payload as { applicant_user_id?: string })
        .applicant_user_id;
      if (applicantUserId) {
        pendingNotificationsApprove.push({
          userId: applicantUserId,
          notificationType: "adoption_application_approved",
          title: `Tu postulación para ${pet.name} fue aprobada`,
          body: `${organization.displayName} quiere avanzar con tu postulación. Te van a contactar por email para coordinar los próximos pasos.`,
          severity: "success",
          ctaLabel: "Ver mi postulación",
          ctaUrl: "/mis-mascotas/postulaciones",
          relatedPetId: pet.id,
          relatedEventId: application.id,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo aprobar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotificationsApprove.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotificationsApprove);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  revalidatePath(`/org/${orgToken}/adopciones`);
  revalidatePath(`/org/${orgToken}/adopciones/${input.applicationEventId}`);
  return { ok: true };
}

export async function rejectAdoptionApplicationAction(
  orgToken: string,
  input: ReviewAdoptionInput,
): Promise<ReviewAdoptionResult> {
  const auth = await requireCapability("adoption.review");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;
  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const loaded = await loadPendingApplication(input.applicationEventId, organization.id);
  if ("error" in loaded) return loaded;
  const { application, pet } = loaded;

  const notes = input.notes?.trim() || null;
  const now = new Date();
  const payload = validateEventPayload("adoption_application_resolved", {
    application_event_id: application.id,
    reviewer_user_id: user.id,
    outcome: "rejected",
    reason: notes ?? "manual_rejection",
    auto_generated: false,
    notes,
  });

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotificationsReject: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "adoption_application_resolved",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload,
      });

      const applicantUserId = (application.payload as { applicant_user_id?: string })
        .applicant_user_id;
      if (applicantUserId) {
        pendingNotificationsReject.push({
          userId: applicantUserId,
          notificationType: "adoption_application_rejected",
          title: `Tu postulación para ${pet.name} no avanzó`,
          body: `${organization.displayName} no avanzó con tu postulación esta vez. Hay otras mascotas buscando hogar.`,
          severity: "info",
          ctaLabel: "Ver otras en adopción",
          ctaUrl: "/adoptar",
          relatedPetId: pet.id,
          relatedEventId: application.id,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo rechazar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotificationsReject.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotificationsReject);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  revalidatePath(`/org/${orgToken}/adopciones`);
  revalidatePath(`/org/${orgToken}/adopciones/${input.applicationEventId}`);
  return { ok: true };
}
