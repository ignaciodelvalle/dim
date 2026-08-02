// Unit tests for lib/outbox-list.ts
//
// Strict TDD mode: tests written before implementation.
// Tests the pure helper functions for breach predicate and filter logic.
// No real DB needed — all tested logic is pure.

import { describe, expect, it } from "vitest";

import {
  ENO_PENDING_TRANSMISSION_STATUS,
  applyOutboxFilters,
  buildBreachCue,
  buildStatusLabel,
  enoExternalDeliveryNote,
  isPendingExternalTransmission,
  isSlaBreached,
} from "@/lib/infra/outbox-list";

// ---------------------------------------------------------------------------
// isSlaBreached — breach predicate
// ---------------------------------------------------------------------------

describe("isSlaBreached", () => {
  it("returns true when status is pending and slaDueAt is in the past", () => {
    const past = new Date(Date.now() - 60_000); // 1 min ago
    expect(isSlaBreached("pending", past)).toBe(true);
  });

  it("returns false when status is pending and slaDueAt is in the future", () => {
    const future = new Date(Date.now() + 60_000); // 1 min from now
    expect(isSlaBreached("pending", future)).toBe(false);
  });

  it("returns false when status is delivered (regardless of slaDueAt)", () => {
    const past = new Date(Date.now() - 60_000);
    expect(isSlaBreached("delivered", past)).toBe(false);
  });

  it("returns false when status is failed (terminal, not a SLA breach)", () => {
    const past = new Date(Date.now() - 60_000);
    expect(isSlaBreached("failed", past)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildStatusLabel — human-readable status
// ---------------------------------------------------------------------------

describe("buildStatusLabel", () => {
  it("maps delivered to the expected Spanish label", () => {
    expect(buildStatusLabel("delivered")).toBe("Entregado");
  });

  it("maps failed to the expected Spanish label", () => {
    expect(buildStatusLabel("failed")).toBe("Fallido");
  });

  it("maps pending to the expected Spanish label", () => {
    expect(buildStatusLabel("pending")).toBe("Pendiente");
  });

  // G7 (2026-08-02): a delivered eno_authority row must NEVER read
  // "Entregado" — no external receiving endpoint exists, so 'delivered' only
  // means our pipeline processed the row. The honest pending-transmission
  // state IS the status, not a footnote.
  describe("G7 — endpoint-less external-authority rows", () => {
    it("relabels delivered+eno_authority to the honest pending-transmission state", () => {
      expect(buildStatusLabel("delivered", "eno_authority")).toBe(ENO_PENDING_TRANSMISSION_STATUS);
    });

    it("never shows 'Entregado' for a delivered eno_authority row", () => {
      expect(buildStatusLabel("delivered", "eno_authority")).not.toBe("Entregado");
      expect(buildStatusLabel("delivered", "eno_authority")).not.toMatch(/entregad/i);
    });

    it("keeps 'Entregado' for genuinely-delivered internal target kinds", () => {
      expect(buildStatusLabel("delivered", "govt_webhook")).toBe("Entregado");
      expect(buildStatusLabel("delivered", "audit_export")).toBe("Entregado");
      expect(buildStatusLabel("delivered", "internal_dashboard")).toBe("Entregado");
    });

    it("only relabels the delivered status — pending/failed eno rows keep honest labels", () => {
      expect(buildStatusLabel("pending", "eno_authority")).toBe("Pendiente");
      expect(buildStatusLabel("failed", "eno_authority")).toBe("Fallido");
    });

    it("keeps the kind-agnostic label when no targetKind is given (filter options)", () => {
      expect(buildStatusLabel("delivered")).toBe("Entregado");
    });
  });
});

// ---------------------------------------------------------------------------
// isPendingExternalTransmission — the endpoint-less delivered class (G7)
// ---------------------------------------------------------------------------

describe("isPendingExternalTransmission", () => {
  it("is true exactly for delivered + eno_authority", () => {
    expect(isPendingExternalTransmission("delivered", "eno_authority")).toBe(true);
  });

  it("is false for every other status of an eno_authority row", () => {
    expect(isPendingExternalTransmission("pending", "eno_authority")).toBe(false);
    expect(isPendingExternalTransmission("failed", "eno_authority")).toBe(false);
  });

  it("is false for delivered rows of real, already-built destinations", () => {
    expect(isPendingExternalTransmission("delivered", "govt_webhook")).toBe(false);
    expect(isPendingExternalTransmission("delivered", "audit_export")).toBe(false);
    expect(isPendingExternalTransmission("delivered", "internal_dashboard")).toBe(false);
  });

  it("stays anchored on enoExternalDeliveryNote (one definition of the class)", () => {
    // If a target kind gains a note, it must also gain the honest relabel.
    expect(isPendingExternalTransmission("delivered", "eno_authority")).toBe(
      enoExternalDeliveryNote("eno_authority") !== null,
    );
  });
});

// ---------------------------------------------------------------------------
// enoExternalDeliveryNote — C2 honest-delivery note (2026-07-22)
// ---------------------------------------------------------------------------

describe("enoExternalDeliveryNote", () => {
  it("returns the honest external-transmission note for eno_authority", () => {
    const note = enoExternalDeliveryNote("eno_authority");
    expect(note).toBe(
      "Registrada y auditada — transmisión a la autoridad pendiente de endpoint receptor.",
    );
  });

  it("never says 'próximamente' (the pipeline itself is real, running today)", () => {
    expect(enoExternalDeliveryNote("eno_authority")).not.toMatch(/próximamente/i);
  });

  it("returns null for every other target_kind (a real, already-built destination)", () => {
    expect(enoExternalDeliveryNote("govt_webhook")).toBeNull();
    expect(enoExternalDeliveryNote("audit_export")).toBeNull();
    expect(enoExternalDeliveryNote("internal_dashboard")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildBreachCue — traffic-light emoji
// ---------------------------------------------------------------------------

describe("buildBreachCue", () => {
  it("returns green circle for delivered rows", () => {
    const future = new Date(Date.now() + 60_000);
    expect(buildBreachCue("delivered", future)).toBe("delivered");
  });

  it("returns failed indicator for failed rows", () => {
    const past = new Date(Date.now() - 60_000);
    expect(buildBreachCue("failed", past)).toBe("failed");
  });

  it("returns breach indicator for pending rows past SLA", () => {
    const past = new Date(Date.now() - 60_000);
    expect(buildBreachCue("pending", past)).toBe("breach");
  });

  it("returns ok indicator for pending rows within SLA", () => {
    const future = new Date(Date.now() + 60_000);
    expect(buildBreachCue("pending", future)).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// applyOutboxFilters — JS-side filter predicate
// ---------------------------------------------------------------------------

describe("applyOutboxFilters", () => {
  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 60_000);

  const rows = [
    {
      status: "pending" as const,
      targetKind: "govt_webhook",
      slaDueAt: past,
      targetJurisdictionProvince: "Buenos Aires",
    },
    {
      status: "delivered" as const,
      targetKind: "eno_authority",
      slaDueAt: future,
      targetJurisdictionProvince: "Córdoba",
    },
    {
      status: "pending" as const,
      targetKind: "govt_webhook",
      slaDueAt: future,
      targetJurisdictionProvince: "Santa Fe",
    },
  ];

  it("returns all rows when no filters applied", () => {
    expect(applyOutboxFilters(rows, {})).toHaveLength(3);
  });

  it("filters by status=delivered returns only delivered rows", () => {
    const result = applyOutboxFilters(rows, { status: "delivered" });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("delivered");
  });

  it("filters by breach=yes returns only pending+past-SLA rows", () => {
    const result = applyOutboxFilters(rows, { breach: "yes" });
    expect(result).toHaveLength(1);
    expect(result[0].targetJurisdictionProvince).toBe("Buenos Aires");
  });

  it("filters by province returns only matching jurisdiction rows", () => {
    const result = applyOutboxFilters(rows, { province: "Córdoba" });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("delivered");
  });
});
