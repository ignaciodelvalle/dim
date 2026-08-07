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

  // Chapa física — THE ENTRY POINT THAT WAS MISSING. `?sheet=chapita`
  // (PhysicalTagInterestSheet) has been mounted, data-wired (interest state +
  // the jurisdiction's physical_credential_channels) and reachable by URL since
  // ADR-17b — but NOTHING in the UI linked to it, so the whole surface was
  // dead weight: the printable-QR page it fronts, the interest toggle, and the
  // per-jurisdiction channel copy were all unreachable by clicking. This is the
  // remainder of the physical-credential-hub plan's Fase D.
  //
  // Placed AFTER the deceased early-return above on purpose: page.tsx nulls the
  // chapita data for deceased pets (and for org viewers), so the row must not
  // outlive the data that fills its sheet.
  items.push({
    id: "chapita",
    label: "Chapa física",
    href: `/mis-mascotas/${pet.publicToken}?sheet=chapita`,
  });

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

  // Viaje transfronterizo (movilidad Fase 1): unlike the GPS-tracking row
  // removed by the lean audit below (a placeholder for a feature that never
  // existed), /viaje IS a real route — but no writer anywhere records a
  // transport_recorded event (only jurisdiction_changed moves via /mudanza
  // are wired; see TransportRecordedMovement in
  // src/modules/pets/application/movement/types.ts, still unused). PO
  // decision (UX honesty pass, 2026-07-19): keep the route, stop hiding that
  // it's non-functional — surface it here disabled with "Próximamente"
  // (ADR-17c idiom), same capability-gating spirit as MpfExportGate.
  items.push({
    id: "travel",
    label: "Viaje y movilidad",
    href: `/mis-mascotas/${pet.publicToken}/viaje`,
    disabled: true,
    badge: "Próximamente",
  });

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
