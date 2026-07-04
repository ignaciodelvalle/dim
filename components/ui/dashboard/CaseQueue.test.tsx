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
