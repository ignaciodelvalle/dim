"use server";

// Foster proposals — org-side server actions for the volunteer pool flow
// (spec foster-volunteers-pool v1.4 §10). The org proposes a foster, the
// volunteer accepts/rejects, the daily cron expires stale proposals. D17
// (co-foster opt-in), D16 (slot accounting), D18 (auto-cancel cascade when
// last slot is consumed) all live in this file.

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  db,
  fosterProposals,
  fosterVolunteers,
  notifications,
  organizationCapabilityGrants,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { closeCase, findOpenCaseForPetAndKind, openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { ageMonthsFromDob, computeMatch } from "@/lib/foster-matching";
import { generatePrefixedToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";

const PROPOSAL_EXPIRY_DAYS = 7;

const REJECTION_REASONS = [
  "capacity",
  "health_mismatch",
  "timing",
  "distance",
  "household",
  "other",
] as const;
type RejectionReason = (typeof REJECTION_REASONS)[number];

// Inputs ------------------------------------------------------------------

export type ProposeFosterInput = {
  orgToken: string;
  volunteerUserId: string;
  petPublicToken: string;
  proposedDurationWeeks?: number | null;
  proposedNotes?: string | null;
};

export type ProposeFosterResult = { proposalPublicToken: string } | { error: string };

export type AcceptFosterProposalInput = {
  proposalPublicToken: string;
  allowCoFoster: boolean;
  responseNotes?: string | null;
};

export type AcceptFosterProposalResult =
  | {
      fosterOwnershipId: string;
      remainingSlots: number;
      cascadeCancelledProposals: string[];
    }
  | { error: string };

export type RejectFosterProposalInput = {
  proposalPublicToken: string;
  rejectionReason: RejectionReason;
  responseNotes?: string | null;
};

export type RejectFosterProposalResult = { ok: true } | { error: string };

export type CancelFosterProposalInput = {
  proposalPublicToken: string;
  cancellationReason?: string | null;
};

export type CancelFosterProposalResult = { ok: true } | { error: string };

export type SearchFosterVolunteersInput = {
  orgToken: string;
  // Filters (all optional).
  province?: string | null;
  locality?: string | null;
  species?: "dog" | "cat" | "other";
  // When provided, scores warnings against this pet's shape.
  petPublicToken?: string | null;
  proposedDurationWeeks?: number | null;
  limit?: number;
};

export type FosterVolunteerSearchRow = {
  userId: string;
  displayName: string;
  availableSlots: number;
  acceptedCount: number;
  matchScore: number | null;
  matchWarnings: string[];
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
};

export type SearchFosterVolunteersResult = { rows: FosterVolunteerSearchRow[] } | { error: string };

// Helpers -----------------------------------------------------------------

async function resolveOrgByToken(orgToken: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.publicToken, orgToken))
    .limit(1);
  return org ?? null;
}

// User ids of org members who hold the `foster.assign` capability — used for
// fanout notifications when proposals are accepted/rejected/expired. Admins
// of the org get every capability implicitly (see lib/capabilities.ts), so
// they receive the fanout too.
async function getOrgFosterCoordinatorUserIds(orgId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: organizationMemberships.userId, role: organizationMemberships.role })
    .from(organizationMemberships)
    .leftJoin(
      organizationCapabilityGrants,
      and(
        eq(organizationCapabilityGrants.membershipId, organizationMemberships.id),
        eq(organizationCapabilityGrants.capability, "foster.assign"),
        eq(organizationCapabilityGrants.status, "approved"),
      ),
    )
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        isNull(organizationMemberships.leftAt),
      ),
    );
  const ids = new Set<string>();
  for (const r of rows) {
    // Admin always has implicit grants — keep them in the fanout.
    if (r.role === "admin") ids.add(r.userId);
  }
  // Second pass: explicit grants. The leftJoin above gives us the row when
  // a grant exists; we only count those with a grant.
  const explicit = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .innerJoin(
      organizationCapabilityGrants,
      and(
        eq(organizationCapabilityGrants.membershipId, organizationMemberships.id),
        eq(organizationCapabilityGrants.capability, "foster.assign"),
        eq(organizationCapabilityGrants.status, "approved"),
      ),
    )
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        isNull(organizationMemberships.leftAt),
      ),
    );
  for (const r of explicit) ids.add(r.userId);
  return Array.from(ids);
}

