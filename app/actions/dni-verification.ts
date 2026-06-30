"use server";

// dni-verification.ts — thin shim (strangler migration 38/61).
//
// Business logic moved to:
//   src/modules/auth/application/dni-verification/
//
// This file re-exports verifyDniForUser (used by integration tests and
// DniVerifyForm.tsx) and verifyDniAction (the outer auth-guarded server
// action consumed by useActionState).
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { sanitizeNext } from "@/lib/dni-next";
import type { DniVerifyFormState, DniVerifyResult } from "@/src/modules/auth/application/dni-verification/types";
import { verifyDniForUser as _verifyDniForUser } from "@/src/modules/auth/application/dni-verification/verify-dni";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { DniVerifyFormState, DniVerifyResult } from "@/src/modules/auth/application/dni-verification/types";

// ---------------------------------------------------------------------------
// Writer re-export — async wrapper (used by integration tests)
// ---------------------------------------------------------------------------

export async function verifyDniForUser(userId: string, rawDni: string): Promise<DniVerifyResult> {
  return _verifyDniForUser(userId, rawDni);
}

// ---------------------------------------------------------------------------
// Outer server action — gates via auth guard, then delegates to writer.
// ---------------------------------------------------------------------------

export async function verifyDniAction(
  _prev: DniVerifyFormState,
  formData: FormData,
): Promise<DniVerifyFormState> {
  const { user } = await requireUserOrRedirect();

  const rawDni = String(formData.get("dni") ?? "").trim();
  const next = sanitizeNext(String(formData.get("next") ?? ""));

  const result = await _verifyDniForUser(user.id, rawDni);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/cuenta");
  return { error: null, ok: true, next };
}
