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

import { OpCodeBadge } from "@/components/ui/dashboard";
import { formatDate } from "@/lib/utils/format";

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

// ---------------------------------------------------------------------------
// Operator-queue anatomy alignment (A5, 2026-07-30)
//
// The measurement of the six operator queues found this row on its own private
// anatomy: a bare mono <p> for the reference code, and a private relative
// formatter ("hace N días") for the date. The dominant anatomy —
// components/ui/dashboard/CaseQueue.tsx, used by 4 operator surfaces — renders
// identifiers through the shared OpCodeBadge atom and dates through the shared
// absolute formatDate.
//
// The expected badge className is READ FROM OpCodeBadge itself rather than
// hardcoded, so the test pins "goes through the shared atom", not a class list
// that would drift the moment the atom is restyled.
// ---------------------------------------------------------------------------

describe("WelfareDenunciaRow — operator-queue anatomy alignment (A5)", () => {
  const CREATED_AT = new Date("2026-07-01T15:00:00Z");

  function renderAligned() {
    return render(
      <WelfareDenunciaRow
        report={{ ...baseReport, severity: "medium", createdAt: CREATED_AT }}
        assignedToName={null}
        currentUserId="user-1"
      />,
    );
  }

  function opCodeBadgeClassName(): string {
    const { container, unmount } = render(<OpCodeBadge tone="blue">REF</OpCodeBadge>);
    const className = (container.firstElementChild as HTMLElement).className;
    unmount();
    return className;
  }

  it("renders the reference code through the shared OpCodeBadge atom", () => {
    const expectedClassName = opCodeBadgeClassName();
    renderAligned();
    const code = screen.getByText("DEN-VHCX-GRC9");
    expect(code.tagName).toBe("SPAN");
    expect(code.className).toBe(expectedClassName);
  });

  it("renders the filing date as an absolute formatDate value inside a <time>, not a relative label", () => {
    const { container } = renderAligned();
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    expect(time?.getAttribute("datetime")).toBe(CREATED_AT.toISOString());
    expect(time?.textContent).toBe(formatDate(CREATED_AT));
    // The retired private formatter. Scoped to the <time> element on purpose:
    // SlaBadge legitimately says "vencido hace N días" elsewhere on the card,
    // and that pill is the row's ONE urgency voice now.
    expect(time?.textContent).not.toMatch(/hace/);
  });
});
