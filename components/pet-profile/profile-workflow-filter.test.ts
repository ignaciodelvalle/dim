// Fitness test — profile "Ciclos abiertos" dedup (PO 2026-07-16/18).
//
// A custody episode used to announce itself on the owner profile through BOTH
// case surfaces: the alert strip's "Casos abiertos" badges
// (PetOpenCasesSection) AND a "Ciclos abiertos" row (PetOwnerActivity) whose
// CTA pointed at the same /casos/[code] link. Same for a lost pet (masthead +
// LostCaseBlock + a workflow row linking back to the profile itself) and a
// bite observation. This pins the profile-local filter that keeps
// PetOpenCasesSection as the SINGLE open-cases surface on the profile:
// PetOwnerActivity renders its "Ciclos abiertos" card only from what survives
// this filter, so a custody-only fixture yields no second surface.

import { describe, expect, it } from "vitest";

import type { WorkflowItem } from "@/lib/analytics/owner-dashboard";
import {
  REDUNDANT_PROFILE_WORKFLOW_KINDS,
  filterProfileWorkflows,
} from "./profile-workflow-filter";

function workflow(overrides: Partial<WorkflowItem> & Pick<WorkflowItem, "kind">): WorkflowItem {
  return {
    id: `test:${overrides.kind}`,
    title: "Caso CAS-1234 · Pampa",
    subtitle: null,
    ctaUrl: "/casos/CAS-1234",
    since: new Date("2026-07-01T00:00:00Z"),
    severity: "info",
    ...overrides,
  };
}

describe("filterProfileWorkflows — single open-cases surface on the profile", () => {
  it("drops the custody-episode row already carried by the Casos abiertos badges", () => {
    const custody = workflow({
      kind: "case_generic_open",
      subtitle: "Episodio de custodia",
    });
    // Custody-only fixture → nothing survives → PetOwnerActivity renders no
    // "Ciclos abiertos" card; PetOpenCasesSection stays the one surface.
    expect(filterProfileWorkflows([custody])).toEqual([]);
  });

  it("drops the lost and bite-observation repeats too", () => {
    const rows = [
      workflow({ kind: "pet_lost", severity: "urgent", ctaUrl: "/mis-mascotas/tok" }),
      workflow({ kind: "bite_observation_open", severity: "warning" }),
    ];
    expect(filterProfileWorkflows(rows)).toEqual([]);
  });

  it("keeps rows that carry a unique action (e.g. a pending return proposal)", () => {
    const keep = workflow({
      kind: "custody_transfer_pending",
      title: "Propuesta de devolución para Pampa",
      ctaUrl: "/mis-mascotas/tok/devolucion",
      severity: "warning",
    });
    const custody = workflow({ kind: "case_generic_open", subtitle: "Episodio de custodia" });
    expect(filterProfileWorkflows([keep, custody])).toEqual([keep]);
  });

  it("filters exactly the three documented redundant kinds", () => {
    expect([...REDUNDANT_PROFILE_WORKFLOW_KINDS].sort()).toEqual([
      "bite_observation_open",
      "case_generic_open",
      "pet_lost",
    ]);
  });
});
