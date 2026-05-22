// Tests for the §4.9 section ordering in pet-profile v2.
//
// Two levels of guard:
//
//  1. Constant-level guard (original) — the SECTION_ORDER_V2 constant is
//     defined with the correct sequence. Other code that imports the constant
//     can use it as a ground truth.
//
//  2. Source-level DOM guard (new) — reads the actual page.tsx source and
//     extracts data-section="…" attribute positions. Asserts the sequence of
//     attributes in the source matches SECTION_ORDER_V2 exactly.
//     This catches any case where page.tsx is reordered without updating the
//     constant (the two-file drift that the constant guard alone cannot catch).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Authoritative §4.9 section order — matches design §5.
// Each entry is the value of a data-section="…" attribute in page.tsx.
const SECTION_ORDER_V2 = [
  "back-link",
  "cases",
  "ppp-card",
  "service-dog-card",
  "hero",
  "achievements",
  "current-state",
  "upcoming-care",
  "health-timeline",
  "actions-menu",
] as const;

// ---------------------------------------------------------------------------
// Source reader — extracts data-section attribute values in source order
// ---------------------------------------------------------------------------

function extractDataSectionsFromSource(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const regex = /data-section="([^"]+)"/g;
  return Array.from(src.matchAll(regex), (m) => m[1]);
}

// ---------------------------------------------------------------------------
// Constant-level guard (original tests — kept for backward compat)
// ---------------------------------------------------------------------------

describe("§4.9 section order — constant guard (R-NEW-8)", () => {
  it("back-link comes before cases", () => {
    const idx = (id: string) => SECTION_ORDER_V2.indexOf(id as (typeof SECTION_ORDER_V2)[number]);
    expect(idx("back-link")).toBeLessThan(idx("cases"));
  });

  it("hero comes before achievements", () => {
    const idx = (id: string) => SECTION_ORDER_V2.indexOf(id as (typeof SECTION_ORDER_V2)[number]);
    expect(idx("hero")).toBeLessThan(idx("achievements"));
  });

  it("achievements comes before current-state", () => {
    const idx = (id: string) => SECTION_ORDER_V2.indexOf(id as (typeof SECTION_ORDER_V2)[number]);
    expect(idx("achievements")).toBeLessThan(idx("current-state"));
  });

  it("current-state comes before upcoming-care", () => {
    const idx = (id: string) => SECTION_ORDER_V2.indexOf(id as (typeof SECTION_ORDER_V2)[number]);
    expect(idx("current-state")).toBeLessThan(idx("upcoming-care"));
  });

  it("upcoming-care comes before health-timeline", () => {
    const idx = (id: string) => SECTION_ORDER_V2.indexOf(id as (typeof SECTION_ORDER_V2)[number]);
    expect(idx("upcoming-care")).toBeLessThan(idx("health-timeline"));
  });

  it("health-timeline comes before actions-menu", () => {
    const idx = (id: string) => SECTION_ORDER_V2.indexOf(id as (typeof SECTION_ORDER_V2)[number]);
    expect(idx("health-timeline")).toBeLessThan(idx("actions-menu"));
  });

  it("has exactly 10 sections in §4.9 order", () => {
    expect(SECTION_ORDER_V2).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Source-level DOM guard — reads page.tsx data-section attributes in order
// ---------------------------------------------------------------------------

describe("§4.9 section order — source DOM guard (R-NEW-8 AC-A11)", () => {
  const PAGE_TSX = resolve(__dirname, "../app/(app)/mis-mascotas/[publicToken]/page.tsx");

  it("page.tsx contains all §4.9 data-section attributes", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    for (const section of SECTION_ORDER_V2) {
      expect(
        found,
        `data-section="${section}" not found in page.tsx — was the wrapper div removed?`,
      ).toContain(section);
    }
  });

  it("data-section attributes appear in page.tsx in the exact §4.9 spec order", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    // Filter to only the §4.9 sections (ignore any auxiliary data-section attrs).
    const specSections = new Set(SECTION_ORDER_V2 as readonly string[]);
    const filtered = found.filter((s) => specSections.has(s));

    // Failure message is in the test description — biome/vitest types only
    // accept 1 arg to toEqual.
    expect(filtered).toEqual([...SECTION_ORDER_V2]);
  });

  it("no §4.9 section appears more than once in page.tsx", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    const specSections = new Set(SECTION_ORDER_V2 as readonly string[]);
    const filtered = found.filter((s) => specSections.has(s));
    const unique = new Set(filtered);
    expect(filtered.length).toBe(unique.size);
  });
});
