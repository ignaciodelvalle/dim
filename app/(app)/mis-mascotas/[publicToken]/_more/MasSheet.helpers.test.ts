// Tests for deriveMasSheetItems — pet-document-redesign ADR-15 (deceased
// pruning). The ADR-17c GPS-tracking placeholder row was removed by the lean
// audit (2026-07-03) — a disabled row advertising a nonexistent feature.
//
// UX honesty pass (2026-07-19): the blanket "no disabled rows" invariant from
// that lean audit is superseded for ONE row — "Viaje y movilidad" — because
// unlike GPS tracking, /viaje IS a real route with no writer behind it
// (transport_recorded is never emitted). See MasSheet.helpers.ts for the
// full rationale.

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

  it("does not surface the travel Próximamente row for a deceased pet", () => {
    const items = deriveMasSheetItems(
      baseInput({ pet: { species: "dog", status: "deceased", publicToken: "abc123" } }),
    );
    expect(items.some((i) => i.id === "travel")).toBe(false);
  });
});

describe("deriveMasSheetItems — no placeholder rows (lean audit 2026-07-03)", () => {
  it("does not surface the removed GPS-tracking placeholder", () => {
    const items = deriveMasSheetItems(baseInput());
    expect(items.some((i) => i.id === "tracking")).toBe(false);
  });
});

describe("deriveMasSheetItems — Viaje y movilidad Próximamente (UX honesty pass, 2026-07-19)", () => {
  it("surfaces a disabled travel row with a Próximamente badge for an active pet", () => {
    const items = deriveMasSheetItems(baseInput());
    const travel = items.find((i) => i.id === "travel");
    expect(travel).toBeDefined();
    expect(travel?.disabled).toBe(true);
    expect(travel?.badge).toBe("Próximamente");
    expect(travel?.label).toBe("Viaje y movilidad");
    expect(travel?.href).toBe("/mis-mascotas/abc123/viaje");
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

describe("deriveMasSheetItems — chapa física entry point", () => {
  it("offers the chapita sheet to an owner viewer", () => {
    const items = deriveMasSheetItems(baseInput());
    const chapita = items.find((i) => i.id === "chapita");
    expect(chapita?.href).toBe("/mis-mascotas/abc123?sheet=chapita");
    // Live row, not a placeholder: the sheet's printable-QR channel is ON by
    // default and links to a real page.
    expect(chapita?.disabled).toBeUndefined();
  });

  it("does NOT offer it for a deceased pet — page.tsx nulls the sheet's data there", () => {
    const items = deriveMasSheetItems(
      baseInput({ pet: { species: "dog", status: "deceased", publicToken: "abc123" } }),
    );
    expect(items.map((i) => i.id)).not.toContain("chapita");
  });

  it("offers it to a foster too (accessPath owner), who can print a tag for the pet they hold", () => {
    const items = deriveMasSheetItems(baseInput({ ownershipRole: "foster" }));
    expect(items.map((i) => i.id)).toContain("chapita");
  });
});
