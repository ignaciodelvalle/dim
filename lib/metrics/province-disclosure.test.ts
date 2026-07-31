// lib/metrics/province-disclosure.test.ts — the D.10 rule (#40c).
//
// DB-free. `planProvinceDisclosure` is the single decision point for every
// per-province aggregate on /admin/censo, /gob/censo, /gob/censo/export,
// /admin/poblacion, /gob/poblacion and /gob/poblacion/export, so these tests are
// the contract for all six surfaces at once.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { SUPPRESSED_MARKER } from "@/lib/open-data/province-suppression";
import { ANONYMITY_K } from "./anonymity";
import { buildProjectionContext } from "./context";
import {
  SUPPRESSED_CELL_TEXT,
  planProvinceDisclosure,
  provinceSuppressionNotice,
  scopeSummaryRow,
  scopeTotalSuppressionNotice,
} from "./province-disclosure";

const period = {
  since: new Date("2025-08-01T00:00:00.000Z"),
  until: new Date("2026-08-01T00:00:00.000Z"),
} as unknown as AnalyticsPeriod;

/** A govt operator assigned the WHOLE province of Tierra del Fuego. */
const tdfOperator = () =>
  buildProjectionContext(
    { role: "govt" },
    [{ province: "Tierra del Fuego", locality: "" }],
    period,
  );

/** A govt operator assigned ONE barrio of CABA — locality grain. */
const palermoOperator = () =>
  buildProjectionContext({ role: "govt" }, [{ province: "CABA", locality: "Palermo" }], period);

/** A national admin: global scope, no drill. */
const nationalAdmin = () => buildProjectionContext({ role: "admin" }, [], period);

/** A national admin drilled into one province via ?province=. */
const drilledAdmin = (province: string) =>
  buildProjectionContext({ role: "admin" }, [], period, { adminProvince: province });

describe("planProvinceDisclosure — D.10, own jurisdiction is not a disclosure", () => {
  it("does NOT suppress the operator's OWN province, even far below k", () => {
    const plan = planProvinceDisclosure(tdfOperator(), [
      { province: "Tierra del Fuego", denominator: 1 },
    ]);

    expect(plan.withheld.has("Tierra del Fuego")).toBe(false);
    expect(plan.suppressedCount).toBe(0);
  });

  it("owns the province even when the assignment is LOCALITY grain (CABA/Palermo)", () => {
    // The scope SQL already fenced the row to Palermo; the row labelled "CABA"
    // only ever aggregates this operator's own animals.
    const plan = planProvinceDisclosure(palermoOperator(), [{ province: "CABA", denominator: 2 }]);

    expect(plan.withheld.size).toBe(0);
  });

  it("suppresses a FOREIGN province below k", () => {
    const plan = planProvinceDisclosure(tdfOperator(), [
      { province: "Tierra del Fuego", denominator: 3 },
      { province: "Santa Cruz", denominator: 3 },
      { province: "Chubut", denominator: 4 },
    ]);

    expect(plan.withheld.has("Tierra del Fuego")).toBe(false);
    expect([...plan.withheld].sort()).toEqual(["Chubut", "Santa Cruz"]);
    expect(plan.suppressedCount).toBe(2);
  });
});

describe("planProvinceDisclosure — the k boundary", () => {
  it(`EXACTLY k (${ANONYMITY_K}) is NOT suppressed`, () => {
    const plan = planProvinceDisclosure(nationalAdmin(), [
      { province: "Santa Cruz", denominator: ANONYMITY_K },
      { province: "Chubut", denominator: 900 },
    ]);

    expect(plan.withheld.size).toBe(0);
    expect(plan.suppressedCount).toBe(0);
  });

  it(`k − 1 (${ANONYMITY_K - 1}) IS suppressed`, () => {
    const plan = planProvinceDisclosure(nationalAdmin(), [
      { province: "Santa Cruz", denominator: ANONYMITY_K - 1 },
      { province: "Chubut", denominator: 900 },
      { province: "Neuquén", denominator: 800 },
    ]);

    expect(plan.withheld.has("Santa Cruz")).toBe(true);
  });

  it("the ZERO nuance: a denominator of exactly 0 is a coverage gap, not a protected group", () => {
    // Badging an empty province "protegido por privacidad" would dress a real
    // data gap as a deliberate withholding — the lie in the other direction.
    const plan = planProvinceDisclosure(nationalAdmin(), [
      { province: "Santa Cruz", denominator: 0 },
      { province: "Chubut", denominator: 900 },
    ]);

    expect(plan.withheld.size).toBe(0);
  });
});

