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
import { createClient } from "@/lib/supabase/server";
import { uploadAttachmentIfPresent } from "@/lib/uploads";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { finalizeAdoption } from "./application/finalize-adoption";
import {
  approveAdoptionApplication,
  rejectAdoptionApplication,
} from "./application/review-adoption-application";
import { setAdoptionEligibility } from "./application/set-adoption-eligibility";
import { setAdoptionListingStatus } from "./application/set-adoption-listing-status";
import { submitAdoptionApplication } from "./application/submit-adoption-application";
import { updateAdoptionListingContent } from "./application/update-adoption-listing-content";
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
  const auth = await requireCapability("intake.create");
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
  petPublicToken: string;
  action: "publish" | "pause" | "unpause" | "unpublish";
};

export async function setAdoptionListingStatusAction(
  input: AdoptionListingStatusInput,
): Promise<AdoptionListingResult> {
  const auth = await requireCapability("adoption.listing.manage");
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
  const auth = await requireCapability("adoption.listing.manage");
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
      "@/lib/apply-intent"
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
  const auth = await requireCapability("adoption.review");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

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
  const auth = await requireCapability("adoption.review");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

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
  const auth = await requireCapability("adoption.review");
  if (auth.error !== null) return { error: auth.error };
  const { organization } = auth;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

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
  const payload = application.payload as { applicant_user_id?: string };
  const applicantUserId = payload.applicant_user_id;

  if (applicantUserId) {
    await flushNotifications([
      {
        userId: applicantUserId,
        // notificationType is unconstrained TEXT — a dedicated value beats
        // recycling the approved type for an info request.
        notificationType: "adoption_info_requested",
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
};

export async function finalizeAdoptionAction(
  orgToken: string,
  publicToken: string,
  _previous: FinalizeAdoptionFormState,
  formData: FormData,
): Promise<FinalizeAdoptionFormState> {
  const auth = await requireCapability("adoption.finalize");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  // Parse formData.
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

  redirect(`/org/${orgToken}/mascotas?adopcion=${publicToken}`);
}
