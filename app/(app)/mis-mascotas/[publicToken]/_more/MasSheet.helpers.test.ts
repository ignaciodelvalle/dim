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

// ---------------------------------------------------------------------------
// custodia-temporal C9 — the deny-list, at the UI layer.
//
// The server side already refuses these actions to a `caretaker` (C2's
// requireTitularAccess, plus migration 0190's RLS). This is the OTHER half:
// a caretaker must never SEE the control. A permission wall you discover by
// pressing a button teaches a person that the product is broken, not that the
// boundary is deliberate — and it invites them to keep pressing.
//
// Only the rows a caretaker legitimately keeps stay: the chapita, the travel
// placeholder. Everything titular-only leaves.
// ---------------------------------------------------------------------------
describe("deriveMasSheetItems — caretaker deny-list", () => {
  const caretaker = () => deriveMasSheetItems(baseInput({ ownershipRole: "caretaker" }));
  const ids = () => caretaker().map((i) => i.id);

  it("hides identity editing (deny-list row identity-field-edits)", () => {
    expect(ids()).not.toContain("edit");
  });

  it("hides transferring the pet (deny-list row transfer-initiation)", () => {
    expect(ids()).not.toContain("transfer-pet");
  });

  it("hides publishing for adoption (deny-list row adoption-eligibility-publishing)", () => {
    expect(ids()).not.toContain("find-home");
  });

  it("hides the service-dog attestation — an identity-class claim about the animal", () => {
    expect(ids()).not.toContain("service-dog");
  });

  it("hides the titular's emergency contacts — they are the OWNER's data, not the pet's", () => {
    expect(ids()).not.toContain("contacts");
  });

  it("hides designating another caretaker (deny-list row caretaker-sub-designation)", () => {
    expect(ids()).not.toContain("caretaker");
  });

  it("still offers what a caretaker legitimately has", () => {
    // NON-VACUITY: if a future change emptied the list for caretakers, every
    // assertion above would pass while the sheet became a dead end.
    expect(ids()).toContain("chapita");
    expect(caretaker().length).toBeGreaterThan(0);
  });

  it("leaves the TITULAR's list untouched — this is a deny, not a redesign", () => {
    const owner = deriveMasSheetItems(baseInput()).map((i) => i.id);
    expect(owner).toContain("edit");
    expect(owner).toContain("transfer-pet");
    expect(owner).toContain("contacts");
    expect(owner).toContain("caretaker");
  });

  it("leaves a FOSTER's list untouched — the deny targets caretaker only", () => {
    const foster = deriveMasSheetItems(baseInput({ ownershipRole: "foster" })).map((i) => i.id);
    expect(foster).toContain("edit");
    expect(foster).toContain("find-home");
    // A foster is not the titular either, so no caretaker designation for them.
    expect(foster).not.toContain("caretaker");
  });
});

describe("deriveMasSheetItems — the caretaker entry point", () => {
  it("offers the titular a way to designate one", () => {
    const item = deriveMasSheetItems(baseInput()).find((i) => i.id === "caretaker");
    expect(item?.href).toBe("/mis-mascotas/abc123/cuidado");
  });

  it("uses the locked vocabulary — 'cuidador', never 'custodia'", () => {
    // "Custodia temporal" is the live label for an org's shelter_custody role
    // (PO decision 1, 2026-08-19). Reusing it here would make two different
    // things share a word on the same screen.
    const item = deriveMasSheetItems(baseInput()).find((i) => i.id === "caretaker");
    expect(item?.label).toBe("Cuidador temporal");
  });

  it("is not offered for a deceased pet", () => {
    const ids = deriveMasSheetItems(
      baseInput({ pet: { species: "dog", status: "deceased", publicToken: "abc123" } }),
    ).map((i) => i.id);
    expect(ids).not.toContain("caretaker");
  });
});
