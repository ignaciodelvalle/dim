// Pure helpers for PetActionsMenu — extracted for unit testing.

export interface PetActionsMenuInput {
  pet: {
    species: string;
    status: string;
    publicToken: string;
  };
  accessPath: "owner" | "org";
  ownershipRole: string | null;
  hasPendingReturnProposal: boolean;
}

export interface ActionItem {
  id: string;
  label: string;
  href: string;
  variant: "primary" | "default" | "danger";
}

/**
 * Derives the list of action items to render in PetActionsMenu.
 * Pure function — no side effects.
 */
export function deriveActionItems(input: PetActionsMenuInput): ActionItem[] {
  const { pet, accessPath, ownershipRole, hasPendingReturnProposal } = input;
  const items: ActionItem[] = [];

  // "Anotar algo" — always visible for owner and org.
  items.push({
    id: "anotar",
    label: "Anotar algo",
    href: `/mis-mascotas/${pet.publicToken}/anotar`,
    variant: "primary",
  });

  // "Todos los eventos" — always.
  items.push({
    id: "new-event",
    label: "Todos los eventos",
    href: `/mis-mascotas/${pet.publicToken}/eventos/nuevo`,
    variant: "default",
  });

  // "Editar mascota" — always. Opens the editar-mascota sheet; the
  // /editar page is kept as a deep-link target.
  items.push({
    id: "edit",
    label: "Editar mascota",
    href: `/mis-mascotas/${pet.publicToken}?sheet=editar-mascota`,
    variant: "default",
  });

  // "Mostrar Libreta (Tier 2)" — owner opt-in window for the public
  // credential to reveal a curated medical summary. Hidden for deceased
  // pets (the credential is the in-memoriam page; widening it makes no
  // sense). The page itself enforces the same gate server-side.
  if (pet.status !== "deceased") {
    items.push({
      id: "tier2-public",
      label: "Mostrar Libreta en la credencial",
      href: `/mis-mascotas/${pet.publicToken}/mostrar-libreta`,
      variant: "default",
    });
  }

  // Ley 26.858 — only for dog + legal owner role.
  if (pet.species === "dog" && accessPath === "owner" && ownershipRole === "owner") {
    items.push({
      id: "service-dog",
      label: "Perro de asistencia / guía (Ley 26.858)",
      href: `/mis-mascotas/${pet.publicToken}/asistencia`,
      variant: "default",
    });
  }

  // "Transferir mascota" — owner→owner titularity handoff. Only the legal owner
  // of an active pet can initiate one. Hidden while the pet is lost/deceased
  // (no transfer mid-episode) and for org-path / non-owner roles. The server
  // action (initiatePetTransferAction) re-validates dispute / pending-transfer
  // state, which is not derivable from the helper inputs.
  if (accessPath === "owner" && ownershipRole === "owner" && pet.status === "active") {
    items.push({
      id: "transfer-pet",
      label: "Transferir mascota",
      href: `/mis-mascotas/${pet.publicToken}?sheet=transferir-mascota`,
      variant: "default",
    });
  }

  // "Confirmar devolución" — only when a pending return proposal exists.
  if (hasPendingReturnProposal) {
    items.push({
      id: "confirm-return",
      label: "Confirmar devolución",
      href: `/mis-mascotas/${pet.publicToken}/devolucion`,
      variant: "primary",
    });
  }

  return items;
}
