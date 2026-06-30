"use server";

// chip-match.ts — thin shim (strangler migration 21/61).
//
// Business logic moved to:
//   src/modules/pets/application/chip-match/
//
// confirmChipMatchAction (the auth dispatcher / controller) is kept inline here
// because it IS the controller layer — it owns auth guards and routes to the
// appropriate writer based on actorMode.
//
// Both writers and the result type are re-exported with identical signatures so
// the 2 UI importers and the integration test keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { confirmChipMatchAsRefugioWriter as _confirmChipMatchAsRefugioWriter } from "@/src/modules/pets/application/chip-match/confirm-chip-match-refugio";
import { confirmChipMatchAsVecinoWriter as _confirmChipMatchAsVecinoWriter } from "@/src/modules/pets/application/chip-match/confirm-chip-match-vecino";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { ConfirmChipMatchResult } from "@/src/modules/pets/application/chip-match/types";

// ---------------------------------------------------------------------------
// Action — thin controller: auth + routing only, no business logic
// ---------------------------------------------------------------------------

export async function confirmChipMatchAction({
  matchedPetToken,
  actorMode,
  orgToken,
  decision,
  notes,
}: {
  matchedPetToken: string;
  actorMode: "refugio" | "vecino";
  orgToken?: string;
  decision: "same" | "not_same";
  notes?: string;
}) {
  // ---------------------------------------------------------------------------
  // Auth validation
  // ---------------------------------------------------------------------------

  if (actorMode === "refugio") {
    if (!orgToken) {
      return { error: "orgToken requerido para actorMode='refugio'." };
    }
    const auth = await requireCapability("intake.create");
    if (auth.error !== null) return { error: auth.error };
    return _confirmChipMatchAsRefugioWriter({ auth, orgToken, matchedPetToken, decision, notes });
  }

  if (actorMode === "vecino") {
    const session = await requireUserOrRedirect();
    return _confirmChipMatchAsVecinoWriter({
      userId: session.user.id,
      matchedPetToken,
      decision,
      notes,
    });
  }

  return { error: "actorMode inválido. Debe ser 'refugio' o 'vecino'." };
}

// ---------------------------------------------------------------------------
// Writer re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function confirmChipMatchAsRefugioWriter(
  ...args: Parameters<typeof _confirmChipMatchAsRefugioWriter>
) {
  return _confirmChipMatchAsRefugioWriter(...args);
}

export async function confirmChipMatchAsVecinoWriter(
  ...args: Parameters<typeof _confirmChipMatchAsVecinoWriter>
) {
  return _confirmChipMatchAsVecinoWriter(...args);
}
