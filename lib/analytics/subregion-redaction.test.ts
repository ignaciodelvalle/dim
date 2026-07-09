import { describe, expect, it } from "vitest";
import { redactSmallSubregionCells } from "./subregion-redaction";

describe("redactSmallSubregionCells (k-anon, k=5)", () => {
  it("redacts counts 1..4 to 0 and marks them suppressed", () => {
    const rows = [
      { code: "06007", name: "Adolfo Alsina", count: 1 },
      { code: "06014", name: "Adolfo Gonzales Chaves", count: 4 },
    ];
    const out = redactSmallSubregionCells(rows);
    for (const r of out) {
      expect(r.suppressed).toBe(true);
      expect(r.count).toBe(0);
    }
  });

  it("passes counts >= 5 through untouched", () => {
    const out = redactSmallSubregionCells([{ code: "06021", name: "Alberti", count: 5 }]);
    expect(out).toEqual([{ code: "06021", name: "Alberti", count: 5 }]);
  });

  it("keeps zero-count rows visible as zero (no cases ≠ suppressed)", () => {
    const out = redactSmallSubregionCells([{ code: "06028", name: "Almirante Brown", count: 0 }]);
    expect(out).toEqual([{ code: "06028", name: "Almirante Brown", count: 0 }]);
    expect(out[0].suppressed).toBeUndefined();
  });

  it("mixed set: only the 1..4 band is redacted", () => {
    const out = redactSmallSubregionCells([
      { code: "a", name: "A", count: 0 },
      { code: "b", name: "B", count: 3 },
      { code: "c", name: "C", count: 12 },
    ]);
    expect(out.find((r) => r.code === "a")).toEqual({ code: "a", name: "A", count: 0 });
    expect(out.find((r) => r.code === "b")).toMatchObject({ count: 0, suppressed: true });
    expect(out.find((r) => r.code === "c")).toEqual({ code: "c", name: "C", count: 12 });
  });

  it("never returns a row with 0 < count < 5", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      code: `c${i}`,
      name: `C${i}`,
      count: i,
    }));
    const out = redactSmallSubregionCells(rows);
    for (const r of out) {
      expect(r.count === 0 || r.count >= 5).toBe(true);
    }
  });
});
