// Use-case: direct org-to-org custody handoff (custody.transfer).
//
// Migrated from app/actions/transfer.ts::transferCustodyAction.
// Auth (requireCapability('custody.transfer')) is handled by the caller.
// Auth scope: pet ownership MUST match caller's active org — implicit-org security boundary.
//
// Orchestrates:
//   1. Destination validation (non-empty, not same as source)
//   2. Pet lookup scoped to caller org (findPetUnderOrg) — auth boundary
//   3. Source role validation (must be shelter_custody or owner)
//   4. Silent role coercion for newRole (parity quirk)
//   5. Destination org lookup + verified check
//   6. Active foster row lookup (for cascade)
//   7. Pre-tx: findOpenCustodyEpisode
//   8. ATOMIC tx:
//      a. closeOwnershipById (source)
//      b. If foster: closeFosterOwnership + insertPetEvent(foster_ended, UPFRONT UUID)
//      c. insertShelterCustody (destination, with transferredFromId)
//      d. insertPetEvent(custody_transferred, references foster_ended UUID)
//      e. closeCase(custody_episode, resolved) if open
//      f. collect dest admin notifications + foster user notification
//   9. Return UseCaseResult<void> + notifications
//
// PARITY QUIRKS:
//   - foster_ended UUID is generated BEFORE tx; custody_transferred payload
//     references it as foster_ended_event_id (CHECK-constraint ordering).
//   - Notifies dest ADMINS ONLY (not coordinators) — asymmetry vs cross-org.
//   - Silent role coercion: invalid newRole → shelter_custody (no error).
//   - Redirect to /org/{orgToken}/mascotas?transferido={petToken} is done by action.

import { randomUUID } from "node:crypto";
import {
  resolveNewRole,
  validateDestinationNotSource,
  validateTransferableSourceRole,
} from "../domain/direct-transfer-rules";
import type { TransfersRepository } from "../infrastructure/transfers-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Actor = {
  user: { id: string };
  organization: {
    id: string;
    publicToken: string;
    verified: boolean;
    displayName: string;
  };
};

