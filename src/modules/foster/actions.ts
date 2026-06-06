"use server";

// Thin action controllers for the foster domain.
//
// Each action does ONLY:
//   1. Auth guard at the edge (requireCapability or supabase session) — security boundary.
//   2. Parse raw formData or input DTO.
//   3. Build deps (repo, actor, transaction) and call the corresponding use-case.
//   4. Handle UseCaseResult<T> — on error, return { error: string }.
//   5. Flush pendingNotifications post-tx, best-effort (catch+log, never throw).
//   6. revalidatePath or redirect.
//
// NO business logic. NO direct Drizzle imports beyond the notifications insert
// and db.transaction pass-through.
//
// Reference: src/modules/adoption/actions.ts

import { db, notifications } from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { acceptFosterProposal } from "./application/accept-foster-proposal";
import { assignFoster } from "./application/assign-foster";
import { cancelFosterProposal } from "./application/cancel-foster-proposal";
import { endFoster } from "./application/end-foster";
import { expireFosterProposals as expireFosterProposalsUseCase } from "./application/expire-foster-proposals";
import { proposeFoster } from "./application/propose-foster";
import { rejectFosterProposal } from "./application/reject-foster-proposal";
import { searchFosterVolunteers as searchFosterVolunteersUseCase } from "./application/search-foster-volunteers";
import { setCoFosterAllowed } from "./application/set-co-foster-allowed";
import { upsertFosterVolunteer } from "./application/upsert-foster-volunteer";
import { withdrawFosterVolunteer } from "./application/withdraw-foster-volunteer";
import { FosterRepository } from "./infrastructure/foster-repository";

import type {
  FosterVolunteerSearchRow,
  SearchFosterVolunteersInput as UseCaseSearchInput,
} from "./application/search-foster-volunteers";
import type { NewNotification } from "./application/types";
import type { UpsertFosterVolunteerInput } from "./domain/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Flush notifications post-tx, best-effort. Never throws. */
async function flushNotifications(pending: NewNotification[]): Promise<void> {
  if (pending.length === 0) return;
  try {
    await db
      .insert(notifications)
      .values(pending as unknown as (typeof notifications.$inferInsert)[]);
  } catch (e) {
    console.error("[foster/actions] notifications insert failed (action did succeed):", e);
  }
}

