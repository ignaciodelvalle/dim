import { revalidatePath } from "next/cache";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { createClient } from "@/lib/supabase/server";

import type { EraseSubjectDataResult } from "./types";

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
