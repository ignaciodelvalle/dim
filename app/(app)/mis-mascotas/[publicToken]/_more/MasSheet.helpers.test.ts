// Tests for deriveMasSheetItems — pet-document-redesign ADR-15/ADR-17c
// (deceased pruning + deferred GPS-tracking placeholder row).

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

  it("suppresses the tracking placeholder row for a deceased pet", () => {
    const items = deriveMasSheetItems(
      baseInput({ pet: { species: "dog", status: "deceased", publicToken: "abc123" } }),
    );
    expect(items.some((i) => i.id === "tracking")).toBe(false);
  });
});

describe("deriveMasSheetItems — deferred GPS-tracking row (ADR-17c)", () => {
  it("appends a disabled, badged 'tracking' row for a non-deceased owner", () => {
    const items = deriveMasSheetItems(baseInput());
    const tracking = items.find((i) => i.id === "tracking");
    expect(tracking).toBeDefined();
    expect(tracking?.disabled).toBe(true);
    expect(tracking?.badge).toBe("Próximamente");
  });

  it("is the LAST item in the list", () => {
    const items = deriveMasSheetItems(baseInput());
    expect(items[items.length - 1].id).toBe("tracking");
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
