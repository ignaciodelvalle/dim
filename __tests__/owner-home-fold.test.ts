// Contract guard for the owner-home fold (owner-ia-redesign P5).
//
// This REPLACES the old inicio-structure.test.ts, which mandated the leaned
// /inicio dashboard (RemindersSection + PetHealthStatusStrip + EventCatcher).
// P5 deleted that dashboard: /inicio is now a server redirect into the
// most-urgent pet, and /mis-mascotas is the index + inbox. Every assertion the
// old test made about the home has a successor here on the surface the function
// actually landed on.
//
// Source-scan style (same as the file it replaces): cheap, no render, no DB —
// catches structural regressions at the import/JSX level.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const inicioSrc = read("app", "(app)", "inicio", "page.tsx");
const indexSrc = read("app", "(app)", "mis-mascotas", "page.tsx");
const casosSrc = read("app", "(app)", "cuenta", "casos", "page.tsx");

describe("/inicio folds into the profile (decision 7)", () => {
  it("is a server redirect, not a dashboard", () => {
    expect(inicioSrc).toContain("redirect(");
    // No dashboard surfaces remain on the home.
    expect(inicioSrc).not.toContain("<EventCatcher");
    expect(inicioSrc).not.toContain("CredentialRail");
    expect(inicioSrc).not.toContain("PetHealthStatusStrip");
  });

  it("lands on the most-urgent pet using the SAME shared carousel rank", () => {
    expect(inicioSrc).toContain("rankOwnerCarousel");
  });

  it("redirects a zero-live-pet owner to the index+inbox", () => {
    expect(inicioSrc).toContain('redirect("/mis-mascotas")');
  });
});

describe("/mis-mascotas is the index + inbox (decisions 3, 4, 6)", () => {
  it("carries the cross-pet rollup (decision 3, §9.1)", () => {
    expect(indexSrc).toContain("<OwnerRollupStrip");
  });

  it("renders the per-pet CredCard credential rows (moved from the home carousel)", () => {
    expect(indexSrc).toContain("<CredCard");
    expect(indexSrc).toContain("./_components/CredCard");
  });

  it("has an inbox anchored at #inbox (the /cuenta/casos redirect target)", () => {
    expect(indexSrc).toContain('id="inbox"');
  });

  it("shows open workflows AND restores the closed-cases history (§12.9 / P1 orphan)", () => {
    expect(indexSrc).toContain("<CasesWidget");
    expect(indexSrc).toContain("fetchOpenWorkflows");
    expect(indexSrc).toContain("fetchPreviousWorkflows");
  });

  it("surfaces inbound transfers + adoption postulaciones + the resume-application banner", () => {
    expect(indexSrc).toContain("countPendingTransfers");
    expect(indexSrc).toContain("countPendingApplications");
    expect(indexSrc).toContain("<IntentApplyBanner");
  });

  it("has a REAL server-side name search (the 200-cap buscador that never existed)", () => {
    expect(indexSrc).toContain("<PetSearchInput");
    expect(indexSrc).toContain("ilike(pets.name");
  });

  it("keeps deceased pets in In memoriam ONLY (decision 6)", () => {
    expect(indexSrc).toContain("In memoriam");
    expect(indexSrc).toContain('pet.status === "deceased"');
  });

  it("preserves the reclamar entry (index keeps it)", () => {
    expect(indexSrc).toContain("/mis-mascotas/reclamar");
  });

  it("preserves the vet ?as=owner escape hatch (§8 — must survive verbatim)", () => {
    expect(indexSrc).toContain('params.as !== "owner"');
    expect(indexSrc).toContain("resolveVetLanding");
  });
});

describe("/cuenta/casos redirects into the new inbox", () => {
  it("points at /mis-mascotas#inbox (not the transitional /inicio#casos)", () => {
    expect(casosSrc).toContain('redirect("/mis-mascotas#inbox")');
    expect(casosSrc).not.toContain("/inicio#casos");
  });
});
