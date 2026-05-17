"use server";

// Form-compatible server action wrappers for the return-to-owner flow.
// These adapt proposeReturnToOwnerAction / ownerAcceptReturnAction /
// ownerRejectReturnAction / actorCancelProposalAction to the
// (staticArg, _prev, formData) signature required by useActionState.

import type { ProposeReturnFormState } from "@/app/org/[orgToken]/mascotas/[publicToken]/devolver-al-dueno/ProposeReturnForm";
import {
  actorCancelProposalAction,
  ownerAcceptReturnAction,
  ownerRejectReturnAction,
  proposeReturnToOwnerAction,
} from "./return-to-owner";

// ---------------------------------------------------------------------------
// proposeReturnToOwnerFormAction — for refugio's ProposeReturnForm
// ---------------------------------------------------------------------------

export async function proposeReturnToOwnerFormAction(
  orgToken: string,
  petPublicToken: string,
  _prev: ProposeReturnFormState,
  formData: FormData,
): Promise<ProposeReturnFormState> {
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const result = await proposeReturnToOwnerAction({
    petPublicToken,
    actorMode: "refugio",
    orgToken,
    notes,
  });

  if ("error" in result) return { error: result.error };
  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// ownerAcceptReturnFormAction — for owner's ReturnAcceptanceCard
// ---------------------------------------------------------------------------

export type AcceptReturnFormState = {
  error: string | null;
  autoCancelled?: boolean;
  autoCancelReason?: string;
};

export async function ownerAcceptReturnFormAction(
  petPublicToken: string,
  _prev: AcceptReturnFormState,
  _formData: FormData,
): Promise<AcceptReturnFormState> {
  const result = await ownerAcceptReturnAction({ petPublicToken });

  if ("error" in result) return { error: result.error };
  if (result.ok && "autoCancelled" in result && result.autoCancelled) {
    return { error: null, autoCancelled: true, autoCancelReason: result.reason };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// ownerRejectReturnFormAction — for owner's reject inline form
// ---------------------------------------------------------------------------

export type RejectReturnFormState = {
  error: string | null;
  success?: boolean;
};

export async function ownerRejectReturnFormAction(
  petPublicToken: string,
  _prev: RejectReturnFormState,
  formData: FormData,
): Promise<RejectReturnFormState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Ingresá un motivo para el rechazo." };

  const result = await ownerRejectReturnAction({ petPublicToken, reason });

  if ("error" in result) return { error: result.error };
  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// actorCancelProposalFormAction — for actor's cancel UI
// ---------------------------------------------------------------------------

export type CancelProposalFormState = {
  error: string | null;
  success?: boolean;
};

export async function actorCancelProposalFormAction(
  petPublicToken: string,
  orgToken: string | undefined,
  _prev: CancelProposalFormState,
  formData: FormData,
): Promise<CancelProposalFormState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Ingresá un motivo para la cancelación." };

  const result = await actorCancelProposalAction({ petPublicToken, reason, orgToken });

  if ("error" in result) return { error: result.error };
  return { error: null, success: true };
}
