// Audience-precision plan (2026-06-19): welfare-report coordinates are shown at
// the minimum precision each audience needs.
//   - Public tracking receipt (/denuncias/codigo/[code]) — APPROXIMATE only
//     (Ley 25.326 minimisation). No exact decimals, no street address.
//   - Authority (/gob/maltrato/[id], /admin/moderacion/[id]) — EXACT, labelled
//     "uso oficial" (Ley 14.346), and every view is logged for accountability.
//
// These surfaces are server components; rather than render them, we assert the
// contract in source (same source-scan style as
// welfare-integration-banner-gating.test.ts). If a future edit re-introduces an
// exact public coordinate or drops the authority access log, this fails.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PUBLIC_RECEIPT = join(
  process.cwd(),
  "app",
  "(public)",
  "denuncias",
  "codigo",
  "[code]",
  "page.tsx",
);
const GOB_DETAIL = join(process.cwd(), "app", "gob", "maltrato", "[id]", "page.tsx");
const ADMIN_DETAIL = join(process.cwd(), "app", "admin", "moderacion", "[id]", "page.tsx");

describe("public comprobante — approximate location only (Ley 25.326)", () => {
  const src = readFileSync(PUBLIC_RECEIPT, "utf8");

  it("never renders an exact coordinate (no toFixed(6))", () => {
    expect(src).not.toMatch(/toFixed\(6\)/);
  });

  it("coarsens the point to approximate before display", () => {
    expect(src).toMatch(/coarsenPoint\([^)]*"approx"\)/);
  });

  it("labels the map as approximate (no street-level pin implied)", () => {
    expect(src).toContain("Ubicación aproximada");
  });

  it("does not render the street-level locationAddress", () => {
    expect(src).not.toMatch(/report\.locationAddress/);
  });
});

describe("authority surfaces — exact location, labelled, and logged (Ley 14.346)", () => {
  it("gob detail keeps the exact coordinate, labels official use, and logs the view", () => {
    const src = readFileSync(GOB_DETAIL, "utf8");
    // Exact precision preserved — do NOT degrade the investigative surface.
    expect(src).toMatch(/toFixed\(6\)/);
    expect(src).toContain("uso oficial (Ley 14.346)");
    expect(src).toContain("logWelfareLocationViewed");
  });

  it("admin moderation renders the EXACT point (un-coarsened), labels official use, and logs the view", () => {
    const src = readFileSync(ADMIN_DETAIL, "utf8");
    // The map must receive the raw exact point — admin must NOT coarsen.
    expect(src).toMatch(/LocationMap lat=\{locationPoint\.lat\}/);
    expect(src).not.toMatch(/coarsenPoint/);
    expect(src).toContain("uso oficial (Ley 14.346)");
    expect(src).toContain("logWelfareLocationViewed");
  });
});
