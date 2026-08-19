import { describe, expect, it } from "vitest";
import { suggestNextDueDate } from "./libreta-health-status";

// The regression this file exists for: blind QA 2026-08-19 (O5). The vaccine
// sheet counted the catalog interval from `new Date()` instead of from the
// application date the owner had just changed, so a dose backdated to
// yesterday suggested a booster one day late. The interval must ride the
// APPLICATION date, through the same calendar helper the server derivation
// uses — otherwise the form promises one booster date and the libreta shows
// another.

describe("suggestNextDueDate", () => {
  it("counts the interval from the application date, not from today", () => {
    expect(suggestNextDueDate("2026-08-18", 12)).toBe("2027-08-18");
    expect(suggestNextDueDate("2026-08-19", 12)).toBe("2027-08-19");
  });

  it("a dose loaded a year late is due a year later, not next year", () => {
    // The scaled version of the same defect: `new Date()` would have said
    // 2027-08-19 for a dose actually applied in 2025.
    expect(suggestNextDueDate("2025-03-04", 12)).toBe("2026-03-04");
  });

  it("honours real month lengths and year rollover", () => {
    expect(suggestNextDueDate("2026-01-31", 1)).toBe("2026-03-03"); // Feb overflow, like setMonth
    expect(suggestNextDueDate("2026-11-15", 3)).toBe("2027-02-15");
    expect(suggestNextDueDate("2024-02-29", 12)).toBe("2025-03-01"); // leap → non-leap
  });

  it("does not slip a day under a negative UTC offset (es-AR is UTC-3)", () => {
    // A UTC round-trip on a bare date string is the classic way this breaks.
    expect(suggestNextDueDate("2026-01-01", 6)).toBe("2026-07-01");
    expect(suggestNextDueDate("2026-12-31", 12)).toBe("2027-12-31");
  });

  it("suggests nothing for a vaccine with no interval", () => {
    expect(suggestNextDueDate("2026-08-18", null)).toBe("");
  });

  it("suggests nothing for a date the user is still typing", () => {
    expect(suggestNextDueDate("", 12)).toBe("");
    expect(suggestNextDueDate("2026-08", 12)).toBe("");
    expect(suggestNextDueDate("18/08/2026", 12)).toBe("");
  });
});