describe("planProvinceDisclosure — admin, decided on the merits", () => {
  it("a national admin owns NO province: every sub-k cell is suppressed", () => {
    const plan = planProvinceDisclosure(nationalAdmin(), [
      { province: "Tierra del Fuego", denominator: 3 },
      { province: "Santa Cruz", denominator: 4 },
      { province: "Buenos Aires", denominator: 90_000 },
    ]);

    expect([...plan.withheld].sort()).toEqual(["Santa Cruz", "Tierra del Fuego"]);
  });

  it("?province= does NOT confer ownership — a suppression a URL can switch off is not one", () => {
    const plan = planProvinceDisclosure(drilledAdmin("Tierra del Fuego"), [
      { province: "Tierra del Fuego", denominator: 3 },
      { province: "Santa Cruz", denominator: 4 },
      { province: "Chubut", denominator: 900 },
    ]);

    expect(plan.withheld.has("Tierra del Fuego")).toBe(true);
  });
});

describe("planProvinceDisclosure — differencing defence", () => {
  it("a LONE sub-k foreign cell costs the ROW TOTAL, never a large province", () => {
    // RA-1 finding C1a. The complementary pass used to promote the smallest
    // VISIBLE sibling here, so /admin/censo hid Santa Cruz's real 40 (in
    // production, La Rioja's 1.204) to protect Tierra del Fuego's 3 — and then
    // announced "menos de 5 mascotas" about it. D.10 authorised withholding lo
    // ajeno that is sub-k; it never authorised spending a large province to
    // protect a small one. The subtraction is closed by withholding the Σ, the
    // one number this module owns.
    const plan = planProvinceDisclosure(nationalAdmin(), [
      { province: "Tierra del Fuego", denominator: 3 },
      { province: "Santa Cruz", denominator: 40 },
      { province: "Buenos Aires", denominator: 90_000 },
    ]);

    expect([...plan.withheld]).toEqual(["Tierra del Fuego"]);
    expect(plan.suppressedCount).toBe(1);
    // hidden = Σ − Σ(visible) is the whole attack; there is no Σ to subtract from.
    expect(plan.publishableRowTotal).toBeNull();
  });

  it("every withheld province really is sub-k, so the notice's reason is true", () => {
    // RA-1 finding C1b: while the complementary pass ran, this line said
    // "2 provincias ocultas por privacidad (menos de 5 mascotas en la
    // jurisdicción)" about a province with 1.204. A notice that misstates the
    // reason teaches the operator to distrust every other one.
    const rows = [
      { province: "Tierra del Fuego", denominator: 3 },
      { province: "La Rioja", denominator: 1_204 },
      { province: "Buenos Aires", denominator: 90_000 },
    ];
    const plan = planProvinceDisclosure(nationalAdmin(), rows);

    expect(plan.withheld.has("La Rioja")).toBe(false);
    for (const r of rows.filter((x) => plan.withheld.has(x.province))) {
      expect(r.denominator, r.province).toBeLessThan(ANONYMITY_K);
    }
    expect(provinceSuppressionNotice(plan.suppressedCount)).toContain(
      `menos de ${ANONYMITY_K} mascotas`,
    );
  });

  it("never promotes an OWN cell to protect a foreign one", () => {
    const plan = planProvinceDisclosure(tdfOperator(), [
      { province: "Tierra del Fuego", denominator: 7 },
      { province: "Santa Cruz", denominator: 3 },
    ]);

    // Santa Cruz is the lone suppressed cell and has no VISIBLE FOREIGN sibling
    // to promote — the own cell is off limits, so the row total is withheld
    // instead (see publishableRowTotal).
    expect([...plan.withheld]).toEqual(["Santa Cruz"]);
    expect(plan.publishableRowTotal).toBeNull();
  });

  it("publishes the row total when nothing is hidden", () => {
    const plan = planProvinceDisclosure(nationalAdmin(), [
      { province: "Buenos Aires", denominator: 900 },
      { province: "Córdoba", denominator: 100 },
    ]);

    expect(plan.publishableRowTotal).toBe(1000);
  });

  it(`publishes the row total when the withheld MASS is >= k (${ANONYMITY_K})`, () => {
    // THE INVARIANT IS Σ(withheld) >= k — not "two or more cells are hidden".
    // The old name for this case claimed "no cell isolable", which its own
    // fixture disproved: 1000 − 993 = 7 over two cells each in [1, 4] pins the
    // pair to {3, 4}. What actually makes the residual publishable is that the
    // 7 animals behind it cannot be attributed to fewer than k of them.
    const rows = [
      { province: "Tierra del Fuego", denominator: 3 },
      { province: "Santa Cruz", denominator: 4 },
      { province: "Buenos Aires", denominator: 993 },
    ];
    const plan = planProvinceDisclosure(nationalAdmin(), rows);

    expect(plan.suppressedCount).toBe(2);
    expect(plan.publishableRowTotal).toBe(1000);

    // The property the publication actually rests on, asserted rather than
    // assumed: the residual the published Σ exposes is itself >= k.
    const visibleSum = rows
      .filter((r) => !plan.withheld.has(r.province))
      .reduce((s, r) => s + r.denominator, 0);
    expect((plan.publishableRowTotal ?? 0) - visibleSum).toBeGreaterThanOrEqual(ANONYMITY_K);
  });

  it("withholds the row total when TWO hidden cells still sum to less than k", () => {
    // The C2 leak (RA-3): `withheld.size === 1` let this through. 1000 − 998 = 2
    // spread over two cells that are each >= 1 forces BOTH to exactly 1 — one
    // animal, one household, per province. Two hidden cells, zero protection.
    const rows = [
      { province: "Tierra del Fuego", denominator: 1 },
      { province: "Santa Cruz", denominator: 1 },
      { province: "Buenos Aires", denominator: 998 },
    ];
    const plan = planProvinceDisclosure(nationalAdmin(), rows);

    expect([...plan.withheld].sort()).toEqual(["Santa Cruz", "Tierra del Fuego"]);
    expect(plan.suppressedCount).toBe(2);
    expect(plan.publishableRowTotal).toBeNull();
  });

  it(`withholds the row total whenever the withheld mass is under k (${ANONYMITY_K})`, () => {
    // The general form, swept across every mass a hidden set can carry: below k
    // the Σ must be withheld, at k and above it may publish. One rule, no
    // special case for "how many cells".
    for (const [a, b] of [
      [1, 1],
      [1, 2],
      [2, 2],
      [1, 3],
      [2, 3],
      [3, 3],
    ] as const) {
      const plan = planProvinceDisclosure(nationalAdmin(), [
        { province: "Tierra del Fuego", denominator: a },
        { province: "Santa Cruz", denominator: b },
        { province: "Buenos Aires", denominator: 1000 - a - b },
      ]);
      const expectPublished = a + b >= ANONYMITY_K;
      expect(plan.publishableRowTotal, `mass ${a}+${b}`).toBe(expectPublished ? 1000 : null);
    }
  });
});

