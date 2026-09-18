// Use-case: resetMfaFactorsForAuthority — admin-assisted second-factor recovery
// (T2-S6).
//
// WHY THIS EXISTS. Institutional accounts must pass TOTP before any portal
// (src/modules/auth/domain/mfa-policy.ts). Supabase Auth has NO recovery codes,
// so an operator who loses the phone that holds the factor has no self-service
// way back in. This is the way back: an admin removes EVERY factor of the
// account, and the operator's next request lands on /mfa/configurar to enrol a
// new one — after signing in with their password, which this does not touch.
//
// It is how the control is disarmed for one account, so it carries the same
// friction as a credential reset: admin only, a motivo, never on oneself (an
// admin whose own factor is gone asks another admin — otherwise a stolen admin
// password plus this button would be a way past the second factor), and an
// audit row naming the removed factor ids. Never a secret.
//
// ORDER. GoTrue first, then the audit row with what actually happened. The two
// cannot share a transaction (one is an HTTP call). If a deletion fails halfway,
// the factors that WERE removed are still audited and the admin is told.

import { eq } from "drizzle-orm";

import { db, profiles } from "@/db";
import { canResetCredentials } from "@/lib/domain/institutional-scope";
import { MOTIVO_MIN } from "@/lib/domain/revocation-validation";
import { writeAuditLog } from "@/lib/infra/audit-log";
import { createAdminClient } from "@/lib/supabase/admin";

import { loadActorProfile } from "./helpers";

export type ResetMfaFactorsResult = { error: string } | { ok: true; removed: number };

export async function resetMfaFactorsForAuthority(
  actorUserId: string,
  input: { targetUserId: string; reason: string },
): Promise<ResetMfaFactorsResult> {
  const reason = (input.reason ?? "").trim();
  if (reason.length < MOTIVO_MIN) {
    return { error: `El motivo requiere al menos ${MOTIVO_MIN} caracteres.` };
  }

  const actor = await loadActorProfile(actorUserId);
  if (!actor || !canResetCredentials(actor)) return { error: "CAPABILITY_DENIED" };
  if (input.targetUserId === actorUserId) {
    return {
      error:
        "No podés restablecer tu propio segundo factor. Pedíselo a otra persona con rol de administración.",
    };
  }

  const [target] = await db
    .select({ id: profiles.id, accountType: profiles.accountType })
    .from(profiles)
    .where(eq(profiles.id, input.targetUserId))
    .limit(1);
  if (!target) return { error: "NOT_FOUND" };
  if (target.accountType !== "institutional") return { error: "NOT_INSTITUTIONAL" };

  const admin = createAdminClient();
  const { data: listed, error: listError } = await admin.auth.admin.mfa.listFactors({
    userId: input.targetUserId,
  });
  if (listError || !listed) {
    return { error: "No pudimos leer los factores de la cuenta. Probá de nuevo en unos minutos." };
  }

  const removedIds: string[] = [];
  let failed = false;
  for (const factor of listed.factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({
      userId: input.targetUserId,
      id: factor.id,
    });
    if (error) {
      failed = true;
      break;
    }
    removedIds.push(factor.id);
  }

  // Nothing to remove and nothing removed: no fact happened, so no row.
  if (removedIds.length > 0) {
    await writeAuditLog(db, {
      action: "mfa_factors_reset_by_admin",
      actorUserId,
      targetUserId: input.targetUserId,
      payload: { reason, factor_ids: removedIds, complete: !failed },
    });
  }

  if (failed) {
    return {
      error:
        "No pudimos quitar todos los factores de la cuenta. Lo que se quitó quedó registrado; probá de nuevo.",
    };
  }
  return { ok: true, removed: removedIds.length };
}
