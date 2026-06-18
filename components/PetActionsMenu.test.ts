// Unit tests for PetActionsMenu conditional rendering logic.

import { describe, expect, it } from "vitest";
import { type PetActionsMenuInput, deriveActionItems } from "./PetActionsMenu.helpers";

function makeInput(overrides: Partial<PetActionsMenuInput> = {}): PetActionsMenuInput {
  return {
    pet: {
      species: "dog",
      status: "active",
      publicToken: "DIM-TEST-1",
    },
    accessPath: "owner",
    ownershipRole: "owner",
    hasPendingReturnProposal: false,
    ...overrides,
  };
}

describe("deriveActionItems — conditional rules", () => {
  it("'Marcar como perdida' is no longer in the overflow menu — moved to the pill + mobile footer to dedupe (R-NEW-7, revised in #550)", () => {
    const activePet = deriveActionItems(
      makeInput({ pet: { species: "dog", status: "active", publicToken: "TK" } }),
    );
    const lostPet = deriveActionItems(
      makeInput({ pet: { species: "dog", status: "lost", publicToken: "TK" } }),
    );

    // Dedupe (task #9): the lost/found CTA lives on the profile pill and the
    // mobile footer, so it was removed from the overflow actions menu to avoid
    // a third, redundant entry point.
    expect(activePet.map((a) => a.id)).not.toContain("mark-lost");
    expect(lostPet.map((a) => a.id)).not.toContain("mark-lost");
  });

  it("Ley 26.858 action only rendered for dog + owner role", () => {
    const dogOwner = deriveActionItems(
      makeInput({
        pet: { species: "dog", status: "active", publicToken: "TK" },
        ownershipRole: "owner",
      }),
    );
    const catOwner = deriveActionItems(
      makeInput({
        pet: { species: "cat", status: "active", publicToken: "TK" },
        ownershipRole: "owner",
      }),
    );
    const dogTransit = deriveActionItems(
      makeInput({
        pet: { species: "dog", status: "active", publicToken: "TK" },
        ownershipRole: "shelter_custody",
      }),
    );

    expect(dogOwner.map((a) => a.id)).toContain("service-dog");
    expect(catOwner.map((a) => a.id)).not.toContain("service-dog");
    expect(dogTransit.map((a) => a.id)).not.toContain("service-dog");
  });

  it("'Confirmar devolución' only when hasPendingReturnProposal is true", () => {
    const withProposal = deriveActionItems(makeInput({ hasPendingReturnProposal: true }));
    const withoutProposal = deriveActionItems(makeInput({ hasPendingReturnProposal: false }));

    expect(withProposal.map((a) => a.id)).toContain("confirm-return");
    expect(withoutProposal.map((a) => a.id)).not.toContain("confirm-return");
  });

  it("'Confirmar devolución' links to the /devolucion surface", () => {
    const items = deriveActionItems(
      makeInput({
        pet: { species: "dog", status: "lost", publicToken: "TK" },
        hasPendingReturnProposal: true,
      }),
    );
    const item = items.find((a) => a.id === "confirm-return");
    expect(item?.href).toBe("/mis-mascotas/TK/devolucion");
  });

  it("'Transferir mascota' only for active owner, not org/non-owner/lost/deceased", () => {
    const activeOwner = deriveActionItems(
      makeInput({
        pet: { species: "dog", status: "active", publicToken: "TK" },
        accessPath: "owner",
        ownershipRole: "owner",
      }),
    );
    const lostOwner = deriveActionItems(
      makeInput({
        pet: { species: "dog", status: "lost", publicToken: "TK" },
        accessPath: "owner",
        ownershipRole: "owner",
      }),
    );
    const orgAccess = deriveActionItems(
      makeInput({
        pet: { species: "dog", status: "active", publicToken: "TK" },
        accessPath: "org",
        ownershipRole: null,
      }),
    );
    const fosterOwner = deriveActionItems(
      makeInput({
        pet: { species: "dog", status: "active", publicToken: "TK" },
        accessPath: "owner",
        ownershipRole: "foster",
      }),
    );

    expect(activeOwner.map((a) => a.id)).toContain("transfer-pet");
    expect(lostOwner.map((a) => a.id)).not.toContain("transfer-pet");
    expect(orgAccess.map((a) => a.id)).not.toContain("transfer-pet");
    expect(fosterOwner.map((a) => a.id)).not.toContain("transfer-pet");
  });

  it("'Transferir mascota' opens the transferir-mascota sheet", () => {
    const items = deriveActionItems(
      makeInput({
        pet: { species: "dog", status: "active", publicToken: "TK" },
        accessPath: "owner",
        ownershipRole: "owner",
      }),
    );
    const item = items.find((a) => a.id === "transfer-pet");
    expect(item?.href).toBe("/mis-mascotas/TK?sheet=transferir-mascota");
  });

  it("no extra service-dog action rendered for accessPath === 'org'", () => {
    const orgAccess = deriveActionItems(makeInput({ accessPath: "org", ownershipRole: null }));
    expect(orgAccess.map((a) => a.id)).not.toContain("service-dog");
  });

  it("single annotate path: 'anotar' present, 'new-event' removed (Item 6, D7)", () => {
    const items = deriveActionItems(makeInput());
    const anotar = items.find((a) => a.id === "anotar");

    // The profile has exactly ONE way to annotate: /anotar (the canonical hub).
    expect(anotar).toBeDefined();
    expect(anotar?.href).toBe("/mis-mascotas/DIM-TEST-1/anotar");
    // Verb + object per the four-verbs rule (AGENTS.md §Design rules #2).
    expect(anotar?.label).toBe("Registrar evento");

    // The duplicate "Todos los eventos" catalog entry (→ /eventos/nuevo) is gone;
    // /eventos/nuevo now redirects to /anotar.
    expect(items.map((a) => a.id)).not.toContain("new-event");
  });

  it("edit action always present", () => {
    const items = deriveActionItems(makeInput());
    expect(items.map((a) => a.id)).toContain("edit");
  });

  it("'Mostrar Libreta en la credencial' (Tier 2) rendered for active/lost, hidden for deceased", () => {
    const active = deriveActionItems(
      makeInput({ pet: { species: "dog", status: "active", publicToken: "TK" } }),
    );
    const lost = deriveActionItems(
      makeInput({ pet: { species: "dog", status: "lost", publicToken: "TK" } }),
    );
    const deceased = deriveActionItems(
      makeInput({ pet: { species: "dog", status: "deceased", publicToken: "TK" } }),
    );

    expect(active.map((a) => a.id)).toContain("tier2-public");
    expect(lost.map((a) => a.id)).toContain("tier2-public");
    expect(deceased.map((a) => a.id)).not.toContain("tier2-public");
  });
});
