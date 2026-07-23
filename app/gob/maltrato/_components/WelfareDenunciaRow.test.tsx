// @vitest-environment jsdom
//
// Regression test — qa-triage-2026-07-23 finding #4 (gov-ux adversarial
// review): a historical-backlog critical report rendered "CRÍTICA — PELIGRO
// INMEDIATO" (severity pill) directly next to "HISTÓRICO · SIN SLA ACTIVO"
// (SlaBadge) on the SAME card — a semantic contradiction (is it an active
// emergency or an archived backlog row?). Live example: DEN-VHCX-GRC9,
// severity=critical, status=open, ~310 days old.
//
// Fix: WelfareDenunciaRow now demotes the severity pill's URGENCY FRAMING
// (not the severity itself) whenever SlaBadge's own isHistoricalBacklog
// predicate is true — "Crítica (histórica)" instead of "Crítica — peligro
// inmediato". One truth per card: severity stays as data (tone/left-edge
// unchanged), only the urgency claim is dropped for backlog rows.

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/gob/denuncias",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("../_inspector/inspector-nav", () => ({
  selectCaso: vi.fn(),
}));

vi.mock("@/src/modules/welfare/actions", () => ({
  assignWelfareToMeAction: vi.fn(),
}));

vi.mock("@/lib/ui/full-page-action-nav", () => ({
  navigateAfterActionSuccess: vi.fn(),
}));

import { WelfareDenunciaRow } from "./WelfareDenunciaRow";

afterEach(cleanup);

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const baseReport = {
  id: "report-1",
  referenceCode: "DEN-VHCX-GRC9",
  kind: "physical_abuse",
  status: "open" as const,
  jurisdictionLocality: "Palermo",
  jurisdictionProvince: "CABA",
  assignedToUserId: null,
};

describe("WelfareDenunciaRow — severity vs SLA reconciliation (finding #4)", () => {
  it("a RECENT critical report keeps the full urgency phrasing, and shows the live breach badge, not the historical one", () => {
    render(
      <WelfareDenunciaRow
        report={{ ...baseReport, severity: "critical", createdAt: daysAgo(5) }}
        assignedToName={null}
        currentUserId="user-1"
      />,
    );
    expect(screen.getByText("Crítica — peligro inmediato")).toBeInTheDocument();
    expect(screen.queryByText("Histórico · sin SLA activo")).not.toBeInTheDocument();
  });

  it("a 310-day-old (historical-backlog) critical report demotes the severity pill's urgency framing — no contradiction with SlaBadge", () => {
    render(
      <WelfareDenunciaRow
        report={{ ...baseReport, severity: "critical", createdAt: daysAgo(310) }}
        assignedToName={null}
        currentUserId="user-1"
      />,
    );
    // The SLA badge demotes to historical backlog (existing behavior).
    expect(screen.getByText("Histórico · sin SLA activo")).toBeInTheDocument();
    // The severity pill must NOT still claim "peligro inmediato" alongside it.
    expect(screen.queryByText("Crítica — peligro inmediato")).not.toBeInTheDocument();
    expect(screen.getByText("Crítica (histórica)")).toBeInTheDocument();
  });

  it("a historical-backlog LOW-severity report also demotes its (non-urgent) label consistently", () => {
    render(
      <WelfareDenunciaRow
        report={{ ...baseReport, severity: "low", createdAt: daysAgo(200) }}
        assignedToName={null}
        currentUserId="user-1"
      />,
    );
    expect(screen.getByText("Histórico · sin SLA activo")).toBeInTheDocument();
    expect(screen.queryByText("Baja — preocupante, no urgente")).not.toBeInTheDocument();
    expect(screen.getByText("Baja (histórica)")).toBeInTheDocument();
  });
});
