// Pure helpers for the bulk approval queue (C5).
//
// The admin/govt approval queue mixes heterogeneous request types in a single
// "Seleccionar todo" + Aprobar flow. RUPGA (service-dog credential) approvals
// require out-of-band CUD verification, so the approve confirmation must surface
// a per-type breakdown of the selected items and an explicit warning whenever a
// RUPGA item is in the selection.
//
// These functions are pure so they can be unit-tested without a DOM.

import type { ApprovalRequestType } from "@/db";

export const RUPGA_TYPE: ApprovalRequestType = "service_dog_credential_verification";

/** Human label for the breakdown (es-AR). */
export const APPROVAL_TYPE_BREAKDOWN_LABELS: Record<ApprovalRequestType, string> = {
  role_upgrade_vet: "Matrículas veterinarias",
  organization_verification: "Verificación de organizaciones",
  service_dog_credential_verification: "Credenciales RUPGA (perro de asistencia)",
};

/** Warning shown when any selected item is a RUPGA credential. */
export const RUPGA_APPROVAL_WARNING =
  "RUPGA requiere verificación de CUD vigente fuera de MiMAR antes de aprobar.";

export type TypeBreakdownEntry = {
  type: ApprovalRequestType;
  label: string;
  count: number;
};

/**
 * Computes the per-type breakdown of a set of selected approval-request types.
 * Returns entries in the canonical APPROVAL type order, omitting types with a
 * zero count. The input is the flat list of types of the SELECTED items (one
 * entry per selected item, duplicates expected).
 */
export function computeApprovalTypeBreakdown(
  selectedTypes: readonly ApprovalRequestType[],
): TypeBreakdownEntry[] {
  const counts = new Map<ApprovalRequestType, number>();
  for (const t of selectedTypes) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  const ordered: ApprovalRequestType[] = [
    "role_upgrade_vet",
    "organization_verification",
    "service_dog_credential_verification",
  ];

  return ordered
    .filter((t) => (counts.get(t) ?? 0) > 0)
    .map((t) => ({
      type: t,
      label: APPROVAL_TYPE_BREAKDOWN_LABELS[t],
      count: counts.get(t) ?? 0,
    }));
}

/** True when any selected item is a RUPGA credential (needs the CUD warning). */
export function selectionHasRupga(selectedTypes: readonly ApprovalRequestType[]): boolean {
  return selectedTypes.includes(RUPGA_TYPE);
}
