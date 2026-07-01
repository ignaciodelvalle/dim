// Use-case: resetInstitutionalCredentialsForAuthority
//
// Generates a magic link for an active institutional account:
//   1. Capability check (admin only)
//   2. Load + validate target (institutional, not deactivated)
//   3. Fetch target email from auth.users via admin SDK
//   4. auth.admin.generateLink (type: magiclink)
//   5. INSERT audit_log action='operator_credentials_reset'
//   6. INSERT notification to target (single insert — best-effort, try/catch)
//
// ARCH-P: the notification insert is wrapped in try/catch so a failure
// does not propagate to the caller (single-insert hardening pattern).

import { eq } from "drizzle-orm";

import { auditLog, db, notifications, profiles } from "@/db";
import { canResetCredentials } from "@/lib/domain/institutional-scope";
import { MOTIVO_MIN } from "@/lib/domain/revocation-validation";
import { createAdminClient } from "@/lib/supabase/admin";

import { loadActorProfile } from "./helpers";
import type { ResetCredentialsResult } from "./types";

export async function resetInstitutionalCredentialsForAuthority(
  actorUserId: string,
  input: { targetUserId: string; reason: string },
): Promise<ResetCredentialsResult> {
  // 0. Validate reason (mirror the deactivation MOTIVO_MIN — resetting credentials
  // logs out the live operator, so it carries the same friction as a deactivation).
  const reasonTrimmed = (input.reason ?? "").trim();
  if (reasonTrimmed.length < MOTIVO_MIN) {
    return { error: `REASON_TOO_SHORT: el motivo requiere al menos ${MOTIVO_MIN} caracteres.` };
  }

  // 1. Load actor + capability check
  const actorProfile = await loadActorProfile(actorUserId);
  if (!actorProfile) return { error: "CAPABILITY_DENIED" };
  if (!canResetCredentials(actorProfile)) return { error: "CAPABILITY_DENIED" };

  // 2. Load + validate target
  const [targetProfile] = await db
    .select({
      id: profiles.id,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, input.targetUserId))
    .limit(1);

  if (!targetProfile) return { error: "NOT_FOUND" };
  if (targetProfile.accountType !== "institutional") return { error: "NOT_INSTITUTIONAL" };
  if (targetProfile.deactivatedAt !== null) return { error: "TARGET_DEACTIVATED" };

  const supabase = createAdminClient();

  // 3. Fetch target email from auth.users via admin SDK
  const { data: authUserData, error: userErr } = await supabase.auth.admin.getUserById(
    input.targetUserId,
  );
  if (userErr || !authUserData?.user?.email) {
    return { error: `AUTH_USER_NOT_FOUND: ${userErr?.message ?? "no email"}` };
  }
  const targetEmail = authUserData.user.email;

  // 4. Generate magic link
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  });

  if (linkErr || !linkData?.properties?.action_link) {
    return { error: `LINK_GENERATION_FAILED: ${linkErr?.message ?? "no action_link"}` };
  }

  const magicLink = linkData.properties.action_link;

  // 5. INSERT audit_log (single insert — no transaction needed)
  await db.insert(auditLog).values({
    actorUserId,
    action: "operator_credentials_reset",
    targetUserId: input.targetUserId,
    payload: {
      method: "magic_link",
      magic_link: magicLink,
      reason: reasonTrimmed,
    },
  });

  // 6. INSERT notification to target — best-effort, must not undo the credential reset.
  try {
    await db.insert(notifications).values({
      userId: input.targetUserId,
      notificationType: "operator_credentials_reset",
      title: "Tu link de acceso fue renovado",
      body: "Un administrador generó un nuevo link de acceso para tu cuenta. Usalo para ingresar.",
      severity: "info",
      ctaLabel: "Acceder",
      ctaUrl: "/login",
    });
  } catch (e) {
    console.error(
      "notifications insert failed (resetInstitutionalCredentialsForAuthority did succeed)",
      e,
    );
  }

  return { ok: true, magicLink };
}
