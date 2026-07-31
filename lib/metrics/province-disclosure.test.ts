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
  it("a LONE sub-k foreign cell pulls in the smallest visible sibling (complementary)", () => {
    // Otherwise: hidden = publishedTotal − Σ(published cells). One hidden cell
    // is one equation with one unknown.
    const plan = planProvinceDisclosure(nationalAdmin(), [
      { province: "Tierra del Fuego", denominator: 3 },
      { province: "Santa Cruz", denominator: 40 },
      { province: "Buenos Aires", denominator: 90_000 },
    ]);

    expect([...plan.withheld].sort()).toEqual(["Santa Cruz", "Tierra del Fuego"]);
    expect(plan.suppressedCount).toBe(2);
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

  it("publishes the row total when TWO or more cells are hidden (no cell isolable)", () => {
    const plan = planProvinceDisclosure(nationalAdmin(), [
      { province: "Tierra del Fuego", denominator: 3 },
      { province: "Santa Cruz", denominator: 4 },
      { province: "Buenos Aires", denominator: 993 },
    ]);

    expect(plan.suppressedCount).toBe(2);
    // The Σ covers withheld cells too — recomputing it from the visible rows is
    // what would BOTH overstate the residual and isolate the hidden ones.
    expect(plan.publishableRowTotal).toBe(1000);
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
];

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

  it("the four value-publishing consumers branch on the fetcher's verdict", () => {
    // /gob/poblacion is excluded on purpose: it publishes NO per-province value
    // (its map is the Panorama embed, which carries its own k-anon + legend), so
    // it has nothing to branch on. Its CSV export is in the list below.
    const publishers = CONSUMERS.filter((c) => !c.endsWith("PoblacionScreen.tsx"));
    for (const rel of publishers) {
      const code = stripComments(readFileSync(join(REPO_ROOT, rel), "utf8"));
      expect(code, rel).toMatch(/\.suppressed|suppressedCount|SuppressedCount/);
    }
  });

  it("every surface that withholds also ANNOUNCES it", () => {
    // #40's own follow-up suppressed the values and left suppressedCount at 0 —
    // a fully hatched map that told nobody. Hiding without disclosing is the
    // failure mode, not the fix.
    const announcing = CONSUMERS.filter((c) => !c.endsWith("PoblacionScreen.tsx"));
    for (const rel of announcing) {
      const code = stripComments(readFileSync(join(REPO_ROOT, rel), "utf8"));
      expect(code, rel).toMatch(/provinceSuppressionNotice\(/);
    }
  });
});
