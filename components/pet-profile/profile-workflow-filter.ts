// Profile-local workflow filter — pet-state standardization (PO 2026-07-16/18).
//
// Workflow kinds that REPEAT a state/case the owner pet profile already
// renders through its authoritative surfaces — the masthead band,
// LostCaseBlock, the rabies banner, and the open-cases badges
// (PetOpenCasesSection) in the alert strip. They are filtered out of the
// profile's "Ciclos abiertos" (PetOwnerActivity) so the same custody episode /
// lost state / bite observation never announces itself twice with no new datum
// or action: their CTAs point at the profile page itself or at the same
// /casos/[code] link the CaseBadge already carries. /inicio and the
// /mis-mascotas inbox keep showing them — this filter is profile-local.
//
// Pure module (no React, no DB — the WorkflowItem import is type-only) so the
// contract stays trivially unit-testable: see profile-workflow-filter.test.ts.

import type { WorkflowItem } from "@/lib/analytics/owner-dashboard";

export const REDUNDANT_PROFILE_WORKFLOW_KINDS: ReadonlySet<string> = new Set([
  "pet_lost", // masthead + LostCaseBlock own the lost state
  "bite_observation_open", // RabiesObservationBanner + open-cases badge own it
  "case_generic_open", // PetOpenCasesSection already lists the same open case
]);

/** Drops the workflow rows the profile already carries elsewhere. */
export function filterProfileWorkflows(workflows: WorkflowItem[]): WorkflowItem[] {
  return workflows.filter((w) => !REDUNDANT_PROFILE_WORKFLOW_KINDS.has(w.kind));
}
