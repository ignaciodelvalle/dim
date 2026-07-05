import { revalidatePath } from "next/cache";

import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { EraseSubjectDataResult } from "./types";

export async function eraseMySubjectDataAction(reason: string): Promise<EraseSubjectDataResult> {
  const { user } = await requireUserOrRedirect();
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: "Indicá brevemente el motivo (mínimo 5 caracteres)." };
  }

  const supabase = await createClient();

  // Step 1 — redact the application-side subject data. The RPC soft-deletes the
  // profile, hashes/nulls every PII column, scrubs filed reports/transfers, and
  // (Wave D2, migration 0129) redacts third-party PII in owned-pet event
  // payloads. Must run BEFORE the auth row is deleted: the RPC authorizes on
  // auth.uid() and the trigger override it emits is attributed to that uid.
  const { error } = await supabase.rpc("erase_subject_data", {
    p_user_id: user.id,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // Step 2 — delete the auth.users row (Ley 25.326 art. 16). Without this the
  // email + password hash survive forever and the subject can simply log back in
  // to an account whose PII is already gone. Uses the service-role admin client
  // (the anon/cookie client cannot delete auth users). A failure here must NOT
  // block completion: the app-side data is already erased, so we log and still
  // report success — a residual auth row is a follow-up cleanup, not a reason to
  // leave the subject staring at an error after their data is gone.
  try {
    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("[erase-subject-data] auth.users deletion failed", {
        userId: user.id,
        message: deleteError.message,
      });
    }
  } catch (err) {
    console.error("[erase-subject-data] auth.users deletion threw", {
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Drop the session — the profile row is now soft-deleted + PII hashed and the
  // auth row is gone.
  await supabase.auth.signOut();
  revalidatePath("/");
  return { ok: true };
}
