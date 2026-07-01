import { describe, expect, it } from "vitest";

import {
  PERMANENT_CONDITIONS,
  PERMANENT_CONDITION_GROUPS,
  isPermanentCondition,
  permanentConditionGroup,
  permanentConditionLabel,
  permanentConditionShortLabel,
  sanitizeConditionCodes,
} from "@/lib/reference/permanent-conditions";

describe("permanent-conditions catalog", () => {
  it("isPermanentCondition recognizes catalog codes", () => {
    for (const code of PERMANENT_CONDITIONS) {
      expect(isPermanentCondition(code)).toBe(true);
    }
  });

  it("isPermanentCondition rejects unknown codes", () => {
    expect(isPermanentCondition("invented_condition")).toBe(false);
    expect(isPermanentCondition("")).toBe(false);
  });

  it("every code has a label, a short label, and a known group", () => {
    const validGroups = new Set(PERMANENT_CONDITION_GROUPS.map((g) => g.id));
    for (const code of PERMANENT_CONDITIONS) {
      expect(permanentConditionLabel(code)).toBeTruthy();
      expect(permanentConditionShortLabel(code)).toBeTruthy();
      expect(validGroups.has(permanentConditionGroup(code))).toBe(true);
    }
  });

  it("sanitizeConditionCodes drops unknown codes and keeps order", () => {
    const result = sanitizeConditionCodes(["ciego", "lol_made_up", "sordo", "otra"]);
    expect(result).toEqual(["ciego", "sordo", "otra"]);
  });

  it("sanitizeConditionCodes is idempotent on valid input", () => {
    const valid = ["fiv_positivo", "diabetes"];
    expect(sanitizeConditionCodes(valid)).toEqual(valid);
  });

  it("'otra' is in the catalog so callers can rely on the escape hatch", () => {
    expect(PERMANENT_CONDITIONS).toContain("otra");
  });
});
