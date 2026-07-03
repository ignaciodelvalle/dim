// Tests for deriveMasSheetItems — pet-document-redesign ADR-15 (deceased
// pruning). The ADR-17c GPS-tracking placeholder row was removed by the lean
// audit (2026-07-03) — a disabled row advertising a nonexistent feature.

import { describe, expect, it } from "vitest";
import { type MasSheetInput, deriveMasSheetItems } from "./MasSheet.helpers";

function baseInput(overrides: Partial<MasSheetInput> = {}): MasSheetInput {
  return {
    pet: { species: "dog", status: "active", publicToken: "abc123" },
    accessPath: "owner",
    ownershipRole: "owner",
    hasPendingReturnProposal: false,
    ...overrides,
  };
}

describe("deriveMasSheetItems — org viewers", () => {
  it("returns an empty list for org viewers regardless of status", () => {
    expect(deriveMasSheetItems(baseInput({ accessPath: "org" }))).toEqual([]);
  });
});

describe("deriveMasSheetItems — deceased pruning (REQ-9.3)", () => {
  it("offers ONLY Editar datos + Contactos de emergencia", () => {
    const items = deriveMasSheetItems(
      baseInput({ pet: { species: "dog", status: "deceased", publicToken: "abc123" } }),
    );
    expect(items.map((i) => i.id)).toEqual(["edit", "contacts"]);
  });
});

describe("deriveMasSheetItems — no placeholder rows (lean audit 2026-07-03)", () => {
  it("does not surface the removed GPS-tracking placeholder", () => {
    const items = deriveMasSheetItems(baseInput());
    expect(items.some((i) => i.id === "tracking")).toBe(false);
  });

  it("every item is a real, enabled destination (no disabled rows)", () => {
    const items = deriveMasSheetItems(baseInput());
    expect(items.every((i) => !i.disabled)).toBe(true);
  });
});

describe("deriveMasSheetItems — active pet, unaffected existing behavior", () => {
  it("still includes transfer for an owner-role active pet", () => {
    const items = deriveMasSheetItems(baseInput());
    expect(items.some((i) => i.id === "transfer-pet")).toBe(true);
  });

  it("still includes contacts for an active pet", () => {
    const items = deriveMasSheetItems(baseInput());
    expect(items.some((i) => i.id === "contacts")).toBe(true);
  });
});
