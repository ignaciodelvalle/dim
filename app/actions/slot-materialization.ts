"use server";

// slot-materialization.ts — thin shim (strangler 28/61).
//
// Business logic moved to:
//   src/modules/service-offerings/application/slot-materialization/
//
// This file re-exports all writer functions (used by the cron route and
// integration tests) and provides thin Action wrappers (used by UI components)
// that enforce the auth guard before delegating.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { blockSlot as _blockSlot } from "@/src/modules/service-offerings/application/slot-materialization/block-slot";
import { materializeOfferingNow as _materializeOfferingNow } from "@/src/modules/service-offerings/application/slot-materialization/materialize-offering-now";
import {
  materializeAllActiveSlots as _materializeAllActiveSlots,
  materializeSlotsForOffering as _materializeSlotsForOffering,
} from "@/src/modules/service-offerings/application/slot-materialization/materialize-slots";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  MaterializeNowResult,
  BlockSlotResult,
} from "@/src/modules/service-offerings/application/slot-materialization/types";

// ---------------------------------------------------------------------------
// Writer re-exports — async wrappers (used by cron route + integration tests)
// ---------------------------------------------------------------------------

// @no-auth-required: cron writer — invoked by the cron route without a user session
export async function materializeAllActiveSlots(): Promise<{
  rulesProcessed: number;
  slotsInserted: number;
}> {
  return _materializeAllActiveSlots();
}

// @no-auth-required: cron writer — invoked by the cron route without a user session
export async function materializeSlotsForOffering(offeringId: string): Promise<{
  rulesProcessed: number;
  slotsInserted: number;
}> {
  return _materializeSlotsForOffering(offeringId);
}

// ---------------------------------------------------------------------------
// Action wrappers — auth guard + delegate to use-cases
// ---------------------------------------------------------------------------

// @no-auth-required: auth enforced inside the delegated use-case (requireCapability runs after
// offering validation that supplies organizationId — lifting would reorder checks)
export async function materializeOfferingNowAction(
  offeringToken: string,
): Promise<{ rulesProcessed: number; slotsInserted: number } | { error: string }> {
  return _materializeOfferingNow(offeringToken);
}

export async function blockSlotAction(input: {
  orgToken: string;
  slotId: string;
}): Promise<{ ok: true } | { error: string }> {
  const { organization, membership } = await requireOrgAccessByToken(input.orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("appointment.manage")) {
    return { error: "No tenés permiso para esta acción." };
  }

  return _blockSlot({ ...input, organizationId: organization.id });
}
