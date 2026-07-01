"use server";

// Custody disputes — thin Next.js "use server" controllers.
//
// Business logic lives in src/modules/custody-disputes/application/.
// This file: auth guard → delegate to use-case → revalidate → return.
//
// openDisputeFromEvent is NOT a server action — it's a transactional helper
// called from pet-claim.ts (also "use server"). It is re-exported as an
// async pass-through wrapper to satisfy the "use server" value-export
// constraint (only async function exports are allowed; bare re-exports of
// non-async functions are rejected at runtime by Next).

import { revalidatePath } from "next/cache";

import type { DisputePartyRole, Pet } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";

import { addDisputePartyUseCase } from "@/src/modules/custody-disputes/application/add-dispute-party";
import { escalateDisputeUseCase } from "@/src/modules/custody-disputes/application/escalate-dispute";
import { lookupTransferTargetUseCase } from "@/src/modules/custody-disputes/application/lookup-transfer-target";
import {
  type Tx,
  openDisputeFromEvent as openDisputeFromEventUC,
} from "@/src/modules/custody-disputes/application/open-dispute";
import { resolveDisputeUseCase } from "@/src/modules/custody-disputes/application/resolve-dispute";
import { withdrawDisputeUseCase } from "@/src/modules/custody-disputes/application/withdraw-dispute";
import type {
  AddPartyInput,
  AddPartyResult,
  EscalateDisputeInput,
  EscalateDisputeResult,
  LookupTransferTargetInput,
  LookupTransferTargetResult,
  ResolveDisputeInput,
  ResolveDisputeResult,
  WithdrawDisputeInput,
  WithdrawDisputeResult,
} from "@/src/modules/custody-disputes/domain/types";

// ============================================================================
// Type re-exports — keep public type surface stable for existing callers
// (type-only exports are erased at runtime; allowed in "use server" files)
// ============================================================================

export type { AddPartyInput, AddPartyResult } from "@/src/modules/custody-disputes/domain/types";
export type {
  ResolveDisputeInput,
  ResolveDisputeResult,
} from "@/src/modules/custody-disputes/domain/types";
export type {
  WithdrawDisputeInput,
  WithdrawDisputeResult,
} from "@/src/modules/custody-disputes/domain/types";
export type {
  LookupTransferTargetInput,
  LookupTransferTargetResult,
} from "@/src/modules/custody-disputes/domain/types";
export type {
  EscalateDisputeInput,
  EscalateDisputeResult,
} from "@/src/modules/custody-disputes/domain/types";

// Convenience re-export — no Pet import needed by callers.
export type DisputePet = Pick<Pet, "id" | "name" | "species" | "publicToken">;

// ============================================================================
// Inner writer — async pass-through wrapper so pet-claim.ts can import from
// this path unchanged. The "use server" constraint rejects bare value
// re-exports (`export { fn } from ...`); an async wrapper satisfies it.
// Auth is the caller's responsibility — openDisputeFromEvent is server-side only.
// ============================================================================

export async function openDisputeFromEvent(
  tx: Tx,
  input: {
    petId: string;
    raisingEventId: string;
    raisedByUserId: string;
    raisedByOrgId?: string | null;
    raisedByRole: "owner" | "org" | "govt" | "admin";
    jurisdictionProvince: string;
    jurisdictionLocality: string;
    initialParties: {
      userId?: string | null;
      orgId?: string | null;
      role: DisputePartyRole;
      positionSummary?: string | null;
    }[];
    preCreatedCaseId: string;
  },
): Promise<{ disputeId: string; publicToken: string }> {
  return openDisputeFromEventUC(tx, input);
}

// ============================================================================
// Server actions
// ============================================================================

export async function addDisputePartyAction(input: AddPartyInput): Promise<AddPartyResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const result = await addDisputePartyUseCase(session, input);
  if ("partyId" in result) {
    revalidatePath(`/gob/disputas/${input.disputeToken}`);
  }
  return result;
}

export async function resolveDisputeAction(
  input: ResolveDisputeInput,
): Promise<ResolveDisputeResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const result = await resolveDisputeUseCase(session, input);
  if ("resolvedAt" in result) {
    revalidatePath("/gob/disputas");
    revalidatePath(`/gob/disputas/${input.disputeToken}`);
  }
  return result;
}

export async function withdrawDisputeAction(
  input: WithdrawDisputeInput,
): Promise<WithdrawDisputeResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const result = await withdrawDisputeUseCase(session, input);
  if ("withdrawnAt" in result) {
    revalidatePath("/gob/disputas");
    revalidatePath(`/gob/disputas/${input.disputeToken}`);
  }
  return result;
}

export async function lookupTransferTargetAction(
  input: LookupTransferTargetInput,
): Promise<LookupTransferTargetResult> {
  await requireAdminOrGovtOrRedirect();
  return lookupTransferTargetUseCase(input);
}

export async function escalateDisputeAction(
  input: EscalateDisputeInput,
): Promise<EscalateDisputeResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const result = await escalateDisputeUseCase(session, input);
  if ("escalatedAt" in result) {
    revalidatePath(`/gob/disputas/${input.disputeToken}`);
  }
  return result;
}