// proposeFosterAction -----------------------------------------------------

export async function proposeFosterAction(input: ProposeFosterInput): Promise<ProposeFosterResult> {
  const org = await resolveOrgByToken(input.orgToken);
  if (!org) return { error: "Organización no encontrada." };

  const auth = await requireCapability("foster.assign", org.id);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  // Pet must be in active shelter_custody by this org.
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

  // D17 — if any active foster row exists and DOESN'T allow co-foster, block.
  const activeFosterRows = await db
    .select({ allowCoFoster: ownerships.allowCoFoster })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
    );
  if (activeFosterRows.length > 0 && activeFosterRows.some((r) => !r.allowCoFoster)) {
    return { error: "Esta mascota ya tiene tránsito activo y no admite co-foster." };
  }

  // Volunteer must be active with at least one slot.
  const [volunteer] = await db
    .select()
    .from(fosterVolunteers)
    .where(eq(fosterVolunteers.userId, input.volunteerUserId))
    .limit(1);
  if (!volunteer) return { error: "Este usuario no está inscripto en el pool de voluntarios." };
  if (volunteer.status !== "active") return { error: "El voluntario no está activo en el pool." };
  if (volunteer.availableSlots <= 0) {
    return { error: "Este voluntario no tiene slots disponibles." };
  }

  // No duplicate pending proposal from this org to this volunteer for this
  // pet (anti-spam).
  const [duplicate] = await db
    .select({ id: fosterProposals.id })
    .from(fosterProposals)
    .where(
      and(
        eq(fosterProposals.organizationId, organization.id),
        eq(fosterProposals.volunteerUserId, input.volunteerUserId),
        eq(fosterProposals.petId, pet.id),
        eq(fosterProposals.status, "pending"),
      ),
    )
    .limit(1);
  if (duplicate) {
    return { error: "Ya tenés una propuesta pendiente para este voluntario y esta mascota." };
  }

  // Match snapshot — warnings get baked into the proposal so the volunteer
  // sees the same caveats the coordinator saw at proposal time.
  const matchPet = {
    species: pet.species,
    estimatedWeightKg: pet.estimatedWeightKg != null ? Number(pet.estimatedWeightKg) : null,
    ageMonths: ageMonthsFromDob(pet.dateOfBirth),
    isPpp: pet.potentiallyDangerousBreed,
    hasChronic: false,
  };
  const match = computeMatch(matchPet, volunteer, input.proposedDurationWeeks ?? null);
  const warningMessages = match.warnings.map((w) => w.message);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PROPOSAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const publicToken = generatePrefixedToken("FP");

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // Cases system (migration 0068): open the foster_proposal case first so
      // the proposal row + pet event can both carry its case_id.
      const caseRow = await openCase(
        {
          kind: "foster_proposal",
          primarySubjectKind: "registered_pet",
          primaryPetId: pet.id,
          openedByUserId: user.id,
          openedByOrganizationId: organization.id,
          jurisdictionProvince: pet.jurisdictionProvince,
          jurisdictionLocality: pet.jurisdictionLocality,
          openedReason: `Foster proposal to volunteer ${input.volunteerUserId} by org ${organization.id}`,
        },
        tx,
      );

      await tx.insert(fosterProposals).values({
        publicToken,
        organizationId: organization.id,
        volunteerUserId: input.volunteerUserId,
        petId: pet.id,
        proposedByUserId: user.id,
        proposedAt: now,
        proposedDurationWeeks: input.proposedDurationWeeks ?? null,
        proposedNotes: input.proposedNotes?.trim() || null,
        matchWarnings: warningMessages,
        expiresAt,
        status: "pending",
        caseId: caseRow.id,
        createdAt: now,
        updatedAt: now,
      });

      const payload = validateEventPayload("foster_proposed", {
        proposal_public_token: publicToken,
        volunteer_user_id: input.volunteerUserId,
        proposed_duration_weeks: input.proposedDurationWeeks ?? null,
        match_warnings: warningMessages,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "foster_proposed",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload,
        caseId: caseRow.id,
      });

      pendingNotifications.push({
        userId: input.volunteerUserId,
        notificationType: "foster_proposal_received",
        severity: "info",
        title: `${organization.displayName} te propuso un tránsito`,
        body: `Mascota: ${pet.name}. Revisá los detalles y aceptá o rechazá.`,
        ctaLabel: "Ver propuesta",
        ctaUrl: `/cuenta/transitos/propuestas/${publicToken}`,
        relatedPetId: pet.id,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo crear la propuesta: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (proposeFosterAction did succeed)", e);
    }
  }

  revalidatePath(`/org/${input.orgToken}/voluntarios/propuestas`);
  return { proposalPublicToken: publicToken };
}

