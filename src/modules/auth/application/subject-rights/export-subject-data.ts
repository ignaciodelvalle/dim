import { requireUserOrRedirect } from "@/lib/auth-guards";
import { createClient } from "@/lib/supabase/server";

import type { ExportSubjectDataResult } from "./types";

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
