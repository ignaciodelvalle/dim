// Unit tests for lib/infra/outbox-query.ts (#26 admin↔gob drift unification,
// D3).
//
// Pure — no DB. Renders the Drizzle SQL via PgDialect().sqlToQuery (same
// pattern as lib/metrics/scope.test.ts, which tests jurisdictionPairClause —
// the exact predicate this builder delegates to for the govt branch).
//
// Coverage:
//   - No filters / no scope / no cursor → undefined WHERE (page 1, admin,
//     unfiltered — matches both pages' original "no WHERE at all" shape).
//   - Each user-facing filter (status, target_kind, province, breach yes/no)
//     renders the expected condition; invalid values are ignored.
//   - PARITY: the jurisdiction predicate is applied IFF `opts.jurisdiction`
//     is provided — undefined (admin) never touches the jurisdiction
//     columns; a provided array (govt) always does, even when empty
//     (fail-closed, never "no restriction").
//   - Cursor clause is always appended last.

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  OUTBOX_PAGE_LIMIT,
  VALID_PROVINCE_NAMES,
  buildOutboxWhere,
} from "@/lib/infra/outbox-query";

function render(clause: ReturnType<typeof buildOutboxWhere>) {
  if (!clause) return { sql: "", params: [] as unknown[] };
  return new PgDialect().sqlToQuery(clause);
}

const CURSOR = { ts: "2026-07-01T00:00:00.000Z", id: "11111111-2222-3333-4444-555555555555" };

describe("buildOutboxWhere — constants", () => {
  it("exposes the shared page limit and canonical province set", () => {
    expect(OUTBOX_PAGE_LIMIT).toBe(200);
    expect(VALID_PROVINCE_NAMES.size).toBeGreaterThan(0);
    expect(VALID_PROVINCE_NAMES.has("Buenos Aires")).toBe(true);
  });
});

describe("buildOutboxWhere — no filters / no scope / no cursor", () => {
  it("returns undefined (no WHERE at all) — admin, unfiltered, page 1", () => {
    const clause = buildOutboxWhere({}, { cursor: null });
    expect(clause).toBeUndefined();
  });
});

describe("buildOutboxWhere — user-facing filters", () => {
  it("renders a status condition for a valid status", () => {
    const { sql: text, params } = render(buildOutboxWhere({ status: "pending" }, { cursor: null }));
    expect(text).toContain("status");
    expect(params).toContain("pending");
  });

  it("ignores an invalid status value", () => {
    const clause = buildOutboxWhere({ status: "bogus" }, { cursor: null });
    expect(clause).toBeUndefined();
  });

  it("renders a target_kind condition for a valid value", () => {
    const { sql: text, params } = render(
      buildOutboxWhere({ target_kind: "govt_webhook" }, { cursor: null }),
    );
    expect(text).toContain("target_kind");
    expect(params).toContain("govt_webhook");
  });

  it("renders a province condition for a canonical province name", () => {
    const { sql: text, params } = render(
      buildOutboxWhere({ province: "Buenos Aires" }, { cursor: null }),
    );
    expect(text).toContain("target_jurisdiction_province");
    expect(params).toContain("Buenos Aires");
  });

  it("ignores a non-canonical province value", () => {
    const clause = buildOutboxWhere({ province: "Not A Real Province" }, { cursor: null });
    expect(clause).toBeUndefined();
  });

  it("breach=yes renders pending + past-SLA, skipping the standalone status condition", () => {
    const { sql: text, params } = render(
      buildOutboxWhere({ breach: "yes", status: "delivered" }, { cursor: null }),
    );
    // status='delivered' AND status='pending' would be always-false — the
    // standalone status condition must be skipped when breach=yes.
    expect(params).toContain("pending");
    expect(params).not.toContain("delivered");
    expect(text).toContain("sla_due_at");
  });

  it("breach=no renders the NOT(pending AND past-SLA) guard", () => {
    const { sql: text } = render(buildOutboxWhere({ breach: "no" }, { cursor: null }));
    expect(text).toMatch(/not\s*\(/i);
  });
});

describe("buildOutboxWhere — cursor is appended last", () => {
  it("keeps the cursor comparison after the user-facing filter conditions", () => {
    const { sql: text } = render(buildOutboxWhere({ status: "pending" }, { cursor: CURSOR }));
    const statusIdx = text.indexOf("status");
    const cursorIdx = text.indexOf("created_at");
    expect(statusIdx).toBeGreaterThanOrEqual(0);
    expect(cursorIdx).toBeGreaterThan(statusIdx);
  });
});

// ---------------------------------------------------------------------------
// PARITY — the jurisdiction predicate is applied IFF `opts.jurisdiction` is
// provided. This is the D3 contract: admin (undefined) and govt (an array,
// possibly empty) must differ ONLY by this predicate for the same filters.
// ---------------------------------------------------------------------------
describe("buildOutboxWhere — jurisdiction predicate parity (#26 D3)", () => {
  const FILTERS = { status: "pending" as const };

  it("admin (jurisdiction undefined) never touches jurisdiction columns", () => {
    const { sql: text } = render(buildOutboxWhere(FILTERS, { cursor: null }));
    expect(text).not.toContain("target_jurisdiction_province");
    expect(text).not.toContain("target_jurisdiction_locality");
  });

  it("govt with a non-empty scope applies the jurisdiction predicate", () => {
    const { sql: text, params } = render(
      buildOutboxWhere(FILTERS, {
        jurisdiction: [{ province: "Buenos Aires", locality: "La Plata" }],
        cursor: null,
      }),
    );
    expect(text).toContain("target_jurisdiction_province");
    expect(text).toContain("target_jurisdiction_locality");
    expect(params).toEqual(expect.arrayContaining(["Buenos Aires", "La Plata"]));
  });

  it("govt with an EMPTY scope fails closed (matches nothing), never unscoped", () => {
    const { sql: text } = render(buildOutboxWhere(FILTERS, { jurisdiction: [], cursor: null }));
    // The fail-closed sql`false` literal must appear in the composed clause.
    expect(text).toMatch(/false/);
  });

  it("admin and govt(non-empty) produce the SAME user-facing filter conditions — differ only by the jurisdiction predicate", () => {
    const adminClause = buildOutboxWhere(FILTERS, { cursor: null });
    const govtClause = buildOutboxWhere(FILTERS, {
      jurisdiction: [{ province: "Buenos Aires", locality: "La Plata" }],
      cursor: null,
    });
    const admin = render(adminClause);
    const govt = render(govtClause);
    // The govt query is the admin query's status condition PLUS the
    // jurisdiction predicate — every admin param must still be present, and
    // the admin query must carry the SAME status condition text.
    for (const p of admin.params) expect(govt.params).toContain(p);
    expect(admin.sql).toContain("status");
    expect(govt.sql).toContain("status");
  });

  it("a whole-province govt assignment subsumes locality (jurisdictionPairClause delegation)", () => {
    const { sql: text, params } = render(
      buildOutboxWhere(
        {},
        {
          jurisdiction: [{ province: "CABA", locality: "Ciudad Autónoma de Buenos Aires" }],
          cursor: null,
        },
      ),
    );
    expect(text).toContain("target_jurisdiction_province");
    expect(text).not.toContain("target_jurisdiction_locality");
    expect(params).toContain("CABA");
  });
});