describe("planProvinceDisclosure — the scope headline (RA-3 C1)", () => {
  it("an admin drilled into a sub-k province gets NO scope total", () => {
    // /gob/padron?vista=censo&province=AR-V: petsScopeClause narrows the WHOLE
    // scope to Tierra del Fuego, so "Total registradas: 3" beside a row reading
    // "suprimido por privacidad" is the same number twice — the KPI switched the
    // suppression off with a query param.
    const plan = planProvinceDisclosure(drilledAdmin("Tierra del Fuego"), [
      { province: "Tierra del Fuego", denominator: 3 },
    ]);

    expect(plan.withheld.has("Tierra del Fuego")).toBe(true);
    expect(plan.scopeTotalPublishable).toBe(false);
    expect(plan.publishableRowTotal).toBeNull();
  });

  it("D.10 SURVIVES: a govt operator keeps the total for their OWN sub-k province", () => {
    // The PO's ruling, unchanged: son sus administrados. This is the assertion
    // that must never go green-by-over-suppression.
    const plan = planProvinceDisclosure(tdfOperator(), [
      { province: "Tierra del Fuego", denominator: 3 },
    ]);

    expect(plan.withheld.size).toBe(0);
    expect(plan.scopeTotalPublishable).toBe(true);
    expect(plan.publishableRowTotal).toBe(3);
  });

  it("a drill into an above-k province still publishes its total", () => {
    // Over-suppression is the failure in the other direction: the row is
    // published, so withholding the identical KPI beside it would be theatre.
    const plan = planProvinceDisclosure(drilledAdmin("Buenos Aires"), [
      { province: "Buenos Aires", denominator: 90_000 },
    ]);

    expect(plan.scopeTotalPublishable).toBe(true);
    expect(plan.publishableRowTotal).toBe(90_000);
  });

  it("a MULTI-unit scope keeps its headline — a national admin loses nothing", () => {
    // The scope total is a real aggregate here; rule (4) guards its residual,
    // and blanking /admin/censo because one province is small would be exactly
    // the over-correction RA-1 called out.
    const plan = planProvinceDisclosure(nationalAdmin(), [
      { province: "Tierra del Fuego", denominator: 3 },
      { province: "La Rioja", denominator: 1_204 },
      { province: "Buenos Aires", denominator: 90_000 },
    ]);

    expect(plan.scopeTotalPublishable).toBe(true);
  });

  it("an empty grouping has nothing to withhold", () => {
    const plan = planProvinceDisclosure(nationalAdmin(), []);
    expect(plan.scopeTotalPublishable).toBe(true);
    expect(plan.publishableRowTotal).toBe(0);
  });
});