type Deps = {
  repo: typeof TransfersRepository;
  actor: Actor;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type TransferCustodyInput = {
  petPublicToken: string;
  destinationOrgId: string;
  newRoleRaw: string;
  notes?: string | null;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function transferCustody(
  input: TransferCustodyInput,
  deps: Deps,
): Promise<UseCaseResult<void>> {
  const { repo, actor, transaction } = deps;
  const { user, organization } = actor;

  // 1. Destination validation.
  if (!input.destinationOrgId) {
    return { ok: false, error: "Falta la organización destino." };
  }
  const destNotSrcGuard = validateDestinationNotSource(organization.id, input.destinationOrgId);
  if (!destNotSrcGuard.ok) return destNotSrcGuard;

  // 2. Pet lookup scoped to caller org (implicit-org security boundary).
  const petRow = await repo.findPetUnderOrg(input.petPublicToken, organization.id);
  if (!petRow) {
    return {
      ok: false,
      error: "Mascota no encontrada o no está bajo custodia de tu organización.",
    };
  }

  // 3. Source role validation.
  const srcRoleGuard = validateTransferableSourceRole(petRow.ownershipRole);
  if (!srcRoleGuard.ok) return srcRoleGuard;

  // 4. Silent role coercion (parity quirk — no error on invalid newRole).
  const newRole = resolveNewRole(input.newRoleRaw);

  // 5. Destination org lookup + verified check.
  const destination = await repo.findReceiverOrg(input.destinationOrgId);
  if (!destination) return { ok: false, error: "Organización destino no encontrada." };
  if (!destination.verified) {
    return { ok: false, error: "La organización destino aún no está verificada." };
  }

  // 6. Active foster row lookup.
  const fosterRow = await repo.findActiveFosterRow(petRow.pet.id);

  // 7. Pre-tx: find open custody_episode.
  const custodyCase = await repo.findOpenCustodyEpisode(petRow.pet.id);

  // Upfront UUID for foster_ended event — needed BEFORE custody_transferred payload
  // is constructed (CHECK-constraint ordering: foster_ended referenced by UUID).
  const fosterEndedEventId = fosterRow ? randomUUID() : null;

  const pendingNotifications: NewNotification[] = [];

  // 8. Atomic transaction.
  try {
    await transaction(async (tx) => {
      const now = new Date();
      const authorVerified = organization.verified;

      // Close source ownership.
      await repo.closeOwnershipById(
        petRow.ownershipId,
        now,
        tx as Parameters<typeof repo.closeOwnershipById>[2],
      );

      // Foster cascade: close foster + emit foster_ended FIRST (UUID upfront).
      if (fosterRow && fosterEndedEventId) {
        await repo.closeFosterOwnership(
          fosterRow.id,
          now,
          tx as Parameters<typeof repo.closeFosterOwnership>[2],
        );
        await repo.insertPetEvent(
          {
            id: fosterEndedEventId,
            petId: petRow.pet.id,
            eventType: "foster_ended",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: user.id,
            authorRole: "shelter",
            authorOrganizationId: organization.id,
            authorVerified,
            payload: {
              foster_user_id: fosterRow.ownerUserId,
              reason: "other",
              notes: "Transferencia de custodia a otra organización.",
            },
          },
          tx as Parameters<typeof repo.insertPetEvent>[1],
        );
      }

      // Insert destination ownership.
      await repo.insertShelterCustody(
        {
          petId: petRow.pet.id,
          ownerOrganizationId: destination.id,
          role: newRole,
          startedAt: now,
          transferredFromId: petRow.ownershipId,
        },
        tx as Parameters<typeof repo.insertShelterCustody>[1],
      );

      // Emit custody_transferred (AFTER foster_ended — UUID reference is safe now).
      await repo.insertPetEvent(
        {
          petId: petRow.pet.id,
          eventType: "custody_transferred",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "shelter",
          authorOrganizationId: organization.id,
          authorVerified,
          payload: {
            from_organization_id: organization.id,
            to_organization_id: destination.id,
            from_role: petRow.ownershipRole,
            to_role: newRole,
            foster_ended_event_id: fosterEndedEventId,
            notes: input.notes ?? null,
          },
          caseId: custodyCase?.id ?? null,
        },
        tx as Parameters<typeof repo.insertPetEvent>[1],
      );

      // Close custody_episode if open.
      if (custodyCase) {
        await repo.closeCase(
          { caseId: custodyCase.id, reason: "resolved", closedByUserId: user.id },
          tx as Parameters<typeof repo.closeCase>[1],
        );
      }

      // Fan out to destination ADMINS ONLY (parity — not coordinators).
      const admins = await repo.orgAdminUserIds(
        destination.id,
        tx as Parameters<typeof repo.orgAdminUserIds>[1],
      );
      for (const a of admins) {
        pendingNotifications.push({
          userId: a.userId,
          notificationType: "custody_received",
          severity: "info",
          title: `Recibiste a ${petRow.pet.name}`,
          body: `${organization.displayName} transfirió a ${petRow.pet.name} a tu organización (${
            newRole === "shelter_custody" ? "custodia temporal" : "dueño permanente"
          }).`,
          ctaLabel: "Ver mascota",
          ctaUrl: `/org/${organization.publicToken}/mascotas`,
          relatedPetId: petRow.pet.id,
        });
      }

      // Notify foster user if any (best-effort, post-tx).
      if (fosterRow?.ownerUserId) {
        pendingNotifications.push({
          userId: fosterRow.ownerUserId,
          notificationType: "foster_ended_by_transfer",
          severity: "info",
          title: `${petRow.pet.name} cambió de refugio`,
          body: `El tránsito que tenías a cargo se cerró porque ${petRow.pet.name} fue transferido a ${destination.displayName}.`,
          relatedPetId: petRow.pet.id,
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo transferir la custodia: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true, value: undefined, notifications: pendingNotifications };
}
