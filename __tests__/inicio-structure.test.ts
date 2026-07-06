// Structure guard for the leaned owner home (/inicio) — task #34.
//
// The PO leaned /inicio: pets must appear ONCE as an actionable surface
// (PetHealthStatusStrip) and reminders must have ONE authoritative surface
// (RemindersSection, which carries the Posponer/Agendar/Registrar actions).
// This test reads the page source and fails if a removed duplicate surface
// creeps back in:
//   - the "01 Mis mascotas" LnRegistry list (duplicated top-nav /mis-mascotas
//     and repeated every pet the health strip already shows)
//   - the read-only "Vencimientos" card (rendered the same reminders array
//     RemindersSection already renders with actions)
//
// Source-scan style follows error-boundary-presence.test.ts: cheap, no render,
// catches structural regressions at the import/JSX level.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE_PATH = join(process.cwd(), "app", "(app)", "inicio", "page.tsx");
const src = readFileSync(PAGE_PATH, "utf8");

describe("/inicio leaned structure (task #34)", () => {
  it("keeps the single actionable reminder surface (RemindersSection)", () => {
    expect(src).toContain("<RemindersSection");
  });

  it("keeps the single per-pet surface (PetHealthStatusStrip)", () => {
    expect(src).toContain("<PetHealthStatusStrip");
  });

  it("keeps the capture block (EventCatcher) untouched", () => {
    expect(src).toContain("<EventCatcher");
  });

  it("keeps the zero-pet 'Cargar una mascota' CTA reachable", () => {
    expect(src).toContain("/mis-mascotas/nueva");
    expect(src).toContain("Cargar una mascota");
  });

  it("does NOT re-add the 'Mis mascotas' registry list (top nav owns that destination)", () => {
    expect(src).not.toContain("LnRegistry");
    expect(src).not.toContain("LnRegRow");
  });

  it("does NOT re-add the read-only 'Vencimientos' card (RemindersSection is authoritative)", () => {
    // JSX-level check — the page's header comment may mention the removed
    // card by name, so match the card head prop, not prose.
    expect(src).not.toContain('title="Vencimientos"');
    expect(src).not.toContain("DueRow");
  });

  it("pets render once — no duplicate LnRegistry/DueRow projection on the home page", () => {
    // #34 removed the REDUNDANT registry (a second list of the same pets). The
    // per-pet compliance STATUS flag is a different thing: the v2 UX gate (Cowork)
    // found /inicio's nudge rollup ("SIN PENDIENTES") contradicted the profile's
    // real state ("0 DE 4 AL DÍA"). F5 fixed that by rendering the SAME
    // fetchComplianceStatesForPets flag the profile/mis-mascotas use — one fetch,
    // no duplicate list. So the strip carrying that status is expected; only the
    // duplicate registry/due-row projection must stay gone (asserted above).
    expect(src).not.toContain("LnRegistry");
    expect(src).not.toContain("DueRow");
  });
});
