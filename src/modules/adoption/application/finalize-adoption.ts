// Use-case: finalize an adoption.
//
// This is the composite custody event. Migrated from app/actions/adoption.ts::finalizeAdoptionAction.
// Auth (adoption.finalize capability) is handled by the caller (thin action).
//
// Orchestrates:
//   1. Input validation (domain rules: DNI path or foster-shortcut path)
//   2. Pet lookup + eligibility gate
//   3. Active foster lookup
//   4. Adopter resolution (foster-shortcut or DNI lookup/stub-create)
//   5. Pre-tx: find open custody case
//   6. Atomic transaction (via repo.insertAdoptionFinalized):
//      - Stub profile insert (if needed)
//      - Close shelter_custody
//      - Close foster + foster_placement case (if any)
//      - Insert owner row
//      - Insert adoption_finalized event
//      - Close custody_episode case
//      - Auto-reject pending applications cascade
//   7. Collect post-tx best-effort notifications
//   8. Return UseCaseResult with notifications array (action flushes)
//
// NOT handled here (stays in the action):
//   - requireCapability("adoption.finalize")
//   - Parsing formData
//   - Storage upload (pre-tx, before this use-case is called)
//   - revalidatePath / redirect
//   - Flushing pendingNotifications (post-tx, best-effort)

