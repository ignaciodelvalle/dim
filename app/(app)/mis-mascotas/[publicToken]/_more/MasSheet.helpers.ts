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
  /** Non-interactive placeholder row (ADR-17c) — renders as aria-disabled, not a link. */
  disabled?: boolean;
  /** Small label shown next to a disabled item, e.g. "Próximamente". */
  badge?: string;
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
      // "Editar datos y ficha" absorbs the old separate "Ficha" row — both
      // pointed at the identical ?sheet=editar-mascota (the ficha lives in
      // that form's "Otros" section), so two rows were a false choice
      // (flow audit 2026-07-03).
      id: "edit",
      label: "Editar datos y ficha",
      href: `/mis-mascotas/${pet.publicToken}?sheet=editar-mascota`,
    },
  ];

  // Deceased (ADR-15/REQ-9.3): no write-affordances beyond corrections + who
  // to call. Everything else below (transfer/find-home/service-dog/confirm-
  // return/tracking) is suppressed.
  if (pet.status === "deceased") {
    items.push({
      id: "contacts",
      label: "Contactos de emergencia",
      href: `/mis-mascotas/${pet.publicToken}?sheet=emergencia`,
    });
    return items;
  }

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

  // "Documentos de viaje" was removed (flow audit 2026-07-03): its
  // `?section=docs` deep link was a noop — the edit sheet has no section
  // anchors — so the row promised a destination that didn't exist. Restore
  // it when a section anchor ships.
  //
  // "Ficha" merged into the "Editar datos y ficha" row above (same target).

  // Pet-scoped emergency sheet (?sheet=emergencia) — the same profile fields
  // the old /cuenta/editar path edited, without leaving the pet the user is
  // looking at (flow audit 2026-07-03: two surfaces for one dataset).
  items.push({
    id: "contacts",
    label: "Contactos de emergencia",
    href: `/mis-mascotas/${pet.publicToken}?sheet=emergencia`,
  });

  // The "Rastreo GPS · Próximamente" placeholder row was removed (lean audit
  // 2026-07-03): a disabled row advertising a feature that doesn't exist is
  // noise, not a roadmap. Re-add a real row when GPS tracking ships.

  return items;
}
