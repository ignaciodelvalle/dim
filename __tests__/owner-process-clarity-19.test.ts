// Structure guards for owner process-clarity (task #19).
//
// Source-scan style (same as inicio-structure.test.ts): cheap, no render, no DB.
// Pins the three plan fixes so a later refactor can't silently drop them:
//   Lens 1 — first-run empty state replaces "Todo en orden" for a 0-pet owner.
//   Lens 3 — open cycles (applications + transfers) surfaced on /inicio.
//   Lens 3 — the lost credential card offers "Compartir cartel".

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const INICIO = join(process.cwd(), "app", "(app)", "inicio", "page.tsx");
const CRED_CARD = join(process.cwd(), "app", "(app)", "inicio", "_components", "CredCard.tsx");

const inicioSrc = readFileSync(INICIO, "utf8");
const credCardSrc = readFileSync(CRED_CARD, "utf8");

describe("/inicio — first-run empty state (task #19, Lens 1)", () => {
  it("renders the FirstRunEmptyState surface", () => {
    expect(inicioSrc).toContain("FirstRunEmptyState");
  });

  it("derives first-run state instead of always greeting 'Todo en orden'", () => {
    expect(inicioSrc).toContain("deriveOwnerFirstRunState");
    expect(inicioSrc).toContain("hasManageablePets");
  });

  it("hides the capture card pre-first-pet (gated by hasManageablePets)", () => {
    // The EventCatcher capture block must sit behind the manageable-pets gate.
    expect(inicioSrc).toContain("hasManageablePets && (");
  });
});

describe("/inicio — open cycles surfaced (task #19, Lens 3)", () => {
  it("fetches both open-cycle counts", () => {
    expect(inicioSrc).toContain("countPendingApplications");
    expect(inicioSrc).toContain("countPendingTransfers");
  });

  it("renders the OpenCyclesSection with both counts", () => {
    expect(inicioSrc).toContain("<OpenCyclesSection");
    expect(inicioSrc).toContain("pendingApplications={pendingApplications}");
    expect(inicioSrc).toContain("pendingTransfers={pendingTransfers}");
  });
});

describe("credential card — lost pet next steps (task #19, Lens 3)", () => {
  it("offers 'Compartir cartel' linking to the poster route", () => {
    expect(credCardSrc).toContain("Compartir cartel");
    expect(credCardSrc).toContain("/cartel");
  });

  it("keeps the shipped #9 lost actions (extend, don't rewrite)", () => {
    expect(credCardSrc).toContain("Ver reporte");
    expect(credCardSrc).toContain("Lo encontré");
    expect(credCardSrc).toContain("?sheet=marcar-encontrada");
  });
});