describe("disclosure copy", () => {
  it("says nothing when nothing is hidden — never announce a mark this frame lacks", () => {
    expect(provinceSuppressionNotice(0)).toBeNull();
    expect(provinceSuppressionNotice(-1)).toBeNull();
  });

  it("announces the real count, singular and plural", () => {
    expect(provinceSuppressionNotice(1)).toContain("1 provincia oculta");
    expect(provinceSuppressionNotice(3)).toContain("3 provincias ocultas");
    expect(provinceSuppressionNotice(3)).toContain(String(ANONYMITY_K));
  });

  it("the scope-headline notice says WHY, and says nothing when there is nothing to say", () => {
    expect(scopeTotalSuppressionNotice(true)).toBeNull();
    const notice = scopeTotalSuppressionNotice(false);
    expect(notice).toContain("una sola jurisdicción");
    expect(notice).toContain(String(ANONYMITY_K));
    // It must NOT read as a coverage gap — the data exists, it is withheld.
    expect(notice).not.toMatch(/sin datos/i);
  });

  it("a withheld resumen keeps every column, marked, and never a zero", () => {
    const raw = { total_registradas: 3, activas: 3, ratio: 0.5 };
    expect(scopeSummaryRow(true, raw)).toEqual(raw);

    const withheld = scopeSummaryRow(false, raw);
    // Same columns — a column that vanishes when it crosses k IS the channel.
    expect(Object.keys(withheld)).toEqual(Object.keys(raw));
    for (const value of Object.values(withheld)) {
      expect(value).toBe(SUPPRESSED_CELL_TEXT);
      expect(value).not.toBe(0);
    }
  });

  it("uses the SAME wording as the public open-data tier", () => {
    // One withheld-cell wording across every tier: an operator reads the same
    // words in a /gob CSV and in a datos-abiertos download.
    expect(SUPPRESSED_CELL_TEXT).toBe(SUPPRESSED_MARKER);
  });
});