// acceptFosterProposalAction ----------------------------------------------

export async function acceptFosterProposalAction(
  input: AcceptFosterProposalInput,
): Promise<AcceptFosterProposalResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const cascadeCancelled: string[] = [];
  let result: { fosterOwnershipId: string; remainingSlots: number } | null = null;

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    result = await db.transaction(
      async (tx): Promise<{ fosterOwnershipId: string; remainingSlots: number }> => {
        const [proposal] = await tx
          .select()
          .from(fosterProposals)
          .where(eq(fosterProposals.publicToken, input.proposalPublicToken))
          .limit(1);
        if (!proposal) throw new Error("Propuesta no encontrada.");
        if (proposal.volunteerUserId !== user.id) throw new Error("Esta propuesta no es para vos.");
        if (proposal.status !== "pending") throw new Error("Esta propuesta ya no está activa.");

        const [pet] = await tx.select().from(pets).where(eq(pets.id, proposal.petId)).limit(1);
        if (!pet) throw new Error("Mascota no encontrada.");

        // Re-validate org custody (defense-in-depth — the org could have
        // released custody between propose and accept).
        const [orgCustody] = await tx
          .select({ id: ownerships.id })
          .from(ownerships)
          .where(
            and(
              eq(ownerships.petId, pet.id),
              eq(ownerships.ownerOrganizationId, proposal.organizationId),
              eq(ownerships.role, "shelter_custody"),
              isNull(ownerships.endedAt),
            ),
          )
          .limit(1);
        if (!orgCustody) {
          throw new Error("La organización ya no tiene custodia de esta mascota.");
        }

        const activeFosterRows = await tx
          .select({ allowCoFoster: ownerships.allowCoFoster })
          .from(ownerships)
          .where(
            and(
              eq(ownerships.petId, pet.id),
              eq(ownerships.role, "foster"),
              isNull(ownerships.endedAt),
            ),
          );
        if (activeFosterRows.length > 0 && activeFosterRows.some((r) => !r.allowCoFoster)) {
          throw new Error(
            "El estado del pet cambió: ahora tiene un tránsito activo que no admite co-foster.",
          );
        }

        const [volunteer] = await tx
          .select()
          .from(fosterVolunteers)
          .where(eq(fosterVolunteers.userId, user.id))
          .limit(1);
        if (!volunteer) throw new Error("No estás inscripto en el pool.");
        if (volunteer.status !== "active") throw new Error("Tu inscripción no está activa.");
        if (volunteer.availableSlots <= 0) throw new Error("Ya no tenés slots disponibles.");

        const now = new Date();

        // Create the foster ownership FIRST so we can flip the proposal to
        // 'accepted' with resolved_ownership_id set in a single statement.
        // The CHECK constraint `foster_proposals_response_consistent` enforces
        // (status='accepted' → responded_at IS NOT NULL AND resolved_ownership_id IS NOT NULL),
        // which fails if these are split across two UPDATEs.
        const [fosterOwnership] = await tx
          .insert(ownerships)
          .values({
            petId: pet.id,
            ownerUserId: user.id,
            role: "foster",
            startedAt: now,
            allowCoFoster: input.allowCoFoster,
          })
          .returning({ id: ownerships.id });

        await tx
          .update(fosterProposals)
          .set({
            status: "accepted",
            respondedAt: now,
            responseNotes: input.responseNotes?.trim() || null,
            resolvedOwnershipId: fosterOwnership.id,
            updatedAt: now,
          })
          .where(eq(fosterProposals.id, proposal.id));

        // Cases system: resolve the case_id for this proposal (new rows have it
        // directly; pre-migration rows fall back to the open-case query).
        const proposalCaseId =
          proposal.caseId ??
          (await findOpenCaseForPetAndKind(pet.id, "foster_proposal", tx))?.id ??
          null;

        const acceptedPayload = validateEventPayload("foster_proposal_resolved", {
          proposal_public_token: proposal.publicToken,
          outcome: "accepted",
          response_notes: input.responseNotes?.trim() || null,
        });
        const assignedPayload = validateEventPayload("foster_assigned", {
          foster_user_id: user.id,
          expected_weeks: proposal.proposedDurationWeeks,
          notes: input.responseNotes?.trim() || null,
        });
        await tx.insert(petEvents).values([
          {
            petId: pet.id,
            eventType: "foster_proposal_resolved",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: user.id,
            authorRole: "owner",
            authorOrganizationId: null,
            authorVerified: false,
            payload: acceptedPayload,
            caseId: proposalCaseId,
          },
          {
            petId: pet.id,
            eventType: "foster_assigned",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: user.id,
            authorRole: "shelter",
            authorOrganizationId: proposal.organizationId,
            authorVerified: true,
            payload: assignedPayload,
            caseId: proposalCaseId,
          },
        ]);

        // Close the foster_proposal case (accepted = resolved).
        if (proposalCaseId) {
          await closeCase(
            { caseId: proposalCaseId, reason: "resolved", closedByUserId: user.id },
            tx,
          );
        }

        if (input.allowCoFoster) {
          const coFosterPayload = validateEventPayload("foster_co_foster_allowed", {
            allow_co_foster: true,
            foster_ownership_id: fosterOwnership.id,
          });
          await tx.insert(petEvents).values({
            petId: pet.id,
            eventType: "foster_co_foster_allowed",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: user.id,
            authorRole: "owner",
            authorOrganizationId: null,
            authorVerified: false,
            payload: coFosterPayload,
          });
        }

        // D16 — slot decrement.
        const newSlots = volunteer.availableSlots - 1;
        await tx
          .update(fosterVolunteers)
          .set({ availableSlots: newSlots, updatedAt: now })
          .where(eq(fosterVolunteers.id, volunteer.id));

        // D18 — auto-cancel cascade when the last slot is consumed.
        // Recipients are computed inside tx (we need the org ids from each
        // proposal); push onto pendingNotifications for post-commit fire.
        if (newSlots === 0) {
          const others = await tx
            .select()
            .from(fosterProposals)
            .where(
              and(
                eq(fosterProposals.volunteerUserId, user.id),
                eq(fosterProposals.status, "pending"),
                ne(fosterProposals.id, proposal.id),
              ),
            );
          for (const p of others) {
            await tx
              .update(fosterProposals)
              .set({
                status: "cancelled",
                cancelledAt: now,
                cancelledByUserId: user.id,
                cancellationReason: "volunteer_accepted_another",
                updatedAt: now,
              })
              .where(eq(fosterProposals.id, p.id));

            // Resolve case_id for this cascade-cancelled proposal.
            const otherCaseId =
              p.caseId ??
              (await findOpenCaseForPetAndKind(p.petId, "foster_proposal", tx))?.id ??
              null;

            const cancelPayload = validateEventPayload("foster_proposal_resolved", {
              proposal_public_token: p.publicToken,
              outcome: "cancelled",
              cancellation_reason: "volunteer_accepted_another",
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
              payload: cancelPayload,
              caseId: otherCaseId,
            });

            // Close the case for this cascade-cancelled proposal.
            if (otherCaseId) {
              await closeCase(
                { caseId: otherCaseId, reason: "cancelled", closedByUserId: user.id },
                tx,
              );
            }

            // Notify the affected org coordinators.
            const otherOrgIds = await getOrgFosterCoordinatorUserIds(p.organizationId);
            for (const uid of otherOrgIds) {
              pendingNotifications.push({
                userId: uid,
                notificationType: "foster_proposal_auto_cancelled_org",
                severity: "info",
                title: "Tu propuesta de tránsito fue auto-cancelada",
                body: "El voluntario aceptó otra propuesta y se quedó sin slots.",
                relatedPetId: p.petId,
              });
            }

            cascadeCancelled.push(p.publicToken);
          }
        }

        // Notify the accepting org.
        const acceptOrgIds = await getOrgFosterCoordinatorUserIds(proposal.organizationId);
        const [adopterProfile] = await tx
          .select({ displayName: profiles.displayName })
          .from(profiles)
          .where(eq(profiles.id, user.id))
          .limit(1);
        for (const uid of acceptOrgIds) {
          pendingNotifications.push({
            userId: uid,
            notificationType: "foster_proposal_accepted_org",
            severity: "success",
            title: `${adopterProfile?.displayName ?? "Un voluntario"} aceptó la propuesta de tránsito`,
            body: `Mascota: ${pet.name}. Coordiná el handoff con el voluntario.`,
            relatedPetId: pet.id,
          });
        }

        return { fosterOwnershipId: fosterOwnership.id, remainingSlots: newSlots };
      },
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo aceptar la propuesta.",
    };
  }

  if (!result) return { error: "Error inesperado al aceptar." };

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (acceptFosterProposalAction did succeed)", e);
    }
  }

  revalidatePath("/cuenta/transitos/propuestas");
  revalidatePath("/mis-mascotas");
  return {
    fosterOwnershipId: result.fosterOwnershipId,
    remainingSlots: result.remainingSlots,
    cascadeCancelledProposals: cascadeCancelled,
  };
}

