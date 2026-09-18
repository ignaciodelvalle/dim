// The bulk-intake preview's DB work runs under a budget (L-15).
//
// validateIntakeCsvAction used to issue up to 400 lookups strictly in sequence
// with no ceiling: on a degraded pooler the wizard said "Validando el archivo…"
// and never anything else. These tests pin the three properties that replaced
// that: a hung lookup ends in `null` at the budget, an abandoned run stops
// issuing lookups, and a healthy run returns every row in FILE order even
// though rows are checked concurrently. All lookups are mocked; no database.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookupByTattoo = vi.fn();
vi.mock("@/lib/infra/tattoo-lookup", () => ({
  lookupByTattoo: (...args: unknown[]) => lookupByTattoo(...args),
}));
vi.mock("@/lib/infra/chip-lookup", () => ({ lookupByChip: vi.fn() }));
vi.mock("@/src/modules/pets/application/intake/create-intake", () => ({
  parseIntakeForm: () => ({ error: null }),
}));
// Each record carries a tattoo, so every row costs exactly one lookup.
vi.mock("@/lib/domain/intake-csv", () => ({
  mapIntakeCsvRecord: (record: Record<string, string>) => ({
    fields: { name: record.nombre, tattooCode: `T-${record.nombre}` },
    errors: [],
  }),
}));

import { PRECHECK_CONCURRENCY, validateIntakeRows } from "./validate-rows";

function records(n: number): Record<string, string>[] {
  return Array.from({ length: n }, (_, i) => ({ nombre: `A${i}` }));
}

beforeEach(() => {
  lookupByTattoo.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateIntakeRows — the budget", () => {
  it("a lookup that never answers ends in null at the budget, not a hang", async () => {
    lookupByTattoo.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    const result = await validateIntakeRows(records(3), new Set(), 60);
    expect(result).toBeNull();
    // Answered at (about) the budget — far from the test's own timeout.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("an abandoned run stops issuing lookups after the deadline", async () => {
    // Each lookup takes 40 ms; the budget is 60 ms. Group 1 ends at ~40 ms,
    // group 2 starts before the deadline and ends at ~80 ms, after it; group 3
    // must never start. 40 rows would be 8 groups if nothing stopped the loop.
    lookupByTattoo.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(null), 40)),
    );
    const result = await validateIntakeRows(records(40), new Set(), 60);
    expect(result).toBeNull();

    // Give the abandoned loop time to (wrongly) keep going.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(lookupByTattoo.mock.calls.length).toBeLessThanOrEqual(2 * PRECHECK_CONCURRENCY);
  });
});

describe("validateIntakeRows — a healthy run", () => {
  it("returns every row in file order even when later rows answer first", async () => {
    // Row A0 is the slowest; concurrency must not reorder the preview.
    lookupByTattoo.mockImplementation(
      (code: string) =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve(code === "T-A1" ? { pet: { status: "active" } } : null),
            code === "T-A0" ? 30 : 1,
          ),
        ),
    );
    const result = await validateIntakeRows(records(7), new Set([3]), 5_000);
    expect(result).not.toBeNull();
    expect(result?.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result?.map((r) => r.record.nombre)).toEqual(["A0", "A1", "A2", "A3", "A4", "A5", "A6"]);
    // The tattoo match lands on ITS row, and the duplicate flag on ITS row.
    expect(result?.[1].valid).toBe(false);
    expect(result?.[1].errors[0]).toMatch(/^tatuaje: posible coincidencia/);
    expect(result?.filter((r) => !r.valid).map((r) => r.index)).toEqual([1]);
    expect(result?.filter((r) => r.duplicate).map((r) => r.index)).toEqual([3]);
    expect(lookupByTattoo).toHaveBeenCalledTimes(7);
  });
});
