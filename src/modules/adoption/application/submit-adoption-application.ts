// Use-case: submit an adoption application (applicant/public user flow).
//
// Receives the applicant user id (already validated by the action) and the
// input DTO. Does NOT call requireCapability — applicants are public users
// and the action verifies they are logged in before calling this use-case.
//
// Orchestrates:
//   1. Profile check (institutional blocked)
//   2. Pet + org lookup + listability check
//   3. Duplicate-pending check
//   4. Consent gate
//   5. Atomic: insert application event (inside tx)
//   6. Returns notifications for fan-out (action flushes post-tx, best-effort)
//
// The caller (thin action) is responsible for:
//   - Auth check (user logged in)
//   - Parsing/casting the raw form input
//   - Flushing returned notifications post-transaction

import { validateApplicationInput } from "../domain/application-rules";
import { isListable } from "../domain/listing-rules";
import type { ApplicationInput } from "../domain/types";
import type { AdoptionRepository } from "../infrastructure/adoption-repository";
import type { NewNotification, UseCaseResult } from "./set-adoption-eligibility";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Applicant = { userId: string } | null;

type Deps = {
  repo: typeof AdoptionRepository;
  applicant: Applicant;
  /** db.transaction — injected so unit tests can swap for a fake. */
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type SubmitApplicationInput = ApplicationInput & {
  petPublicToken: string;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function submitAdoptionApplication(
  input: SubmitApplicationInput,
  deps: Deps,
): Promise<UseCaseResult<{ eventId: string }>> {
  const { repo, applicant, transaction } = deps;

  // 1. Auth check — must have an active session.
  if (!applicant) {
    return { ok: false, error: "Necesitás iniciar sesión para postularte." };
  }

  // 2. Profile check — institutional accounts blocked.
  const profile = await repo.findApplicantProfile(applicant.userId);
  const applicantProfile = profile
    ? { accountType: profile.accountType }
    : { accountType: "personal" };
  const profileValidation = validateApplicationInput(
    { ...input },
    applicantProfile,
    null, // dup check is separate — done after listability
  );
  if (!profileValidation.ok && profileValidation.error.includes("institucional")) {
    return { ok: false, error: profileValidation.error };
  }

  // 3. Pet + org lookup and listability check.
  const petWithOrg = await repo.findPetForApplication(input.petPublicToken);
  if (!petWithOrg) {
    return { ok: false, error: "La mascota no existe o ya no está bajo custodia de un refugio." };
  }
  const { pet, org } = petWithOrg;

  const petSnapshot = {
    adoptionListedAt: pet.adoptionListedAt,
    adoptionListingPausedAt: pet.adoptionListingPausedAt,
    status: pet.status,
    adoptionEligible: pet.adoptionEligible,
    inCustodyDispute: pet.inCustodyDispute,
    rabiesObservationStatus: pet.rabiesObservationStatus,
  };
  const orgSnapshot = {
    verified: org.verified,
    orgType: org.orgType,
  };

  if (!isListable(petSnapshot, orgSnapshot)) {
    return { ok: false, error: `${pet.name} ya no está disponible para adopción.` };
  }

  // 4. Duplicate-pending check.
  const existing = await repo.findExistingApplication(pet.id, applicant.userId);

  // 5. Full application validation (consent + duplicate + text lengths).
  const fullValidation = validateApplicationInput(input, applicantProfile, existing);
  if (!fullValidation.ok) return { ok: false, error: fullValidation.error };

  // 6. Atomic insert (event only — org member fan-out notification data collected,
  //    actual DB insert is returned to the caller for post-tx flush).
  const now = new Date();
  let eventId = "";
  const pendingNotifications: NewNotification[] = [];

  await transaction(async (tx) => {
    const { eventId: insertedEventId } = await repo.insertApplication(
      {
        petId: pet.id,
        userId: applicant.userId,
        orgId: org.id,
        housingType: input.housingType,
        otherPets: input.otherPets ? input.otherPets.trim() || null : null,
        dailyRoutine: input.dailyRoutine ? input.dailyRoutine.trim() || null : null,
        notes: input.notes ? input.notes.trim() || null : null,
        motivation: input.motivation ? input.motivation.trim() || null : null,
        priorPets: input.priorPets ?? null,
        now,
      },
      tx as Parameters<typeof repo.insertApplication>[1],
    );
    eventId = insertedEventId;

    // Collect org member notifications (built inside tx so eventId is available,
    // but the actual DB insert happens outside the tx for best-effort semantics).
    const orgMembers = await repo.findOrgMembersForNotify(
      org.id,
      tx as Parameters<typeof repo.findOrgMembersForNotify>[1],
    );
    for (const member of orgMembers) {
      pendingNotifications.push({
        userId: member.userId,
        notificationType: "adoption_application_received",
        title: `Nueva postulación para ${pet.name}`,
        body: "Una persona se postuló para adoptar. Entrá para revisar la historia y decidir.",
        severity: "info",
        ctaLabel: "Revisar postulación",
        ctaUrl: `/org/${org.publicToken}/adopciones/${insertedEventId}`,
        relatedPetId: pet.id,
        relatedEventId: insertedEventId,
      });
    }
  });

  return { ok: true, value: { eventId }, notifications: pendingNotifications };
}
