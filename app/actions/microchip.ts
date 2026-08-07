"use server";

// microchip.ts — thin shim (strangler migration 13/61).
//
// Business logic moved to:
//   src/modules/pets/application/microchip/
//
// This file provides replaceMicrochipAction (outer auth-guarded server action
// used by UI components). The inner writer lives in the application module and
// is deliberately NOT exported from this "use server" file — exporting it
// would make it an independently-addressable server action that accepts an
// attacker-supplied userId (authz triage 2026-07-04). Route actions and tests
// import it from src/modules/pets/application/microchip/replace-microchip.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { getProfileCached } from "@/lib/infra/request-cache";
import { createClient } from "@/lib/supabase/server";
import { replaceMicrochipForUser as _replaceMicrochipForUser } from "@/src/modules/pets/application/microchip/replace-microchip";
import type {
  ReplaceMicrochipInput,
  ReplaceMicrochipResult,
} from "@/src/modules/pets/application/microchip/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  ReplaceMicrochipInput,
  ReplaceMicrochipResult,
} from "@/src/modules/pets/application/microchip/types";

// ---------------------------------------------------------------------------
// Outer server action — gates via Supabase session, then delegates to writer.
// ---------------------------------------------------------------------------

export async function replaceMicrochipAction(
  rawInput: ReplaceMicrochipInput,
): Promise<ReplaceMicrochipResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Right-to-erasure lockout (Ley 25.326 art. 16, Wave E2). The writer gates on
  // an active ownership/custody row keyed by userId but never consults
  // profiles.deleted_at, so an erased account holding a still-valid JWT could
  // replace a microchip (a pet event). Reject at the session boundary.
  const profile = await getProfileCached(user.id);
  if (profile?.deletedAt != null) return { error: "Tu cuenta fue eliminada." };

  return _replaceMicrochipForUser(user.id, rawInput);
}
