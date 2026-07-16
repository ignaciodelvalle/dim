import { describe, expect, it } from "vitest";

import { isTestAccount } from "./test-accounts";

describe("isTestAccount", () => {
  it("flags genesis cold-start churn (-gen-)", () => {
    expect(isTestAccount("govt-gen-abcd@dim.test")).toBe(true);
    expect(isTestAccount("lucia-gen-9f2@dim.test")).toBe(true);
    expect(isTestAccount("Vet Gen", "vet-gen-xyz@dim.test")).toBe(true);
  });

  it("flags cursor smoke accounts (uc-cd- prefix)", () => {
    expect(isTestAccount("uc-cd-admin")).toBe(true);
    expect(isTestAccount("uc-cd-govt-01")).toBe(true);
  });

  it("flags the dashboard-export fixture", () => {
    expect(isTestAccount("govt-dashboard-export")).toBe(true);
    expect(isTestAccount("Export Bot", "govt-dashboard-export@dim.test")).toBe(true);
  });

  it("matches across any of the provided identifiers", () => {
    // name is clean, email is a test handle → still flagged.
    expect(isTestAccount("María González", "maria-gen-1@dim.test")).toBe(true);
  });

  it("does not flag real operators", () => {
    expect(isTestAccount("María González", "maria@intendencia.gob.ar")).toBe(false);
    expect(isTestAccount("Dirección de Zoonosis CABA")).toBe(false);
    // "uc-cd-" only matches as a PREFIX — a substring elsewhere is not a smoke row.
    expect(isTestAccount("Fundación educ-cd")).toBe(false);
  });

  it("ignores null / undefined identifiers", () => {
    expect(isTestAccount(null, undefined)).toBe(false);
    expect(isTestAccount(undefined, "real@example.gob.ar")).toBe(false);
  });
});
