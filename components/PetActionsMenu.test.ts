// Unit tests for PetActionsMenu conditional rendering logic.

import { describe, expect, it } from "vitest";
import { deriveActionItems, type PetActionsMenuInput } from "./PetActionsMenu.helpers";

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
  it("'Marcar como perdida' only rendered when pet.status === 'active' (R-NEW-7)", () => {
    const activePet = deriveActionItems(makeInput({ pet: { species: "dog", status: "active", publicToken: "TK" } }));
    const lostPet = deriveActionItems(makeInput({ pet: { species: "dog", status: "lost", publicToken: "TK" } }));

    expect(activePet.map((a) => a.id)).toContain("mark-lost");
    expect(lostPet.map((a) => a.id)).not.toContain("mark-lost");
  });

  it("Ley 26.858 action only rendered for dog + owner role", () => {
    const dogOwner = deriveActionItems(makeInput({ pet: { species: "dog", status: "active", publicToken: "TK" }, ownershipRole: "owner" }));
    const catOwner = deriveActionItems(makeInput({ pet: { species: "cat", status: "active", publicToken: "TK" }, ownershipRole: "owner" }));
    const dogTransit = deriveActionItems(makeInput({ pet: { species: "dog", status: "active", publicToken: "TK" }, ownershipRole: "shelter_custody" }));

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

  it("no extra service-dog action rendered for accessPath === 'org'", () => {
    const orgAccess = deriveActionItems(
      makeInput({ accessPath: "org", ownershipRole: null }),
    );
    expect(orgAccess.map((a) => a.id)).not.toContain("service-dog");
  });

  it("core actions always present (anotar, new-event, edit)", () => {
    const items = deriveActionItems(makeInput());
    const ids = items.map((a) => a.id);
    expect(ids).toContain("anotar");
    expect(ids).toContain("new-event");
    expect(ids).toContain("edit");
  });
});