// rejectFosterProposalAction ----------------------------------------------

export async function rejectFosterProposalAction(
  input: RejectFosterProposalInput,
): Promise<RejectFosterProposalResult> {
  if (!REJECTION_REASONS.includes(input.rejectionReason)) {
    return { error: "Motivo de rechazo inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const [proposal] = await tx
        .select()
        .from(fosterProposals)
        .where(eq(fosterProposals.publicToken, input.proposalPublicToken))
        .limit(1);
      if (!proposal) throw new Error("Propuesta no encontrada.");
      if (proposal.volunteerUserId !== user.id) throw new Error("Esta propuesta no es para vos.");
      if (proposal.status !== "pending") throw new Error("Esta propuesta ya no está activa.");

      const now = new Date();
      await tx
        .update(fosterProposals)
        .set({
          status: "rejected",
          respondedAt: now,
          responseNotes: input.responseNotes?.trim() || null,
          rejectionReason: input.rejectionReason,
          updatedAt: now,
        })
        .where(eq(fosterProposals.id, proposal.id));

      // Cases system: resolve case_id and close.
      const proposalCaseId =
        proposal.caseId ??
        (await findOpenCaseForPetAndKind(proposal.petId, "foster_proposal", tx))?.id ??
        null;

      const payload = validateEventPayload("foster_proposal_resolved", {
        proposal_public_token: proposal.publicToken,
        outcome: "rejected",
        rejection_reason: input.rejectionReason,
        response_notes: input.responseNotes?.trim() || null,
      });
      await tx.insert(petEvents).values({
        petId: proposal.petId,
        eventType: "foster_proposal_resolved",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        authorOrganizationId: null,
        authorVerified: false,
        payload,
        caseId: proposalCaseId,
      });

      // Rejected = resolved (volunteer declined, org can re-propose).
      if (proposalCaseId) {
        await closeCase(
          { caseId: proposalCaseId, reason: "resolved", closedByUserId: user.id },
          tx,
        );
      }

      const orgIds = await getOrgFosterCoordinatorUserIds(proposal.organizationId);
      for (const uid of orgIds) {
        pendingNotifications.push({
          userId: uid,
          notificationType: "foster_proposal_rejected_org",
          severity: "info",
          title: "Una propuesta de tránsito fue rechazada",
          body: `Motivo: ${input.rejectionReason}. Probá con otro voluntario del pool.`,
          relatedPetId: proposal.petId,
        });
      }
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo rechazar la propuesta.",
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (rejectFosterProposalAction did succeed)", e);
    }
  }

  revalidatePath("/cuenta/transitos/propuestas");
  return { ok: true };
}

