// Guard test: SERVICE_TYPE_LABELS keys must match SERVICE_DOG_TYPES enum exactly.
// Also covers the buildPresentarHref helper used by the footer link.
//
// Tests the pure-logic modules extracted from ServiceDogCredentialCard.tsx
// so they can be tested without a JSX runtime.
// Commits 1 + 3 of pet-profile-v2 Slice C.

import { describe, expect, it } from "vitest";

import { SERVICE_DOG_TYPES } from "@/db/schema";
import { SERVICE_TYPE_LABELS, buildPresentarHref } from "@/lib/infra/service-dog-labels";

describe("SERVICE_TYPE_LABELS exhaustiveness guard", () => {
  it("covers every SERVICE_DOG_TYPES entry", () => {
    const missingKeys = SERVICE_DOG_TYPES.filter(
      (type) => !Object.prototype.hasOwnProperty.call(SERVICE_TYPE_LABELS, type),
    );
    expect(
      missingKeys,
      "SERVICE_TYPE_LABELS is missing keys for schema SERVICE_DOG_TYPES entries",
    ).toEqual([]);
  });

  it("has no stale keys absent from SERVICE_DOG_TYPES", () => {
    const schemaSet = new Set<string>(SERVICE_DOG_TYPES);
    const staleKeys = Object.keys(SERVICE_TYPE_LABELS).filter((k) => !schemaSet.has(k));
    expect(
      staleKeys,
      "SERVICE_TYPE_LABELS has keys not present in SERVICE_DOG_TYPES — remove stale entries",
    ).toEqual([]);
  });

  it("returns a human-readable Spanish label for every enum value", () => {
    for (const type of SERVICE_DOG_TYPES) {
      const label = SERVICE_TYPE_LABELS[type];
      expect(label, `No label for service type: ${type}`).toBeTruthy();
      expect(typeof label).toBe("string");
    }
  });
});

describe("buildPresentarHref", () => {
  it("builds the correct path for a given petPublicToken", () => {
    const href = buildPresentarHref("abc123");
    expect(href).toBe("/mis-mascotas/abc123/asistencia/presentar");
  });

  it("handles tokens with hyphens and underscores", () => {
    const href = buildPresentarHref("tok-abc_def");
    expect(href).toBe("/mis-mascotas/tok-abc_def/asistencia/presentar");
  });
});