// ---------------------------------------------------------------------------
// assignFosterAction
// ---------------------------------------------------------------------------

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

  const result = await assignFoster(
    { petPublicToken: publicToken, fosterUserId, expectedWeeksRaw, notes },
    {
      repo: FosterRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  redirect(result.value.redirectPath);
}

// ---------------------------------------------------------------------------
// endFosterAction
// ---------------------------------------------------------------------------

export type EndFosterFormState = {
  error: string | null;
};

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
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const result = await endFoster(
    { petPublicToken: publicToken, reasonRaw, notes },
    {
      repo: FosterRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  // PARITY: ?fostend= (not ?foster=) — preserve exactly.
  redirect(result.value.redirectPath);
}

// ---------------------------------------------------------------------------
// proposeFosterAction
// ---------------------------------------------------------------------------

export type ProposeFosterInput = {
  orgToken: string;
  volunteerUserId: string;
  petPublicToken: string;
  proposedDurationWeeks?: number | null;
  proposedNotes?: string | null;
};

export type ProposeFosterResult = { proposalPublicToken: string } | { error: string };

export async function proposeFosterAction(input: ProposeFosterInput): Promise<ProposeFosterResult> {
  // requireCapability defaults to the session's active org. The org is resolved
  // from the orgToken before calling, matching the original pattern.
  const auth = await requireCapability("foster.assign");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const result = await proposeFoster(
    {
      petPublicToken: input.petPublicToken,
      volunteerUserId: input.volunteerUserId,
      proposedDurationWeeks: input.proposedDurationWeeks ?? null,
      proposedNotes: input.proposedNotes ?? null,
    },
    {
      repo: FosterRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath(result.value.revalidatePath);
  return { proposalPublicToken: result.value.proposalPublicToken };
}

// ---------------------------------------------------------------------------
// cancelFosterProposalAction
// Authentication note: auth MUST be scoped to the proposal's organization, not
// the session's most-recent active membership. Fix for spec R6:
//   1. Load the proposal by token first (or return not-found).
//   2. Call requireCapability("foster.assign", proposal.organizationId) so that
//      only a user with the capability in THAT specific org can cancel it.
//   3. Pass the pre-authorized actor to the use-case (which skips its own auth).
// ---------------------------------------------------------------------------

export type CancelFosterProposalInput = {
  proposalPublicToken: string;
  cancellationReason?: string | null;
};

export type CancelFosterProposalResult = { ok: true } | { error: string };

export async function cancelFosterProposalAction(
  input: CancelFosterProposalInput,
): Promise<CancelFosterProposalResult> {
  // 1. Load proposal first to obtain the owning organizationId for auth scoping.
  const proposal = await FosterRepository.findProposalByToken(input.proposalPublicToken);
  if (!proposal) return { error: "Propuesta no encontrada." };

  // 2. Auth check scoped to the proposal's org (spec R6).
  const auth = await requireCapability("foster.assign", proposal.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const result = await cancelFosterProposal(
    {
      proposalPublicToken: input.proposalPublicToken,
      cancellationReason: input.cancellationReason ?? null,
    },
    {
      repo: FosterRepository,
      actor: { user, organization },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// acceptFosterProposalAction — volunteer side (session auth)
// ---------------------------------------------------------------------------

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

export async function acceptFosterProposalAction(
  input: AcceptFosterProposalInput,
): Promise<AcceptFosterProposalResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const result = await acceptFosterProposal(
    {
      proposalPublicToken: input.proposalPublicToken,
      allowCoFoster: input.allowCoFoster,
      responseNotes: input.responseNotes ?? null,
    },
    {
      repo: FosterRepository,
      actor: { user },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath("/cuenta/transitos/propuestas");
  revalidatePath("/mis-mascotas");
  return {
    fosterOwnershipId: result.value.fosterOwnershipId,
    remainingSlots: result.value.remainingSlots,
    cascadeCancelledProposals: result.value.cascadeCancelledProposals,
  };
}

// ---------------------------------------------------------------------------
// rejectFosterProposalAction — volunteer side (session auth)
// ---------------------------------------------------------------------------

export type RejectFosterProposalInput = {
  proposalPublicToken: string;
  rejectionReason: string;
  responseNotes?: string | null;
};

export type RejectFosterProposalResult = { ok: true } | { error: string };

export async function rejectFosterProposalAction(
  input: RejectFosterProposalInput,
): Promise<RejectFosterProposalResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const result = await rejectFosterProposal(
    {
      proposalPublicToken: input.proposalPublicToken,
      rejectionReason: input.rejectionReason,
      responseNotes: input.responseNotes ?? null,
    },
    {
      repo: FosterRepository,
      actor: { user },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath(result.value.revalidatePath);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// expireFosterProposalsAction — cron/system path, no user actor
// ---------------------------------------------------------------------------

export type ExpireFosterProposalsStats = {
  candidates: number;
  expired: number;
  errors: number;
};

/** System action called by the cron route. Throws on fatal error (cron logs it). */
export async function expireFosterProposalsAction(): Promise<ExpireFosterProposalsStats> {
  const result = await expireFosterProposalsUseCase({ repo: FosterRepository });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// ---------------------------------------------------------------------------
// upsertFosterVolunteerAction — volunteer side (session auth)
// ---------------------------------------------------------------------------

export type UpsertFosterVolunteerResult =
  | { volunteerId: string; availableSlots: number }
  | { error: string };

export async function upsertFosterVolunteerAction(
  input: UpsertFosterVolunteerInput,
): Promise<UpsertFosterVolunteerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const result = await upsertFosterVolunteer(input, {
    repo: FosterRepository,
    actor: { user },
    transaction: db.transaction.bind(db),
  });

  if (!result.ok) return { error: result.error };

  revalidatePath(result.value.revalidatePath);
  return { volunteerId: result.value.volunteerId, availableSlots: result.value.availableSlots };
}

// ---------------------------------------------------------------------------
// withdrawFosterVolunteerAction — volunteer side (session auth)
// ---------------------------------------------------------------------------

export type WithdrawFosterVolunteerResult = { ok: true } | { error: string };

export async function withdrawFosterVolunteerAction(): Promise<WithdrawFosterVolunteerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const result = await withdrawFosterVolunteer({
    repo: FosterRepository,
    actor: { user },
    transaction: db.transaction.bind(db),
  });

  if (!result.ok) return { error: result.error };

  revalidatePath(result.value.revalidatePath);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// setCoFosterAllowedAction — volunteer side (session auth)
// ---------------------------------------------------------------------------

export type SetCoFosterAllowedInput = {
  fosterOwnershipId: string;
  allowCoFoster: boolean;
};

export type SetCoFosterAllowedResult = { ok: true } | { error: string };

export async function setCoFosterAllowedAction(
  input: SetCoFosterAllowedInput,
): Promise<SetCoFosterAllowedResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const result = await setCoFosterAllowed(
    {
      fosterOwnershipId: input.fosterOwnershipId,
      allowCoFoster: input.allowCoFoster,
    },
    {
      repo: FosterRepository,
      actor: { user },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(result.value.revalidatePath);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// searchFosterVolunteers — read action, org side
// Preserves the original input shape (including orgToken) for drop-in
// consumer compatibility. Auth is checked at the edge via requireCapability.
// ---------------------------------------------------------------------------

export type SearchFosterVolunteersInput = {
  orgToken: string;
  province?: string | null;
  locality?: string | null;
  species?: "dog" | "cat" | "other";
  petPublicToken?: string | null;
  proposedDurationWeeks?: number | null;
  limit?: number;
};

export type { FosterVolunteerSearchRow };

export type SearchFosterVolunteersResult = { rows: FosterVolunteerSearchRow[] } | { error: string };

export async function searchFosterVolunteers(
  input: SearchFosterVolunteersInput,
): Promise<SearchFosterVolunteersResult> {
  const auth = await requireCapability("foster.assign");
  if (auth.error !== null) return { error: auth.error };

  // Build optional petShape from petPublicToken if provided.
  let petShape: UseCaseSearchInput["petShape"] = null;
  if (input.petPublicToken) {
    // Load the pet shape from the repo (needed for match scoring).
    const petRow = await FosterRepository.findShelterPetByToken(
      input.petPublicToken,
      auth.organization.id,
    );
    if (petRow) {
      petShape = {
        species: (petRow as { species: string }).species,
        estimatedWeightKg:
          (petRow as { estimatedWeightKg?: number | null }).estimatedWeightKg ?? null,
        dateOfBirth: (petRow as { dateOfBirth?: Date | null }).dateOfBirth ?? null,
        isPpp: (petRow as { potentiallyDangerousBreed: boolean }).potentiallyDangerousBreed,
      };
    }
  }

  const result = await searchFosterVolunteersUseCase(
    {
      province: input.province ?? null,
      locality: input.locality ?? null,
      species: input.species,
      petShape,
      proposedDurationWeeks: input.proposedDurationWeeks ?? null,
      limit: input.limit,
    },
    { repo: FosterRepository },
  );

  if (!result.ok) return { error: result.error };
  return { rows: result.value.rows };
}
