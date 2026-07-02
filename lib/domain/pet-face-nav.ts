// Pure nav mapper for the pet profile's two-face redesign (Credencial | Libreta).
// Spec: docs/design/handoffs/2026-07-01-pet-profile-two-face-lean-handoff.md
//
// Resolves the incoming `?tab=` / `?lente=` URL state into { face, lens }.
// In-app navigation always writes an explicit `lente` alongside `tab=libreta`
// (PetDetailTabs.switchTab); legacy deep links (bookmarks, the /libreta,
// /historial, /vacunas permanentRedirect stubs) omit it and fall back to the
// mapping table below — see design.md "Face navigation + legacy mapping".
//
// Org-path viewers are clamped: Face 2's `todo` lens is never reachable for
// them, via UI toggle or a hand-typed URL (`?tab=libreta&lente=todo`).
// Symmetrically, owners are clamped away from `oficial` (org-only) — a
// legacy `?tab=libreta` (no `lente`) or hand-typed `?lente=oficial` deep link
// resolves to `todo` for an owner instead.

export type PetFace = "credencial" | "libreta";
export type PetLens = "todo" | "vacunas" | "oficial";

export type ResolvePetFaceInput = {
  tab: string | undefined;
  lente: string | undefined;
  isOwner: boolean;
};

export type ResolvePetFaceResult = {
  face: PetFace;
  lens: PetLens;
};

const VALID_LENSES = new Set<string>(["todo", "vacunas", "oficial"]);

function isValidLens(value: string | undefined): value is PetLens {
  return value !== undefined && VALID_LENSES.has(value);
}

export function resolvePetFace({ tab, lente, isOwner }: ResolvePetFaceInput): ResolvePetFaceResult {
  // Face 1 (Credencial) — default (no tab param) and the explicit legacy
  // aliases `resumen` (old default tab key) / `credencial` (new key).
  if (tab === undefined || tab === "credencial" || tab === "resumen") {
    return { face: "credencial", lens: "todo" };
  }

  // Face 2 (Libreta) — every remaining branch resolves a lens.
  let lens: PetLens;
  if (tab === "vacunas") {
    lens = "vacunas";
  } else if (tab === "historial") {
    lens = "todo";
  } else if (tab === "libreta") {
    // Explicit `lente` wins (in-app nav always sets it). No `lente` ⇒ legacy
    // `?tab=libreta` meant the grouped official view.
    lens = isValidLens(lente) ? lente : "oficial";
  } else {
    // Unknown tab value — fall back to Credencial rather than guessing.
    return { face: "credencial", lens: "todo" };
  }

  // Org-viewer clamp: Todo is never reachable for org-path viewers.
  if (!isOwner && lens === "todo") {
    lens = "vacunas";
  }

  // Owner clamp: Oficial is org-only — never reachable for owners.
  if (isOwner && lens === "oficial") {
    lens = "todo";
  }

  return { face: "libreta", lens };
}
