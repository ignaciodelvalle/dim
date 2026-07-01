"use server";

// microchip.ts — thin shim (strangler migration 13/61).
//
// Business logic moved to:
//   src/modules/pets/application/microchip/
//
// This file re-exports replaceMicrochipForUser (used by integration tests
// and the 3 route-action importers) and provides replaceMicrochipAction
// (outer auth-guarded server action used by UI components).
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

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
// Writer re-export — async wrapper (used by integration tests and route actions)
// ---------------------------------------------------------------------------

export async function replaceMicrochipForUser(
  userId: string,
  rawInput: ReplaceMicrochipInput,
): Promise<ReplaceMicrochipResult> {
  return _replaceMicrochipForUser(userId, rawInput);
}

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

  return _replaceMicrochipForUser(user.id, rawInput);
}