// ---------------------------------------------------------------------------
// The screen/export parity guarantee — STRUCTURAL, not a coincidence
// ---------------------------------------------------------------------------
//
// D.10's second half ("el export coincide EXACTAMENTE con la pantalla") is not
// enforced by comparing two outputs — two implementations that agree today drift
// tomorrow. It is enforced by there being exactly ONE decision: the fetchers call
// planProvinceDisclosure and hand out rows that already carry the verdict, so no
// consumer ever holds a raw value it could publish. These tests pin that shape.
//
// The grep runs on COMMENT-STRIPPED source. Every one of these files mentions
// `planProvinceDisclosure` in prose; a naive grep would pass on the comment and
// prove nothing.

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** Strip line comments and block comments (JSX comment blocks included, since
 *  they are block comments in braces) so an assertion about CODE cannot be
 *  satisfied — or defeated — by prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const CONSUMERS = [
  "app/admin/censo/AdminCensoScreen.tsx",
  "app/gob/censo/CensoScreen.tsx",
  "app/gob/censo/export/route.ts",
  "app/admin/poblacion/AdminPoblacionScreen.tsx",
  "app/gob/poblacion/PoblacionScreen.tsx",
  "app/gob/poblacion/export/route.ts",
  // The executive summaries. They joined this list LATE, and that is the point:
  // the censo/población sweep enumerated the surfaces it could see, both of
  // these call `registryCounts` + `fetchSterilizationCoverage`, and /gob/programa
  // accepts `?province=` — so it carried the identical C1 shape for as long as
  // the list did not name it. THIS LIST IS THE SWEEP. A new consumer of either
  // decider belongs here in the same commit that adds the call.
  "app/gob/programa/page.tsx",
  "app/admin/programa/page.tsx",
];

/**
 * Consumers that publish the HEADLINE but no per-province row from these
 * deciders — they have no ROW to branch on or to announce, so the two row-level
 * guards below skip them. They are NOT skipped by the headline guard: the KPI
 * beside the row is where C1 lived on every one of them.
 *
 * /gob/poblacion's map is the Panorama embed (its own k-anon + legend); the two
 * programa pages render no province breakdown from these fetchers at all (their
 * outliers table comes from `fetchCrossJurisdictionOutliers`, a different tier
 * with its own suppression).
 */
const HEADLINE_ONLY = new Set([
  "app/gob/poblacion/PoblacionScreen.tsx",
  "app/gob/programa/page.tsx",
  "app/admin/programa/page.tsx",
]);

/** The two fetchers that own the decision — the only sanctioned callers. */
const DECIDERS = ["lib/metrics/census.ts", "lib/metrics/population-control.ts"];

