// OutboxTable — shared outbox list table (Wave B systemic: /admin/outbox +
// /gob/outbox de-duplication). Verifies the two behavioral seams the pages
// inject via props:
//   - detailHrefFor → null renders an inert "—" cell (govt non-admin has no
//     scoped detail page); a non-null href renders the "Detalle" link.
//   - petTokenBySourceEventId links the source-event cell to /p/[token] (admin
//     resolves this; govt omits it → plain text).
//
// Uses renderToStaticMarkup (the repo's dependency-free component harness).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OutboxTable, type OutboxTableRow } from "@/components/ui/dashboard/OutboxTable";

const ROW: OutboxTableRow = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "pending",
  slaDueAt: new Date("2026-01-02T12:00:00.000Z"),
  targetKind: "govt_webhook",
  targetJurisdictionProvince: "Buenos Aires",
  targetJurisdictionLocality: "La Plata",
  sourceEventId: "abcdef12-3456-4789-8abc-def012345678",
  attempts: 1,
  createdAt: new Date("2026-01-01T12:00:00.000Z"),
};

describe("OutboxTable — detail link", () => {
  it("renders the detail link when detailHrefFor returns an href (admin)", () => {
    const html = renderToStaticMarkup(
      <OutboxTable rows={[ROW]} caption="c" detailHrefFor={(r) => `/admin/outbox/${r.id}`} />,
    );
    expect(html).toContain(`href="/admin/outbox/${ROW.id}"`);
    expect(html).toContain("Detalle");
  });

  it("renders an inert dash when detailHrefFor returns null (govt non-admin)", () => {
    const html = renderToStaticMarkup(
      <OutboxTable rows={[ROW]} caption="c" detailHrefFor={() => null} />,
    );
    expect(html).not.toContain(`href="/admin/outbox/${ROW.id}"`);
    expect(html).not.toContain("Detalle");
  });
});

describe("OutboxTable — source-event → pet link", () => {
  it("links the source-event cell to the pet page when a token is supplied (admin)", () => {
    const map = new Map<string, string>([[ROW.sourceEventId, "DIM-CCCC-DDDD"]]);
    const html = renderToStaticMarkup(
      <OutboxTable
        rows={[ROW]}
        caption="c"
        petTokenBySourceEventId={map}
        detailHrefFor={() => null}
      />,
    );
    expect(html).toContain('href="/p/DIM-CCCC-DDDD"');
  });

  it("renders plain source-event text when no token map is supplied (govt)", () => {
    const html = renderToStaticMarkup(
      <OutboxTable rows={[ROW]} caption="c" detailHrefFor={() => null} />,
    );
    expect(html).not.toContain("/p/");
    // The first 8 chars of the source event id are still shown as mono text.
    expect(html).toContain(ROW.sourceEventId.slice(0, 8));
  });
});
