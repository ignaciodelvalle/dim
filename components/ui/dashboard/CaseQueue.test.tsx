// CaseQueue — showStatusChips prop (Wave B systemic: /gob/casos + /admin/casos
// adoption). The status filter chips are the queue's built-in status control.
// /admin/casos owns a richer status/kind/province form and suppresses the chips
// to avoid a duplicate control; /gob/casos and /org/…/casos keep them.
//
// Uses renderToStaticMarkup (the repo's dependency-free component harness).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CaseQueue, type CaseQueueRow } from "@/components/ui/dashboard/CaseQueue";
import type { CaseKind } from "@/src/modules/cases/domain/case-kinds";

const ROWS: CaseQueueRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    publicCode: "CAS-0001-0001",
    caseKind: "bite_incident" as CaseKind,
    status: "open",
    primaryPetName: "Firulais",
    primaryPetPublicToken: "DIM-AAAA-BBBB",
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "La Plata",
    openedAt: new Date("2026-01-01T12:00:00.000Z"),
    closedAt: null,
    detailHref: "/casos/CAS-0001-0001",
  },
];

describe("CaseQueue — showStatusChips", () => {
  it("renders the status filter chips by default", () => {
    const html = renderToStaticMarkup(<CaseQueue rows={ROWS} />);
    expect(html).toContain('aria-label="Filtros de estado"');
    expect(html).toContain("Abiertos");
    expect(html).toContain("Cerrados");
  });

  it("suppresses the status chips when showStatusChips={false}", () => {
    const html = renderToStaticMarkup(<CaseQueue rows={ROWS} showStatusChips={false} />);
    expect(html).not.toContain('aria-label="Filtros de estado"');
  });

  it("links each row's code badge to its detailHref", () => {
    const html = renderToStaticMarkup(<CaseQueue rows={ROWS} showStatusChips={false} />);
    expect(html).toContain('href="/casos/CAS-0001-0001"');
    expect(html).toContain("CAS-0001-0001");
  });

  it("renders an empty-state message when there are no rows", () => {
    const html = renderToStaticMarkup(
      <CaseQueue rows={[]} emptyMessage="No hay casos abiertos." showStatusChips={false} />,
    );
    expect(html).toContain("No hay casos abiertos.");
  });
});

// ---------------------------------------------------------------------------
// Casos pack (PO interview 2026-07-23, item 6): urgency sort + honest subject
// rendering for an unregistered-animal case.
// ---------------------------------------------------------------------------

describe("CaseQueue — urgency sort (age-days × kind-severity, default)", () => {
  it('orders rows by urgency score by default and offers "Recientes" as the old order', () => {
    // Same age (opened same instant) but different kind severity:
    // welfare_denuncia (weight 3) must outrank microchip_remediation (weight 1).
    const openedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // 20 days old
    const lowSeverity: CaseQueueRow = {
      ...ROWS[0],
      id: "row-low",
      publicCode: "CAS-LOW-0001",
      caseKind: "microchip_remediation" as CaseKind,
      openedAt,
    };
    const highSeverity: CaseQueueRow = {
      ...ROWS[0],
      id: "row-high",
      publicCode: "CAS-HIGH-0001",
      caseKind: "welfare_denuncia" as CaseKind,
      openedAt,
    };
    // Rows passed in "recientes" order (low first) — urgency sort must reorder.
    const html = renderToStaticMarkup(<CaseQueue rows={[lowSeverity, highSeverity]} />);
    const highIdx = html.indexOf("CAS-HIGH-0001");
    const lowIdx = html.indexOf("CAS-LOW-0001");
    expect(highIdx).toBeGreaterThan(-1);
    expect(lowIdx).toBeGreaterThan(-1);
    expect(highIdx).toBeLessThan(lowIdx);

    // The "Recientes" toggle exists so the old fetch order stays reachable.
    expect(html).toContain("Ordenar por:");
    expect(html).toContain("Urgencia");
    expect(html).toContain("Recientes");
  });

  it("a closed case always scores 0 urgency (sinks below any open case)", () => {
    const veryOldClosed: CaseQueueRow = {
      ...ROWS[0],
      id: "row-closed",
      publicCode: "CAS-CLOSED-0001",
      caseKind: "welfare_denuncia" as CaseKind,
      status: "closed",
      openedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      closedAt: new Date(),
    };
    const freshOpen: CaseQueueRow = {
      ...ROWS[0],
      id: "row-open",
      publicCode: "CAS-OPEN-0001",
      caseKind: "microchip_remediation" as CaseKind,
      status: "open",
      openedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      closedAt: null,
    };
    const html = renderToStaticMarkup(<CaseQueue rows={[veryOldClosed, freshOpen]} />);
    expect(html.indexOf("CAS-OPEN-0001")).toBeLessThan(html.indexOf("CAS-CLOSED-0001"));
  });

  it("does not render the sort toggle for a single-row (or empty) queue", () => {
    const html = renderToStaticMarkup(<CaseQueue rows={[ROWS[0]]} />);
    expect(html).not.toContain("Ordenar por:");
  });
});