// cancelFosterProposalAction ---------------------------------------------

export async function cancelFosterProposalAction(
  input: CancelFosterProposalInput,
): Promise<CancelFosterProposalResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const [proposal] = await tx
        .select()
        .from(fosterProposals)
        .where(eq(fosterProposals.publicToken, input.proposalPublicToken))
        .limit(1);
      if (!proposal) throw new Error("Propuesta no encontrada.");
      if (proposal.status !== "pending") throw new Error("Esta propuesta ya no está activa.");

      // Capability check — the caller must hold foster.assign in the
      // proposing org.
      const auth = await requireCapability("foster.assign", proposal.organizationId);
      if (auth.error !== null) throw new Error(auth.error);

      const now = new Date();
      await tx
        .update(fosterProposals)
        .set({
          status: "cancelled",
          cancelledAt: now,
          cancelledByUserId: user.id,
          cancellationReason: input.cancellationReason?.trim() || "org_cancelled",
          updatedAt: now,
        })
        .where(eq(fosterProposals.id, proposal.id));

      // Cases system: resolve case_id and close.
      const proposalCaseId =
        proposal.caseId ??
        (await findOpenCaseForPetAndKind(proposal.petId, "foster_proposal", tx))?.id ??
        null;

      const payload = validateEventPayload("foster_proposal_resolved", {
        proposal_public_token: proposal.publicToken,
        outcome: "cancelled",
        cancellation_reason: input.cancellationReason?.trim() || "org_cancelled",
        auto_cancelled: false,
      });
      await tx.insert(petEvents).values({
        petId: proposal.petId,
        eventType: "foster_proposal_resolved",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: proposal.organizationId,
        authorVerified: true,
        payload,
        caseId: proposalCaseId,
      });

      // Org cancelled the proposal.
      if (proposalCaseId) {
        await closeCase(
          { caseId: proposalCaseId, reason: "cancelled", closedByUserId: user.id },
          tx,
        );
      }

      // Notify volunteer.
      pendingNotifications.push({
        userId: proposal.volunteerUserId,
        notificationType: "foster_proposal_cancelled_volunteer",
        severity: "info",
        title: "Una propuesta de tránsito fue cancelada",
        body: "La organización canceló la propuesta antes de tu respuesta.",
        relatedPetId: proposal.petId,
      });
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo cancelar la propuesta.",
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (cancelFosterProposalAction did succeed)", e);
    }
  }

  return { ok: true };
}

