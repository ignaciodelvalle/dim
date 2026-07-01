// Pure helper for MasSheet — derives the "⋯ Más" sheet's action list.
// Mirrors components/PetActionsMenu.helpers.ts but scoped to design's sheets
// map (design.md "Sheets map (?sheet=)") — "Anotar" itself lives in the
// action row, not in this sheet.

export interface MasSheetInput {
  pet: {
    species: string;
    status: string;
    publicToken: string;
  };
  accessPath: "owner" | "org";
  ownershipRole: string | null;
  hasPendingReturnProposal: boolean;
}

export interface MasSheetItem {
  id: string;
  label: string;
  href: string;
}

/**
 * Derives the list of links to render in the "⋯ Más" sheet. Pure function —
 * no side effects. Org-path viewers get an empty list (the sheet is not
 * offered to them at all — see the caller's isOwner gate).
 */
export function deriveMasSheetItems(input: MasSheetInput): MasSheetItem[] {
  const { pet, accessPath, ownershipRole, hasPendingReturnProposal } = input;
  if (accessPath !== "owner") return [];

  const items: MasSheetItem[] = [
    {
      id: "edit",
      label: "Editar datos",
      href: `/mis-mascotas/${pet.publicToken}?sheet=editar-mascota`,
    },
  ];

  if (ownershipRole === "owner" && pet.status === "active") {
    items.push({
      id: "transfer-pet",
      label: "Transferir mascota",
      href: `/mis-mascotas/${pet.publicToken}?sheet=transferir-mascota`,
    });
  }

  if (ownershipRole === "foster" || ownershipRole === "owner") {
    items.push({
      id: "find-home",
      label: "Buscar hogar",
      href: `/mis-mascotas/${pet.publicToken}/buscar-hogar`,
    });
  }

  if (pet.species === "dog" && ownershipRole === "owner") {
    items.push({
      id: "service-dog",
      label: "Perro de asistencia (Ley 26.858)",
      href: `/mis-mascotas/${pet.publicToken}/asistencia`,
    });
  }

  if (hasPendingReturnProposal) {
    items.push({
      id: "confirm-return",
      label: "Confirmar devolución",
      href: `/mis-mascotas/${pet.publicToken}/devolucion`,
    });
  }

  items.push({
    id: "travel-docs",
    label: "Documentos de viaje",
    href: `/mis-mascotas/${pet.publicToken}/editar?section=docs`,
  });

  // Ficha (alergias, comidas, adiestramiento) lives in the same edit form's
  // "Otros" section — no dedicated route exists yet, so this deep-links into
  // the same editar-mascota sheet as "Editar datos".
  items.push({
    id: "ficha",
    label: "Ficha (alergias, comidas, adiestramiento)",
    href: `/mis-mascotas/${pet.publicToken}?sheet=editar-mascota`,
  });

  items.push({ id: "contacts", label: "Contactos de emergencia", href: "/cuenta/editar" });

  return items;
}