describe("CaseQueue — SLA badge via shared due-state (structural convergence 2026-08-02)", () => {
  // The badge now derives from computeDueInfo(caseSlaDueAt(openedAt)) +
  // dueDateBadge — ONE "days past due" implementation shared with the
  // /gob/acciones worklist. These assertions fail against the old bespoke
  // inline badge (which rendered "{age} días" with a hand-rolled legend).
  it("renders the shared dueDateBadge wording ('Venció hace …') at breach, not the raw age", () => {
    // 20 days old with a 14-day SLA → 6 days past due.
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const html = renderToStaticMarkup(
      <CaseQueue rows={[{ ...ROWS[0], openedAt: old, closedAt: null, status: "open" }]} />,
    );
    expect(html).toContain("Venció hace");
    // The count is the distance PAST the deadline (≈6), never the raw age (20).
    expect(html).not.toMatch(/>20 días</);
  });

  it("carries a title legend naming the SLA window the deadline counts against", () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const html = renderToStaticMarkup(
      <CaseQueue rows={[{ ...ROWS[0], openedAt: old, closedAt: null, status: "open" }]} />,
    );
    expect(html).toContain("plazo SLA de 14 días desde la apertura del caso");
  });

  it("keeps the breach tone red (st-err) — danger at breach, same visual as before", () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const html = renderToStaticMarkup(
      <CaseQueue rows={[{ ...ROWS[0], openedAt: old, closedAt: null, status: "open" }]} />,
    );
    expect(html).toContain("var(--color-st-err-bg)");
  });

  it("shows no badge before breach — dueSoon/onTime never render here (threshold preserved)", () => {
    // 10 days old, 14-day SLA → dueSoon/onTime territory, badge absent.
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const html = renderToStaticMarkup(
      <CaseQueue rows={[{ ...ROWS[0], openedAt: recent, closedAt: null, status: "open" }]} />,
    );
    expect(html).not.toContain("Venció");
    expect(html).not.toContain("Vence");
    expect(html).not.toContain("var(--color-st-err-bg)");
  });
});

describe('CaseQueue — "Animal sin registrar" subject rendering (item 6c)', () => {
  it('renders "Animal sin registrar" when the subject is an unowned animal with no pet name', () => {
    const html = renderToStaticMarkup(
      <CaseQueue
        rows={[
          {
            ...ROWS[0],
            primaryPetName: null,
            primaryPetPublicToken: null,
            primarySubjectKind: "unowned_animal",
          },
        ]}
      />,
    );
    expect(html).toContain("Animal sin registrar");
    expect(html).not.toMatch(/>—<\/td>/);
  });

  it('still renders a bare "—" for a non-animal subject with no pet name (e.g. location/general)', () => {
    const html = renderToStaticMarkup(
      <CaseQueue
        rows={[
          {
            ...ROWS[0],
            primaryPetName: null,
            primaryPetPublicToken: null,
            primarySubjectKind: "location",
          },
        ]}
      />,
    );
    expect(html).not.toContain("Animal sin registrar");
    expect(html).toMatch(/>—<\/td>/);
  });
});

describe("CaseQueue — sticky header (Q2)", () => {
  // `position: sticky` only works against the nearest SCROLLING ancestor —
  // jsdom cannot verify the visual behavior, so this pins the STRUCTURE the
  // CSS depends on: the thead is sticky (with an opaque bg + z so rows never
  // show through) AND its wrapper is the element that actually scrolls
  // (max-height + overflow-auto). The old wrapper was `overflow-x-auto` with
  // no height bound — a scroll container that never scrolled vertically, the
  // exact silent-failure trap for sticky.
  it("marks the thead sticky and makes its own wrapper the scrolling element", () => {
    const html = renderToStaticMarkup(<CaseQueue rows={ROWS} />);
    expect(html).toMatch(/<thead class="[^"]*sticky top-0[^"]*"/);
    expect(html).toMatch(/<div class="[^"]*max-h-\[70vh\] overflow-auto[^"]*"/);
    expect(html).not.toContain("overflow-x-auto");
  });
});
