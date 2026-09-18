// Use-case: resetInstitutionalCredentialsForAuthority
//
// Resets an active institutional account's credentials:
//   1. Capability check (admin only)
//   2. Load + validate target (institutional, not deactivated)
//   3. Fetch target email from auth.users via admin SDK
//   4. Re-arm the first-access flag AND replace the password with a random one
//   5. Revoke EVERY live session of the target (./revoke-target-sessions.ts)
//   6. auth.admin.generateLink (type: magiclink) — only after 4 and 5 succeeded
//   7. INSERT audit_log action='operator_credentials_reset' — method and
//      time, NEVER the link
//   8. INSERT notification to target (single insert — best-effort, try/catch)
//
// ARCH-P: the notification insert is wrapped in try/catch so a failure
// does not propagate to the caller (single-insert hardening pattern).

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { auditLog, db, notifications, profiles } from "@/db";
import { canResetCredentials } from "@/lib/domain/institutional-scope";
import { MOTIVO_MIN } from "@/lib/domain/revocation-validation";
import { resolveSiteUrl } from "@/lib/infra/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FIRST_ACCESS_PATH,
  pendingPasswordSetupMetadata,
} from "@/src/modules/auth/domain/first-access";

import { loadActorProfile } from "./helpers";
import { revokeAllSessionsOf } from "./revoke-target-sessions";
import type { ResetCredentialsResult } from "./types";

export async function resetInstitutionalCredentialsForAuthority(
  actorUserId: string,
  input: { targetUserId: string; reason: string },
): Promise<ResetCredentialsResult> {
  // 0. Validate reason (mirror the deactivation MOTIVO_MIN — resetting credentials
  // ends every live session of the operator and voids their password, so it
  // carries the same friction as a deactivation).
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

  // 4. Re-arm the first-access flag: "credenciales restablecidas" means the
  // operator chooses a new password before anything else, exactly like a new
  // account. In the SAME call the old password is replaced by a random one
  // nobody holds. A reset is what an admin does when the account may be
  // compromised; without this, whoever holds the old password signs straight
  // back in after step 5, and — the flag being armed — is walked to
  // /primer-acceso to choose the new password themselves.
  const { error: flagErr } = await supabase.auth.admin.updateUserById(input.targetUserId, {
    app_metadata: pendingPasswordSetupMetadata(),
    password: randomBytes(32).toString("base64url"),
  });
  if (flagErr) return { error: `AUTH_UPDATE_FAILED: ${flagErr.message}` };

  // 5. End every live session BEFORE a new link exists. A session that
  // survived a reset would be one the flag now pins to /primer-acceso, where
  // it could set the password the reset was meant to take away from it. Fails
  // closed: no link is issued on top of a session we could not end.
  //
  // Measured on local GoTrue (2026-09-18): the password update in step 4
  // ALREADY ends every session of the user. This call is kept anyway, on
  // purpose: that is a side effect of a password write that nothing
  // documents, and a reset must not depend on it staying true in the hosted
  // GoTrue version. This is the explicit revocation; step 4 is the bonus.
  const revoked = await revokeAllSessionsOf(supabase, targetEmail);
  if ("error" in revoked) return { error: revoked.error };

  // 6. Generate the magic link. It lands on FIRST_ACCESS_PATH (pilot T1-P3),
  // the one page that turns the link into a session. Generated after step 5,
  // so it also overwrites the one-time token that step spent.
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
    options: { redirectTo: `${resolveSiteUrl()}${FIRST_ACCESS_PATH}` },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    return { error: `LINK_GENERATION_FAILED: ${linkErr?.message ?? "no action_link"}` };
  }

  const magicLink = linkData.properties.action_link;

  // 7. INSERT audit_log (single insert — no transaction needed). The method
  // and the moment, NEVER the link: it is a live credential for the account,
  // and audit_log is read by every admin (and kept for years). Rows written
  // before this change still carry one; lib/ui/audit-entry-view.ts keeps it
  // off every screen.
  await db.insert(auditLog).values({
    actorUserId,
    action: "operator_credentials_reset",
    targetUserId: input.targetUserId,
    payload: {
      method: "magic_link",
      link_issued_at: new Date().toISOString(),
      sessions_revoked: true,
      reason: reasonTrimmed,
    },
  });

  // 8. INSERT notification to target — best-effort, must not undo the credential reset.
  try {
    await db.insert(notifications).values({
      userId: input.targetUserId,
      notificationType: "operator_credentials_reset",
      title: "Tu link de acceso fue renovado",
      body: "Un administrador generó un nuevo link de acceso para tu cuenta. Usalo para ingresar.",
      severity: "info",
      ctaLabel: "Acceder",
      ctaUrl: "/iniciar-sesion",
    });
  } catch (e) {
    console.error(
      "notifications insert failed (resetInstitutionalCredentialsForAuthority did succeed)",
      e,
    );
  }

  return { ok: true, magicLink };
}