// searchFosterVolunteers --------------------------------------------------

// Read action used by the org's volunteer-search UI. Filters by active +
// slots > 0, optionally by species/locality, optionally scoring against a
// concrete pet. Always returns at most `limit` rows (default 50).
//
// Sort order:
//   1. matchScore DESC (when pet provided; otherwise null → bucketed last)
//   2. availableSlots DESC
//   3. acceptedCount DESC (proxy for "experienced voluntary")
export async function searchFosterVolunteers(
  input: SearchFosterVolunteersInput,
): Promise<SearchFosterVolunteersResult> {
  const org = await resolveOrgByToken(input.orgToken);
  if (!org) return { error: "Organización no encontrada." };

  const auth = await requireCapability("foster.assign", org.id);
  if (auth.error !== null) return { error: auth.error };

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  // Filters on the volunteer row.
  const whereClauses = [
    eq(fosterVolunteers.status, "active"),
    sql`${fosterVolunteers.availableSlots} > 0`,
  ];
  if (input.province) {
    whereClauses.push(eq(fosterVolunteers.jurisdictionProvince, input.province));
  }
  if (input.locality) {
    whereClauses.push(eq(fosterVolunteers.jurisdictionLocality, input.locality));
  }
  if (input.species === "dog") whereClauses.push(eq(fosterVolunteers.acceptsDogs, true));
  if (input.species === "cat") whereClauses.push(eq(fosterVolunteers.acceptsCats, true));
  if (input.species === "other") whereClauses.push(eq(fosterVolunteers.acceptsOtherSpecies, true));

  const rawVolunteers = await db
    .select({
      volunteer: fosterVolunteers,
      profileName: profiles.displayName,
    })
    .from(fosterVolunteers)
    .innerJoin(profiles, eq(profiles.id, fosterVolunteers.userId))
    .where(and(...whereClauses))
    .orderBy(desc(fosterVolunteers.availableSlots))
    .limit(limit);

  // Optional match scoring against a specific pet.
  let petShape: {
    species: string;
    estimatedWeightKg: number | null;
    ageMonths: number | null;
    isPpp: boolean;
  } | null = null;
  if (input.petPublicToken) {
    const [petRow] = await db
      .select()
      .from(pets)
      .where(eq(pets.publicToken, input.petPublicToken))
      .limit(1);
    if (petRow) {
      petShape = {
        species: petRow.species,
        estimatedWeightKg:
          petRow.estimatedWeightKg != null ? Number(petRow.estimatedWeightKg) : null,
        ageMonths: ageMonthsFromDob(petRow.dateOfBirth),
        isPpp: petRow.potentiallyDangerousBreed,
      };
    }
  }

  // Accepted count per volunteer (proxy for "trusted"). One query, grouped.
  const counts = await db
    .select({
      userId: fosterProposals.volunteerUserId,
      count: sql<number>`count(*)::int`,
    })
    .from(fosterProposals)
    .where(eq(fosterProposals.status, "accepted"))
    .groupBy(fosterProposals.volunteerUserId);
  const countMap = new Map<string, number>();
  for (const c of counts) countMap.set(c.userId, c.count);

  const rows: FosterVolunteerSearchRow[] = rawVolunteers.map(({ volunteer, profileName }) => {
    let matchScore: number | null = null;
    let matchWarnings: string[] = [];
    if (petShape) {
      const m = computeMatch(
        { ...petShape, hasChronic: false },
        volunteer,
        input.proposedDurationWeeks ?? null,
      );
      matchScore = m.score;
      matchWarnings = m.warnings.map((w) => w.message);
    }
    return {
      userId: volunteer.userId,
      displayName: profileName,
      availableSlots: volunteer.availableSlots,
      acceptedCount: countMap.get(volunteer.userId) ?? 0,
      matchScore,
      matchWarnings,
      jurisdictionProvince: volunteer.jurisdictionProvince,
      jurisdictionLocality: volunteer.jurisdictionLocality,
    };
  });

  // Final sort (in-memory) — matchScore primary when available, else
  // slots+experience.
  rows.sort((a, b) => {
    if (a.matchScore != null && b.matchScore != null && a.matchScore !== b.matchScore) {
      return b.matchScore - a.matchScore;
    }
    if (a.availableSlots !== b.availableSlots) return b.availableSlots - a.availableSlots;
    return b.acceptedCount - a.acceptedCount;
  });

  return { rows };
}
