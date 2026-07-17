"use server";

// Thin action controllers for the adoption domain.
//
// Each action does ONLY:
//   1. Require the appropriate capability (auth + org context — security boundary stays here).
//   2. Parse / cast raw formData or input DTO.
//   3. Build deps (repo, actor, transaction) and call the corresponding use-case.
//   4. Handle Result<T> — on error, return { error: string }.
//   5. Flush pendingNotifications post-tx, best-effort (catch+log, never throw).
//   6. revalidatePath or redirect.
//
// NO business logic. NO direct Drizzle imports (db.transaction is passed as a
// dep into use-cases; db.insert for notifications is the sole direct db call).

import { randomUUID } from "node:crypto";
import { db, notifications } from "@/db";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { createClient } from "@/lib/supabase/server";
import {
  requireCapability,
  requireCapabilityForOrgToken,
} from "@/src/modules/organizations/infrastructure/authz-resolver";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { finalizeAdoption } from "./application/finalize-adoption";
import {
  approveAdoptionApplication,
  rejectAdoptionApplication,
} from "./application/review-adoption-application";
import { setAdoptionEligibility } from "./application/set-adoption-eligibility";
import { setAdoptionListingStatus } from "./application/set-adoption-listing-status";
import { submitAdoptionApplication } from "./application/submit-adoption-application";
import { updateAdoptionListingContent } from "./application/update-adoption-listing-content";
import { withdrawAdoptionApplication } from "./application/withdraw-adoption-application";
import { AdoptionRepository } from "./infrastructure/adoption-repository";

import type { NewNotification } from "./application/set-adoption-eligibility";
import type { AgeBucket, EnergyLevel, IneligibleReason, SizeEstimate } from "./domain/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Flush notifications post-tx, best-effort. Never throws. */
async function flushNotifications(pending: NewNotification[]): Promise<void> {
  if (pending.length === 0) return;
  try {
    // Cast through unknown to bridge NewNotification (minimal shape) to Drizzle's
    // notifications.$inferInsert (which uses enum literal types). All values are
    // valid by construction; the cast avoids re-importing the full Drizzle schema type.
    await db
      .insert(notifications)
      .values(pending as unknown as (typeof notifications.$inferInsert)[]);
  } catch (e) {
    console.error("[adoption/actions] notifications insert failed (action did succeed):", e);
  }
}

// ---------------------------------------------------------------------------
// setAdoptionEligibilityAction
// ---------------------------------------------------------------------------

