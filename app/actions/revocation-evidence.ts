"use server";

// revocation-evidence.ts — thin shim (strangler migration 55/61).
//
// Business logic moved to:
//   src/modules/organizations/application/revocations/upload-evidence.ts

import { uploadRevocationEvidence as _uploadEvidence } from "@/src/modules/organizations/application/revocations/upload-evidence";

export type {
  UploadEvidenceInput,
  UploadEvidenceResult,
} from "@/src/modules/organizations/application/revocations/upload-evidence";

// @no-auth-required: caller passes actorUserId; the role check (admin | govt)
// runs inside the delegated use-case and IS the auth gate. Matches the
// inner-writer contract but the name doesn't end in ForUser/ForAuthority —
// renaming is a follow-up.
export async function uploadRevocationEvidence(
  ...args: Parameters<typeof _uploadEvidence>
): Promise<Awaited<ReturnType<typeof _uploadEvidence>>> {
  return _uploadEvidence(...args);
}
