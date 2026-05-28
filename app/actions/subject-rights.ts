"use server";

// Ley 25.326 subject-rights actions (compliance handoff PR 1).
//
// Thin wrappers over the export_subject_data + erase_subject_data RPCs
// declared in migration 0059. The RPCs are SECURITY DEFINER and check
// auth.uid() themselves; this layer guarantees the caller has a valid
// session before invoking them and shapes the result for UI consumers.

import { revalidatePath } from "next/cache";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { createClient } from "@/lib/supabase/server";

export type ExportSubjectDataResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export async function exportMySubjectDataAction(): Promise<ExportSubjectDataResult> {
  const { user } = await requireUserOrRedirect();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("export_subject_data", {
    p_user_id: user.id,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "El export devolvió vacío." };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

export type EraseSubjectDataResult = { ok: true } | { ok: false; error: string };

export async function eraseMySubjectDataAction(reason: string): Promise<EraseSubjectDataResult> {
  const { user } = await requireUserOrRedirect();
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: "Indicá brevemente el motivo (mínimo 5 caracteres)." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("erase_subject_data", {
    p_user_id: user.id,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // Drop the session — the profile row is now soft-deleted + PII hashed.
  await supabase.auth.signOut();
  revalidatePath("/");
  return { ok: true };
}
