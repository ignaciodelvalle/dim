// Tests for the pet-profile section ordering.
//
// REWRITTEN for the "two-face" redesign (2026-07-01, spec
// docs/design/handoffs/2026-07-01-pet-profile-two-face-lean-handoff.md) and
// AGENTS.md §"Pet profile order: identity/credential → alerts (lost leads) →
// capture → faces" (rule 5). The old pet-profile v2.1 flat 11-section order
// this file used to guard (identity → cases → current-state → upcoming-care
// → credentials → ppp-card → service-dog-card → health-timeline →
// actions-menu → achievements) no longer exists: the two-face redesign
// collapsed almost all of it into ONE credential object (CredentialFace)
// plus a single prioritized avisos strip (PetAlertStrip), each owning their
// OWN internal data-section markers in their own files — page.tsx itself now
// carries only 3 data-section attributes.
//
// AGENTS.md rule 5, block order:
//   1. Credencial first (Face 1) — identity/credential is the first content
//      block in every non-terminal state. No conditional banner precedes it.
//   2. Avisos in one prioritized strip, BELOW the credential (lost leads it).
//   3. Capture, then the two-face tabs (Credencial · Libreta).
//   4. Everything else lives behind "⋯ Más".
//
// This test guards ONLY page.tsx's own data-section attributes (per repo
// convention — see the source-DOM-guard technique below), which cover blocks
// 1 and 2: "hero" (the CredentialFace mount point, block 1) and "cases" (the
// open-cases alert inside PetAlertStrip, block 2). Blocks 3 and 4 render
// through PetActionRow.tsx / PetDetailTabs.tsx, which own their OWN
// data-section markers ("action-row", "pet-detail-tabs") in their own
// files — out of scope for a page.tsx-level guard.
//
// Two levels of guard (kept from the original file):
//
//  1. Constant-level guard — SECTION_ORDER is the ground truth other code
//     can import.
//
//  2. Source-level DOM guard — reads the actual page.tsx source and extracts
//     data-section="…" attribute positions, asserting they match the
//     constant. Catches a reorder of page.tsx that forgets to update it.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Authoritative two-face section order for page.tsx's OWN data-section
// attributes — matches AGENTS.md rule 5 blocks 1 (hero) and 2 (cases, the
// one avisos entry with a page.tsx-level marker; the others — lost, rabies,
// transit, pregnancy — render through components that don't take a
// data-section prop at this call site).
const SECTION_ORDER = ["back-link", "hero", "cases"] as const;

// Page-level section names from the pre-two-face v2.1 flat order. None of
// these exist in page.tsx anymore — the two-face redesign absorbed identity,
// PPP, service-dog, achievements, and the action bar into sub-components
// (CredentialFace.tsx, PetActionRow.tsx, PetDetailTabs.tsx) that own their
// own, differently-named, internal markers. Kept here as a negative-case
// regression guard: if any of these resurface in page.tsx, the flat v2.1
// structure is creeping back.
const OBSOLETE_V21_PAGE_SECTIONS = [
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

const PAGE_TSX = resolve(__dirname, "../app/(app)/mis-mascotas/[publicToken]/page.tsx");

// ---------------------------------------------------------------------------
// Constant-level guard — two-face doctrine invariants (AGENTS.md rule 5)
// ---------------------------------------------------------------------------

describe("pet-profile two-face section order — constant guard (AGENTS.md rule 5)", () => {
  const idx = (id: string) => SECTION_ORDER.indexOf(id as (typeof SECTION_ORDER)[number]);

  it("hero (Credencial, block 1) is the first content block — no banner precedes it", () => {
    expect(idx("back-link")).toBe(0);
    expect(idx("hero")).toBe(1);
  });

  it("cases (avisos, block 2) comes AFTER hero — alerts sit below the credential, not above", () => {
    expect(idx("hero")).toBeLessThan(idx("cases"));
  });
});

// ---------------------------------------------------------------------------
// Source-level DOM guard — reads page.tsx data-section attributes in order
// ---------------------------------------------------------------------------

describe("pet-profile two-face section order — source DOM guard (AGENTS.md rule 5)", () => {
  it("page.tsx contains all two-face page-level data-section attributes", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    for (const section of SECTION_ORDER) {
      expect(
        found,
        `data-section="${section}" not found in page.tsx — was the wrapper div removed?`,
      ).toContain(section);
    }
  });

  it("data-section attributes appear in page.tsx in the exact two-face order", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    // Filter to only the guarded sections (ignore any auxiliary data-section
    // attrs that might exist for other reasons, e.g. org-notice banners).
    const guardedSections = new Set(SECTION_ORDER as readonly string[]);
    const filtered = found.filter((s) => guardedSections.has(s));

    expect(filtered).toEqual([...SECTION_ORDER]);
  });

  it("no guarded section appears more than once in page.tsx", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    const guardedSections = new Set(SECTION_ORDER as readonly string[]);
    const filtered = found.filter((s) => guardedSections.has(s));
    const unique = new Set(filtered);
    expect(filtered.length).toBe(unique.size);
  });

  it("the hero data-section precedes the cases data-section in source (no banner-above-credential regression)", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    const heroPos = found.indexOf("hero");
    expect(heroPos).toBeGreaterThanOrEqual(0);
    expect(found.indexOf("cases")).toBeGreaterThan(heroPos);
  });

  it("none of the obsolete pet-profile v2.1 flat-order page sections have resurfaced", () => {
    const found = extractDataSectionsFromSource(PAGE_TSX);
    for (const obsolete of OBSOLETE_V21_PAGE_SECTIONS) {
      expect(
        found,
        `data-section="${obsolete}" found in page.tsx — this is a pre-two-face v2.1 section name; the flat 11-section structure should not resurface (AGENTS.md rule 5)`,
      ).not.toContain(obsolete);
    }
  });
});