export type SetAdoptionEligibilityInput = {
  /** publicToken of the org in the URL — the org this action acts AS. */
  orgToken: string;
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
  // Authorize against the org in the URL, exactly like finalizeAdoptionAction.
  //
  // This used to be a bare `requireCapability("intake.create")`, which falls
  // back to the session-default (most-recently-joined) membership and ignores
  // the URL entirely. For a single-org member the two agree, so it looked fine.
  // For a multi-org member they diverge, and the divergence is total: the read
  // paths (custody list, pet detail) resolve the org from the URL token, so the
  // screen says "Custodia del refugio" while findShelterPet(petPublicToken,
  // organization.id) queries a DIFFERENT org and answers "no está bajo custodia
  // de tu organización" — about a pet that genuinely is.
  //
  // QA ronda 6 (2026-07-16) reproduced it three ways with alejo@dim.test, who
  // administers four orgs. The pet token alone cannot disambiguate: the org id
  // must be pinned from the URL, never inferred from join order.
  const auth = await requireCapabilityForOrgToken("intake.create", input.orgToken);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const result = await setAdoptionEligibility(
    {
      petPublicToken: input.petPublicToken,
      eligible: input.eligible,
      ineligibleReason: input.ineligibleReason ?? null,
      ineligibleReasonNotes: input.ineligibleReasonNotes ?? null,
      ineligibleUntilIso: input.ineligibleUntilIso ?? null,
    },
    {
      repo: AdoptionRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath(`/org/${organization.publicToken}/mascotas/${input.petPublicToken}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// setAdoptionListingStatusAction
// ---------------------------------------------------------------------------

export type AdoptionListingResult = { ok: true } | { error: string };

export type AdoptionListingStatusInput = {
  /** publicToken of the org in the URL — the org this action acts AS. */
  orgToken: string;
  petPublicToken: string;
  action: "publish" | "pause" | "unpause" | "unpublish";
};

export async function setAdoptionListingStatusAction(
  input: AdoptionListingStatusInput,
): Promise<AdoptionListingResult> {
  // Pinned to the URL org — same reason as setAdoptionEligibilityAction, same
  // sink: setAdoptionListingStatus → repo.findShelterPet(petPublicToken,
  // organization.id). A bare requireCapability resolves the session-default
  // (last-joined) membership, so for a multi-org member this asked a DIFFERENT
  // org whether it holds the pet and got "no está bajo custodia de tu
  // organización" about a pet the screen shows as theirs.
  //
  // 21-authz-scoping-audit.md filed THREE instances of this (#9 eligibility,
  // #10 here, #11 updateAdoptionListingContentAction). Only #9 landed at first,
  // which left the shelter able to mark its intake apta and then unable to
  // publish it — the very next step of the flow QA could not finish.
  const auth = await requireCapabilityForOrgToken("adoption.listing.manage", input.orgToken);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const result = await setAdoptionListingStatus(
    {
      petPublicToken: input.petPublicToken,
      action: input.action,
    },
    {
      repo: AdoptionRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath(`/org/${organization.publicToken}/mascotas/${input.petPublicToken}`);
  revalidatePath("/adoptar");
  revalidatePath(`/adoptar/${input.petPublicToken}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// updateAdoptionListingContentAction
// ---------------------------------------------------------------------------

export type AdoptionListingContentInput = {
  /** publicToken of the org in the URL — the org this action acts AS. */
  orgToken: string;
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

export async function updateAdoptionListingContentAction(
  input: AdoptionListingContentInput,
): Promise<AdoptionListingResult> {
  // Pinned to the URL org — audit #11, the third instance of the same defect.
  // See setAdoptionListingStatusAction above.
  const auth = await requireCapabilityForOrgToken("adoption.listing.manage", input.orgToken);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const result = await updateAdoptionListingContent(
    {
      petPublicToken: input.petPublicToken,
      story: input.story,
      requirements: input.requirements,
      ageBucket: input.ageBucket ?? null,
      sizeEstimate: input.sizeEstimate ?? null,
      energyLevel: input.energyLevel ?? null,
      goodWithKids: input.goodWithKids ?? null,
      goodWithDogs: input.goodWithDogs ?? null,
      goodWithCats: input.goodWithCats ?? null,
      needsYard: input.needsYard ?? null,
      feeArs: input.feeArs ?? null,
    },
    {
      repo: AdoptionRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath(`/org/${organization.publicToken}/mascotas/${input.petPublicToken}`);
  revalidatePath(`/adoptar/${input.petPublicToken}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// submitAdoptionApplicationAction
// ---------------------------------------------------------------------------

export type SubmitAdoptionApplicationInput = {
  petPublicToken: string;
  housingType: "casa_con_patio" | "casa_sin_patio" | "departamento" | "otro";
  otherPets: string | null;
  dailyRoutine: string | null;
  notes: string | null;
  profileSharingConsent: boolean;
  motivation: string | null;
  priorPets: "yes_currently" | "yes_before" | "no" | null;
};

export type SubmitAdoptionApplicationResult =
  | { ok: true; applicationEventId: string }
  | { error: string };

export async function submitAdoptionApplicationAction(
  input: SubmitAdoptionApplicationInput,
): Promise<SubmitAdoptionApplicationResult> {
  // For this action, auth is checked inside the use-case (applicant=null means no session).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await submitAdoptionApplication(
    {
      petPublicToken: input.petPublicToken,
      housingType: input.housingType,
      otherPets: input.otherPets,
      dailyRoutine: input.dailyRoutine,
      notes: input.notes,
      profileSharingConsent: input.profileSharingConsent,
      motivation: input.motivation,
      priorPets: input.priorPets,
    },
    {
      repo: AdoptionRepository,
      applicant: user ? { userId: user.id } : null,
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  // Cleanup apply-intent cookies — the trámite finished.
  // Wrapped because tests invoke the action outside a request scope.
  try {
    const { APPLY_INTENT_COOKIE_NAME, APPLY_INTENT_PET_TOKEN_COOKIE_NAME } = await import(
      "@/lib/domain/apply-intent"
    );
    const cookieStore = await cookies();
    cookieStore.delete(APPLY_INTENT_COOKIE_NAME);
    cookieStore.delete(APPLY_INTENT_PET_TOKEN_COOKIE_NAME);
  } catch {
    // best-effort; the event already persisted
  }

  // result.value is guaranteed to be present when ok:true for this use-case.
  const eventId = result.value?.eventId ?? "";
  return { ok: true, applicationEventId: eventId };
}

// ---------------------------------------------------------------------------
// withdrawAdoptionApplicationAction
// ---------------------------------------------------------------------------
// Applicant-side: retract a still-pending adoption application. Auth is the
// presence of a session (the use-case enforces applicant ownership + pending).

export type WithdrawAdoptionApplicationInput = {
  applicationEventId: string;
};

export type WithdrawAdoptionApplicationResult = { ok: true } | { error: string };

export async function withdrawAdoptionApplicationAction(
  input: WithdrawAdoptionApplicationInput,
): Promise<WithdrawAdoptionApplicationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await withdrawAdoptionApplication(
    { applicationEventId: input.applicationEventId },
    {
      repo: AdoptionRepository,
      applicant: user ? { userId: user.id } : null,
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath("/mis-mascotas/postulaciones");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// approveAdoptionApplicationAction
// ---------------------------------------------------------------------------

export type ReviewAdoptionInput = {
  applicationEventId: string;
  notes?: string | null;
};

export type ReviewAdoptionResult = { ok: true } | { error: string };

export async function approveAdoptionApplicationAction(
  orgToken: string,
  input: ReviewAdoptionInput,
): Promise<ReviewAdoptionResult> {
  // Resolve + authorize against the org in the URL BEFORE the mutation. Pinning
  // by token replaces the fragile post-hoc `organization.publicToken !== orgToken`
  // compare, which authorized against the session-default org and then rejected
  // on mismatch (denying legitimate members whose default org differs).
  const auth = await requireCapabilityForOrgToken("adoption.review", orgToken);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const result = await approveAdoptionApplication(
    {
      applicationEventId: input.applicationEventId,
      notes: input.notes ?? null,
    },
    {
      repo: AdoptionRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath(`/org/${orgToken}/adopciones`);
  revalidatePath(`/org/${orgToken}/adopciones/${input.applicationEventId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// rejectAdoptionApplicationAction
// ---------------------------------------------------------------------------

export async function rejectAdoptionApplicationAction(
  orgToken: string,
  input: ReviewAdoptionInput,
): Promise<ReviewAdoptionResult> {
  // Authorize against the URL org up front (see approve sibling for rationale).
  const auth = await requireCapabilityForOrgToken("adoption.review", orgToken);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const result = await rejectAdoptionApplication(
    {
      applicationEventId: input.applicationEventId,
      notes: input.notes ?? null,
    },
    {
      repo: AdoptionRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath(`/org/${orgToken}/adopciones`);
  revalidatePath(`/org/${orgToken}/adopciones/${input.applicationEventId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// requestInfoAdoptionApplicationAction
// ---------------------------------------------------------------------------
// Light path: does NOT change application status. Sends a notification to
// the applicant with the reviewer's free-text message.

export type RequestInfoAdoptionInput = {
  applicationEventId: string;
  message: string;
};

export type RequestInfoAdoptionResult = { ok: true } | { error: string };

export async function requestInfoAdoptionApplicationAction(
  orgToken: string,
  input: RequestInfoAdoptionInput,
): Promise<RequestInfoAdoptionResult> {
  // Authorize against the URL org up front (see approve sibling for rationale).
  const auth = await requireCapabilityForOrgToken("adoption.review", orgToken);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const message = input.message.trim();
  if (!message || message.length < 5) {
    return { error: "El mensaje debe tener al menos 5 caracteres." };
  }
  if (message.length > 1000) {
    return { error: "El mensaje no puede superar los 1000 caracteres." };
  }

  // Load application to get pet + applicant info (reuse the same guard as
  // approve/reject — verifies it belongs to the org and is still pending).
  const loaded = await AdoptionRepository.findApplicationForReview(
    input.applicationEventId,
    organization.id,
  );
  if ("error" in loaded) return { error: loaded.error };

  const { application, pet } = loaded;
  // applicantUserId is the single PII field projected from the payload —
  // the repository never returns the full raw payload (Item 27 PII fix).
  const applicantUserId = application.applicantUserId;

  // Emit a lightweight note_added marker (kind=adoption_info_requested) so the
  // info request becomes a derivable lifecycle state — the applicant's list can
  // surface "te pidieron más información", and the org list can flag probed
  // rows. Best-effort: a failed marker insert must NOT block the notification.
  try {
    await AdoptionRepository.insertInfoRequestedNote({
      petId: pet.id,
      applicationEventId: application.id,
      reviewerUserId: user.id,
      orgId: organization.id,
      orgVerified: organization.verified,
      message,
      now: new Date(),
    });
  } catch (e) {
    console.error("[adoption/actions] info-requested marker insert failed:", e);
  }

  if (applicantUserId) {
    await flushNotifications([
      {
        userId: applicantUserId,
        // notificationType is unconstrained TEXT — a dedicated value beats
        // recycling the approved type for an info request.
        notificationType: "adoption_info_requested",
        category: "adoption",
        title: `${organization.displayName} te pide información sobre tu postulación`,
        body: message,
        severity: "info",
        ctaLabel: "Ver mis postulaciones",
        ctaUrl: "/mis-mascotas/postulaciones",
        relatedPetId: pet.id,
        relatedEventId: application.id,
      },
    ]);
  }

  revalidatePath(`/org/${orgToken}/adopciones`);
  revalidatePath(`/org/${orgToken}/adopciones/${input.applicationEventId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// finalizeAdoptionAction
// ---------------------------------------------------------------------------

export type FinalizeAdoptionFormState = {
  error: string | null;
  /**
   * On success, the URL the calling form must navigate to via a FULL document
   * navigation (lib/ui/use-action-redirect.ts). This action no longer calls
   * next/navigation's redirect(): its post-action transition is silently
   * dropped by the Next 15.5.x client router (engram #621/#622; see
   * lib/ui/full-page-action-nav.ts for the mechanism). The dropped redirect
   * left the "Finalizando adopción…" button stuck indefinitely even though the
   * adoption had already committed server-side, and stranded the operator on
   * the transferred pet's now-404 ficha (QA ALTO, 2026-07-16). The destination
   * is the org custody LIST (?adopcion=<token> success banner) — never the
   * transferred pet's ficha, which the org no longer has custody of.
   */
  redirectTo?: string;
};

export async function finalizeAdoptionAction(
  orgToken: string,
  publicToken: string,
  _previous: FinalizeAdoptionFormState,
  formData: FormData,
): Promise<FinalizeAdoptionFormState> {
  // Authorize against the org in the URL up front, before any upload or write.
  // Pinning by token replaces the prior post-hoc publicToken compare.
  const auth = await requireCapabilityForOrgToken("adoption.finalize", orgToken);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  // Parse formData.
  const applicationEventIdInput = String(formData.get("applicationEventId") ?? "").trim() || null;
  const adopterUserIdInput = String(formData.get("adopterUserId") ?? "").trim() || null;
  const dniRaw = String(formData.get("adopterDni") ?? "");
  const displayName = String(formData.get("adopterDisplayName") ?? "").trim();
  const phone = String(formData.get("adopterPhone") ?? "").trim() || null;
  const followupRaw = String(formData.get("followupMonths") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const followupMonths = followupRaw
    ? Math.min(36, Math.max(0, Number.parseInt(followupRaw, 10) || 0))
    : null;

  // Pre-tx: contract file upload (happens BEFORE the DB transaction — storage is out-of-band).
  const supabase = await createClient();
  const contractFile = formData.get("contract") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, contractFile, "event-attachments");
  if (upload.error) return { error: upload.error };
  const contractAttachmentId = upload.uploadedPath ? randomUUID() : null;

  async function cleanupOrphan(): Promise<void> {
    if (!upload.uploadedPath) return;
    try {
      await supabase.storage.from("event-attachments").remove([upload.uploadedPath]);
    } catch {
      // Swallow — the row was never inserted, the file is orphaned at worst.
    }
  }

  const result = await finalizeAdoption(
    {
      petPublicToken: publicToken,
      applicationEventId: applicationEventIdInput,
      adopterUserId: adopterUserIdInput,
      adopterDni: dniRaw || null,
      adopterDisplayName: displayName,
      adopterPhone: phone,
      followupMonths,
      notes,
      contractAttachmentId,
      contractStoragePath: upload.uploadedPath,
      contractMimeType: upload.mimeType,
      contractFileSize: upload.size,
    },
    {
      repo: AdoptionRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) {
    await cleanupOrphan();
    return { error: result.error };
  }

  await flushNotifications(result.notifications);

  // When finalized from an approved application, ownership landed on the
  // adopter's real account — refresh the adopter-facing surfaces so the pet
  // shows in /mis-mascotas and the postulación flips to "finalizada".
  if (applicationEventIdInput) {
    revalidatePath("/mis-mascotas");
    revalidatePath("/mis-mascotas/postulaciones");
  }

  // Land on the org custody LIST with its success banner — NOT the transferred
  // pet's ficha (the org lost custody, so that route now 404s). A full document
  // navigation via the form (useActionRedirect) is the one path immune to the
  // Next 15.5.x router-drop defect (see the redirectTo docblock above).
  revalidatePath(`/org/${orgToken}/mascotas`);
  return { error: null, redirectTo: `/org/${orgToken}/mascotas?adopcion=${publicToken}` };
}