import { validateFinalizationInput } from "../domain/finalize-rules";
import type { FinalizationInput } from "../domain/types";
import type { AdoptionRepository } from "../infrastructure/adoption-repository";
import type { NewNotification, UseCaseResult } from "./set-adoption-eligibility";

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
  repo: typeof AdoptionRepository;
  actor: Actor;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type FinalizeAdoptionInput = FinalizationInput & {
  petPublicToken: string;
  /** Pre-uploaded contract attachment id (or null). Upload happens before tx. */
  contractAttachmentId: string | null;
  /** Supabase Storage path returned by the upload helper (null when no file). */
  contractStoragePath: string | null;
  /** MIME type returned by the upload helper (null when no file). */
  contractMimeType: string | null;
  /** Byte size of the stored file returned by the upload helper (null when no file). */
  contractFileSize: number | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDni(raw: string): string {
  return raw.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function finalizeAdoption(
  input: FinalizeAdoptionInput,
  deps: Deps,
): Promise<UseCaseResult<{ eventId: string }>> {
  const { repo, actor, transaction } = deps;
  const { user, organization } = actor;

  // 1. Load pet from shelter custody (repo lookup — no auth inside use-case).
  const petRow = await repo.findShelterPet(input.petPublicToken, organization.id);
  if (!petRow) {
    return {
      ok: false,
      error: "Mascota no encontrada o no está bajo custodia de tu organización.",
    };
  }

  // 2. Eligibility gate.
  if (petRow.adoptionEligible !== true) {
    if (petRow.adoptionEligible === false) {
      const reasonLabel = petRow.adoptionIneligibleReason ?? "sin motivo registrado";
      return {
        ok: false,
        error: `Esta mascota está marcada como no apta para adopción (motivo: ${reasonLabel}). Resolvé el motivo desde el perfil del pet antes de finalizar.`,
      };
    }
    return {
      ok: false,
      error:
        "Esta mascota no fue evaluada para adopción todavía. Marcala como apta desde su perfil antes de finalizar.",
    };
  }

  // 3. Active foster lookup (optional).
  const fosterRow = await repo.findActiveFoster(petRow.id);
  const fosterUserId = fosterRow?.ownerUserId ?? null;

  // 4. Input validation (domain rules: DNI path vs. foster-shortcut path).
  const domainInput: FinalizationInput = {
    adopterUserId: input.adopterUserId,
    adopterDni: input.adopterDni,
    adopterDisplayName: input.adopterDisplayName,
    adopterPhone: input.adopterPhone,
    followupMonths: input.followupMonths,
    notes: input.notes,
  };
  const validation = validateFinalizationInput(domainInput, fosterRow);
  if (!validation.ok) return { ok: false, error: validation.error };

  // 5. Resolve adopter identity.
  let adopterUserId: string;
  let isStubAdopter: boolean;
  let dni: string | null = null;

  if (input.adopterUserId) {
    // Foster-shortcut: adopterUserId is the foster's profile id.
    // validateFinalizationInput already confirmed the foster match; now validate profile.
    const adopterProfile = await repo.findApplicantProfile(input.adopterUserId);
    if (!adopterProfile) {
      return { ok: false, error: "No encontramos el perfil del adoptante." };
    }
    if (
      adopterProfile.accountType !== "personal" ||
      adopterProfile.role !== "owner" ||
      !adopterProfile.dniVerified
    ) {
      return {
        ok: false,
        error:
          "El adoptante debe ser una cuenta personal con DNI verificado para usar el atajo de tránsito.",
      };
    }
    adopterUserId = adopterProfile.id;
    isStubAdopter = false;
  } else {
    // Manual DNI path.
    const rawDni = input.adopterDni ?? "";
    dni = normalizeDni(rawDni);

    const existingProfile = await repo.findStubAdopterByDni(dni);
    if (existingProfile) {
      adopterUserId = existingProfile.id;
      isStubAdopter = false;
    } else {
      const { randomUUID } = await import("node:crypto");
      adopterUserId = randomUUID();
      isStubAdopter = true;
    }
  }

  // 6. Pre-tx: find open custody_episode case (null if never intaked).
  const custodyCase = await repo.findOpenCustodyCase(petRow.id);
  const custodyCaseId = custodyCase?.id ?? null;

  const now = new Date();
  const followupMonths =
    input.followupMonths !== null ? Math.min(36, Math.max(0, input.followupMonths)) : null;

  const pendingNotifications: NewNotification[] = [];
  let eventId = "";

  // 7. Atomic transaction.
  try {
    await transaction(async (tx) => {
      const { eventId: insertedEventId } = await repo.insertAdoptionFinalized(
        {
          petId: petRow.id,
          userId: user.id,
          orgId: organization.id,
          orgVerified: organization.verified,
          custodyOwnershipId: petRow.custodyOwnershipId,
          adopterUserId,
          isStubAdopter,
          fosterRow,
          fosterUserId,
          custodyCaseId,
          displayName: input.adopterDisplayName,
          phone: input.adopterPhone,
          dni,
          contractAttachmentId: input.contractAttachmentId,
          contractStoragePath: input.contractStoragePath,
          contractMimeType: input.contractMimeType,
          contractFileSize: input.contractFileSize,
          followupMonths: isStubAdopter ? null : followupMonths,
          notes: input.notes,
          orgDisplayName: organization.displayName,
          petName: petRow.name,
          now,
        },
        tx as Parameters<typeof repo.insertAdoptionFinalized>[1],
      );
      eventId = insertedEventId;

      // Auto-rejection cascade for pending applications.
      const pendingApps = await repo.findPendingApplicationsExcluding(
        petRow.id,
        adopterUserId,
        tx as Parameters<typeof repo.findPendingApplicationsExcluding>[2],
      );

      for (const app of pendingApps) {
        await repo.resolveApplication(
          {
            petId: petRow.id,
            applicationEventId: app.applicationId,
            outcome: "rejected",
            reviewerUserId: user.id,
            orgId: organization.id,
            orgVerified: organization.verified,
            reason: "another_application_finalized",
            autoGenerated: true,
            notes: null,
            now,
          },
          tx as Parameters<typeof repo.resolveApplication>[1],
        );
        pendingNotifications.push({
          userId: app.applicantUserId,
          notificationType: "adoption_application_closed",
          category: "adoption",
          title: `${petRow.name} encontró hogar`,
          body: `${petRow.name} fue adoptado/a por otra postulación. Sabemos que es decepcionante. ${organization.displayName} tiene otras mascotas en adopción.`,
          severity: "info",
          ctaLabel: "Ver otras en adopción",
          ctaUrl: "/adoptar",
          relatedPetId: petRow.id,
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo finalizar la adopción: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  // 8. Post-tx: collect additional notifications (not flushed here — action does it).
  if (!isStubAdopter) {
    pendingNotifications.push({
      userId: adopterUserId,
      notificationType: "adoption_finalized",
      category: "adoption",
      title: `Adoptaste a ${petRow.name}`,
      body: `${organization.displayName} te registró como dueño/a de ${petRow.name}. Bienvenida a la familia.`,
      severity: "success",
      ctaLabel: "Ver mascota",
      ctaUrl: "/mis-mascotas",
      relatedPetId: petRow.id,
    });
  }

  if (fosterUserId && fosterUserId !== adopterUserId) {
    pendingNotifications.push({
      userId: fosterUserId,
      notificationType: "foster_ended_by_adoption",
      category: "adoption",
      title: `${petRow.name} fue adoptado/a`,
      body: `El tránsito que tenías a cargo se cerró: ${petRow.name} encontró un hogar permanente.`,
      severity: "success",
      ctaLabel: "Ver detalles",
      ctaUrl: "/mis-mascotas",
      relatedPetId: petRow.id,
    });
  }

  return { ok: true, value: { eventId }, notifications: pendingNotifications };
}