describe("screen/export parity is structural", () => {
  it.each(CONSUMERS)("%s never re-derives the suppression rule", (rel) => {
    const code = stripComments(readFileSync(join(REPO_ROOT, rel), "utf8"));

    // A consumer that imported the primitives could decide differently from the
    // fetcher — which is exactly how a CSV starts disagreeing with a screen.
    expect(code).not.toMatch(/planProvinceDisclosure|suppressSmallCells|complementarySuppress/);
    expect(code).not.toMatch(/ANONYMITY_K|PROVINCE_K/);
  });

  it.each(DECIDERS)("%s is where the decision is made", (rel) => {
    const code = stripComments(readFileSync(join(REPO_ROOT, rel), "utf8"));
    expect(code).toMatch(/planProvinceDisclosure\(/);
  });

  // The name carries no COUNT on purpose: it iterates the live list, and a
  // number written into an it() name goes stale the next time a surface joins
  // (it already had, saying "four" while iterating five).
  it("every per-row publisher branches on the fetcher's verdict", () => {
    // HEADLINE_ONLY consumers are excluded on purpose — see its docblock. They
    // are NOT excluded from the headline guard below, which is where every one
    // of them actually leaked.
    const publishers = CONSUMERS.filter((c) => !HEADLINE_ONLY.has(c));
    for (const rel of publishers) {
      const code = stripComments(readFileSync(join(REPO_ROOT, rel), "utf8"));
      expect(code, rel).toMatch(/\.suppressed|suppressedCount|SuppressedCount/);
    }
  });

  it("every per-row publisher ANNOUNCES what it withholds", () => {
    // #40's own follow-up suppressed the values and left suppressedCount at 0 —
    // a fully hatched map that told nobody. Hiding without disclosing is the
    // failure mode, not the fix.
    const announcing = CONSUMERS.filter((c) => !HEADLINE_ONLY.has(c));
    for (const rel of announcing) {
      const code = stripComments(readFileSync(join(REPO_ROOT, rel), "utf8"));
      expect(code, rel).toMatch(/provinceSuppressionNotice\(/);
    }
  });

  it.each(CONSUMERS)("%s gates its SCOPE HEADLINE on the same verdict", (rel) => {
    // RA-3 C1 / RA-1 C1c. EVERY consumer is in this list, /gob/poblacion
    // included: the leak was never the row, it was the KPI (and the CSV
    // `resumen`) beside the row, publishing what the row withheld in the same
    // request. Reading the fetcher's `scopeTotalPublishable` — through the one
    // notice helper, so no surface invents its own wording — is what makes the
    // headline a single decision instead of six.
    const code = stripComments(readFileSync(join(REPO_ROOT, rel), "utf8"));
    // The verdict must ARRIVE FROM the fetcher — a literal `true`, or a rule
    // re-derived here, is the second decision point this whole file exists to
    // prevent.
    //
    // The pattern is a PROPERTY ACCESS on whatever the consumer named the
    // fetcher result (`registry`, `coverage`, `sterilization`, …), not an
    // enumeration of those names: the enumeration went stale the first time a
    // surface joined with a fourth name, and a stale allow-list here fails
    // OPEN — it stops asserting anything about the file it skipped. What must
    // never appear is a literal, which the second assertion pins directly.
    expect(code).toMatch(/[A-Za-z_$][\w$]*\.scopeTotalPublishable\b/);
    expect(code).not.toMatch(/scopeTotalPublishable\s*[:=]\s*(true|false)\b/);
    expect(code).toMatch(/scopeTotalSuppressionNotice\(|scopeSummaryRow\(/);
  });

  it.each(CONSUMERS.filter((c) => c.endsWith("route.ts")))(
    "%s withholds its CSV resumen through the shared helper",
    (rel) => {
      // Not a hand-rolled ternary per route: `scopeSummaryRow` is ONE
      // implementation, so the two CSVs cannot withhold differently, and the
      // argument is pinned to the fetcher's field so a `true` slipped in here
      // fails instead of shipping.
      const code = stripComments(readFileSync(join(REPO_ROOT, rel), "utf8"));
      expect(code).toMatch(/scopeSummaryRow\(\s*(registry|coverage)\.scopeTotalPublishable/);
    },
  );

  it.each(DECIDERS)("%s hands the headline verdict down from the plan", (rel) => {
    // The fetcher must PASS THROUGH plan.scopeTotalPublishable, not recompute a
    // headline rule of its own — two implementations that agree today drift
    // tomorrow, which is the entire reason D.10 is decided in one place.
    const code = stripComments(readFileSync(join(REPO_ROOT, rel), "utf8"));
    expect(code).toMatch(/scopeTotalPublishable:\s*plan\.scopeTotalPublishable/);
  });
});
