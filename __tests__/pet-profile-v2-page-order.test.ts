// Tests for the pet-profile section ordering.
//
// Updated for pet profile v2.1 (Item 6, 2026-06-18, spec
// `2026-06-18-pet-profile-v21-reorder-and-action-consolidation-design.md`).
// v2.1 reordered the profile: identity (hero) is ALWAYS first (D2); the
// conditional avisos collapse into a single <PetAlertStrip> BELOW the hero
// (D3); PPP + perro de servicio move from full-width banners above the hero to
// credential cards INSIDE Resumen (section 03, D4); achievements render LAST in
// Resumen (D5). The pre-v2.1 order (cases/ppp/service-dog above the hero,
// achievements first) is gone.
//
// Two levels of guard:
//
//  1. Constant-level guard — the SECTION_ORDER_V21 constant is the ground
//     truth other code can import.
//
//  2. Source-level DOM guard — reads the actual page.tsx source and extracts
//     data-section="…" attribute positions, asserting they match the constant.
//     Catches a reorder of page.tsx that forgets to update the constant.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Authoritative v2.1 section order — matches spec §3.1.
// Each entry is the value of a data-section="…" attribute in page.tsx, in
// source order. Note: PPP/service-dog now sit INSIDE Resumen (after
// upcoming-care, under the "credentials" group), and achievements is LAST.
const SECTION_ORDER_V21 = [
  "back-link",
  "hero",
  "cases",
  "current-state",
  "upcoming-care",
  "credentials",
  "ppp-card",
  "service-dog-card",
  "health-timeline",
  "actions-menu",
  "achievements",
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
// Constant-level guard — v2.1 invariants
// ---------------------------------------------------------------------------

describe("pet-profile v2.1 section order — constant guard (Item 6)", () => {
  const idx = (id: string) => SECTION_ORDER_V21.indexOf(id as (typeof SECTION_ORDER_V21)[number]);

  it("hero is the FIRST content block (identity first — D2)", () => {
    // back-link is chrome; hero is the first real content section, and it
    // precedes every conditional aviso (cases) and every Resumen section.
    expect(idx("back-link")).toBe(0);
    expect(idx("hero")).toBe(1);
    expect(idx("hero")).toBeLessThan(idx("cases"));
    expect(idx("hero")).toBeLessThan(idx("current-state"));
  });

  it("credentials (PPP + service-dog) live inside Resumen, after upcoming-care (D4)", () => {
    expect(idx("upcoming-care")).toBeLessThan(idx("credentials"));
    expect(idx("credentials")).toBeLessThan(idx("ppp-card"));
    expect(idx("ppp-card")).toBeLessThan(idx("service-dog-card"));
    // …and they are NOT above the hero anymore.
    expect(idx("hero")).toBeLessThan(idx("ppp-card"));
    expect(idx("hero")).toBeLessThan(idx("service-dog-card"));
  });

  it("achievements renders LAST (D5)", () => {
    const last = SECTION_ORDER_V21[SECTION_ORDER_V21.length - 1];
    expect(last).toBe("achievements");
    expect(idx("achievements")).toBeGreaterThan(idx("current-state"));
    expect(idx("achievements")).toBeGreaterThan(idx("health-timeline"));
  });

  it("current-state → upcoming-care → health-timeline → actions-menu sequence holds", () => {
    expect(idx("current-state")).toBeLessThan(idx("upcoming-care"));
    expect(idx("upcoming-care")).toBeLessThan(idx("health-timeline"));
    expect(idx("health-timeline")).toBeLessThan(idx("actions-menu"));
  });
});

// ---------------------------------------------------------------------------
// Source-level DOM guard — reads page.tsx data-section attributes in order
// ---------------------------------------------------------------------------

describe("pet-profile v2.1 section order — source DOM guard (Item 6)", () => {
  const PAGE_TSX = resolve(__dirname, "../app/(app)/mis-mascotas/[publicToken]/page.tsx");

  it("page.tsx contains all v2.1 data-section attributes", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    for (const section of SECTION_ORDER_V21) {
      expect(
        found,
        `data-section="${section}" not found in page.tsx — was the wrapper div removed?`,
      ).toContain(section);
    }
  });

  it("data-section attributes appear in page.tsx in the exact v2.1 order", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    // Filter to only the v2.1 sections (ignore any auxiliary data-section attrs).
    const specSections = new Set(SECTION_ORDER_V21 as readonly string[]);
    const filtered = found.filter((s) => specSections.has(s));

    expect(filtered).toEqual([...SECTION_ORDER_V21]);
  });

  it("no v2.1 section appears more than once in page.tsx", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    const specSections = new Set(SECTION_ORDER_V21 as readonly string[]);
    const filtered = found.filter((s) => specSections.has(s));
    const unique = new Set(filtered);
    expect(filtered.length).toBe(unique.size);
  });

  it("the hero data-section precedes the cases/ppp/service-dog sections in source (no banner-above-hero regression)", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    const heroPos = found.indexOf("hero");
    expect(heroPos).toBeGreaterThanOrEqual(0);
    for (const after of ["cases", "ppp-card", "service-dog-card", "achievements"]) {
      expect(found.indexOf(after)).toBeGreaterThan(heroPos);
    }
  });
});
