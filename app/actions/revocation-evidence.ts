"use server";

// revocation-evidence.ts — thin shim (strangler migration 55/61).
//
// Business logic moved to:
//   src/modules/organizations/application/revocations/upload-evidence.ts
//
// The actor is derived from the Supabase session HERE — never accepted from
// the client (authz triage 2026-07-04: the old signature took a
// caller-supplied actorUserId, letting any authenticated caller act as any
// admin/govt whose UUID was known). The admin|govt role check runs inside the
// delegated use-case against the session-derived id.

import { createClient } from "@/lib/supabase/server";
import type {
  UploadEvidenceInput,
  UploadEvidenceResult,
} from "@/src/modules/organizations/application/revocations/upload-evidence";
import { uploadRevocationEvidence as _uploadEvidence } from "@/src/modules/organizations/application/revocations/upload-evidence";

export type {
  UploadEvidenceInput,
  UploadEvidenceResult,
} from "@/src/modules/organizations/application/revocations/upload-evidence";

export async function uploadRevocationEvidence(
  input: UploadEvidenceInput,
): Promise<UploadEvidenceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  return _uploadEvidence(user.id, input);
}
