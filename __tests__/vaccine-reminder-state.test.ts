// Pure unit tests for lib/vaccine-reminder-state.ts.
// No DB access. setup.ts only sets env vars — safe to run here.
import { describe, expect, test } from "vitest";

import {
  getReminderVariant,
  getReportableVaccines,
  isVaccineReportable,
} from "@/lib/vaccine-reminder-state";

// ---------------------------------------------------------------------------
// getReminderVariant
// ---------------------------------------------------------------------------

describe("getReminderVariant", () => {
  // upcoming — 8+ días
  test("14 días → upcoming", () => {
    expect(getReminderVariant(14, false)).toBe("upcoming");
  });

  test("8 días → upcoming (borde techo de due_soon)", () => {
    expect(getReminderVariant(8, false)).toBe("upcoming");
  });

  // due_soon — 1..7 días
  test("7 días → due_soon", () => {
    expect(getReminderVariant(7, false)).toBe("due_soon");
  });

  test("1 día → due_soon (borde inferior)", () => {
    expect(getReminderVariant(1, false)).toBe("due_soon");
  });

  // overdue — 0..-30 días
  test("0 días → overdue (vence hoy = vencida semánticamente)", () => {
    expect(getReminderVariant(0, false)).toBe("overdue");
  });

  test("-1 día → overdue", () => {
    expect(getReminderVariant(-1, false)).toBe("overdue");
  });

  test("-30 días → overdue (borde: el umbral crítico es >30, no >=30)", () => {
    expect(getReminderVariant(-30, false)).toBe("overdue");
  });

  // overdue_critical — >30 días vencida + isReportable
  test("-31 días + reportable → overdue_critical", () => {
    expect(getReminderVariant(-31, true)).toBe("overdue_critical");
  });

  test("-31 días + no reportable → overdue (sin lista reportable, no sube a critical)", () => {
    expect(getReminderVariant(-31, false)).toBe("overdue");
  });

  test("-200 días + reportable → overdue_critical", () => {
    expect(getReminderVariant(-200, true)).toBe("overdue_critical");
  });
});

// ---------------------------------------------------------------------------
// getReportableVaccines
// ---------------------------------------------------------------------------

describe("getReportableVaccines", () => {
  test("dog / CABA → contiene rabia, parvo, distemper", () => {
    const result = getReportableVaccines("dog", "CABA");
    expect(result).toContain("rabia");
    expect(result).toContain("parvo");
    expect(result).toContain("distemper");
  });

  test("cat / CABA → contiene rabia, panleucopenia", () => {
    const result = getReportableVaccines("cat", "CABA");
    expect(result).toContain("rabia");
    expect(result).toContain("panleucopenia");
  });

  test("fish / CABA → array vacío (especie sin lista reportable)", () => {
    const result = getReportableVaccines("fish", "CABA");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isVaccineReportable
// ---------------------------------------------------------------------------

describe("isVaccineReportable", () => {
  test('"Antirrábica" + dog → true (substring match, case-insensitive)', () => {
    expect(isVaccineReportable("Antirrábica", "dog", "CABA")).toBe(true);
  });

  test('"Rabia anual" + dog → true', () => {
    expect(isVaccineReportable("Rabia anual", "dog", "CABA")).toBe(true);
  });

  test('"Bordetella" + dog → false (no está en la lista reportable del perro)', () => {
    expect(isVaccineReportable("Bordetella", "dog", "CABA")).toBe(false);
  });

  test('"rabia" + fish → false (especie sin lista reportable)', () => {
    expect(isVaccineReportable("rabia", "fish", "CABA")).toBe(false);
  });
});
