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

  // "Registrar evento" — the single annotate entry point (Item 6, D7).
  // /anotar is the one canonical capture hub: it carries the quick-capture box
  // plus the full category-grouped catalog (ALL_CAPTURE_OPTIONS). The old
  // second entry ("Todos los eventos" → /eventos/nuevo) was a duplicate catalog
  // and is gone — /eventos/nuevo now 308-redirects to /anotar. The label uses a
  // verb + object per the four-verbs rule (AGENTS.md §Design rules #2): "Anotar
  // algo" was vague and objectless.
  items.push({
    id: "anotar",
    label: "Registrar evento",
    href: `/mis-mascotas/${pet.publicToken}/anotar`,
    variant: "primary",
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
