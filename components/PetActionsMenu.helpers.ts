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

  // "Editar mascota" — always.
  items.push({
    id: "edit",
    label: "Editar mascota",
    href: `/mis-mascotas/${pet.publicToken}/editar`,
    variant: "default",
  });

  // "Marcar como perdida" — only when active.
  if (pet.status === "active") {
    items.push({
      id: "mark-lost",
      label: "Marcar como perdida",
      href: `/mis-mascotas/${pet.publicToken}/perdida`,
      variant: "danger",
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
