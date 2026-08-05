"use server";

// tags.ts — thin shim for the physical-tag lifecycle writers.
//
// Business logic lives in src/modules/pets/application/tags/. The inner
// writers are deliberately NOT exported from this "use server" file —
// exporting them would make each an independently-addressable server action
// accepting an attacker-supplied userId (authz triage 2026-07-04).
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { headers } from "next/headers";

import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { getProfileCached } from "@/lib/infra/request-cache";
import { normalizeTagSerial } from "@/lib/infra/tag-lookup";
import { createClient } from "@/lib/supabase/server";
import { activateTagForUser as _activateTagForUser } from "@/src/modules/pets/application/tags/activate-tag";
import { issueTagBatchForAdmin as _issueTagBatchForAdmin } from "@/src/modules/pets/application/tags/issue-tag-batch";
import { revokeTagForUser as _revokeTagForUser } from "@/src/modules/pets/application/tags/revoke-tag";
import type {
  ActivateTagInput,
  ActivateTagResult,
  IssueTagBatchInput,
  IssueTagBatchResult,
  RevokeTagInput,
  RevokeTagResult,
} from "@/src/modules/pets/application/tags/types";

export type {
  ActivateTagInput,
  ActivateTagResult,
  IssueTagBatchInput,
  IssueTagBatchResult,
  RevokeTagInput,
  RevokeTagResult,
} from "@/src/modules/pets/application/tags/types";

const RATE_LIMITED_MESSAGE = "Demasiados intentos. Esperá unos minutos y volvé a intentar.";

export async function activateTagAction(rawInput: ActivateTagInput): Promise<ActivateTagResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Right-to-erasure lockout (Ley 25.326 art. 16): the writer gates on active
  // ownership but never consults profiles.deleted_at.
  const profile = await getProfileCached(user.id);
  if (profile?.deletedAt != null) return { error: "Tu cuenta fue eliminada." };

  // Brute-force budget on the evidence gate: per-IP AND per-serial, so a
  // botnet cannot spread serial-guessing across IPs nor hammer one serial.
  try {
    const reqHeaders = await headers();
    const ip = callerIp(reqHeaders);
    await enforceRateLimit("tag_activate_ip", ip, { maxPerMinute: 5, maxPerHour: 20 });
    await enforceRateLimit("tag_activate_serial", normalizeTagSerial(rawInput?.serial ?? ""), {
      maxPerMinute: 3,
      maxPerHour: 10,
    });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: RATE_LIMITED_MESSAGE };
    throw err;
  }

  return _activateTagForUser(user.id, rawInput);
}

export async function revokeTagAction(rawInput: RevokeTagInput): Promise<RevokeTagResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const profile = await getProfileCached(user.id);
  if (profile?.deletedAt != null) return { error: "Tu cuenta fue eliminada." };

  return _revokeTagForUser(user.id, rawInput);
}

// Admin batch issuance (design D9). The writer re-verifies the admin role
// inside the transaction; this shim only resolves the session. The returned
// rows carry the PLAINTEXT activation codes exactly once, for the issuance
// CSV — they are never persisted or logged.
export async function issueTagBatchAction(
  rawInput: IssueTagBatchInput,
): Promise<IssueTagBatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const profile = await getProfileCached(user.id);
  if (profile?.deletedAt != null) return { error: "Tu cuenta fue eliminada." };

  return _issueTagBatchForAdmin(user.id, rawInput);
}
