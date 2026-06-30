// verifyOrgForAuthority use-case.
//
// Sets organizations.verified=true, verifiedAt=now(), verifiedByUserId=actor.
// Idempotent: if already verified returns { ok: true, noOp: true }.

import { and, eq } from "drizzle-orm";

import { auditLog, db, notifications, organizations, profiles } from "@/db";

import { isActiveInstitutionalAdmin, loadOrgAdminUserIds } from "./helpers";
import type { VerifyOrgResult } from "./types";

export async function verifyOrgForAuthority(
  actorUserId: string,
  input: { organizationId: string },
): Promise<VerifyOrgResult> {
  // Load actor — must be active institutional admin (defense-in-depth: mirrors
  // the full requireAdminOrRedirect gate including accountType check).
  const [actor] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, actorUserId))
    .limit(1);

  if (!actor || !isActiveInstitutionalAdmin(actor)) {
    return { error: "CAPABILITY_DENIED" };
  }

  // Load target org (display name only — idempotency check moves inside tx).
  const [org] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
    })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);

  if (!org) return { error: "Organización no encontrada." };

  type PendingNotification = typeof notifications.$inferInsert;
  let pendingNotifications: PendingNotification[] = [];
  let noOp = false;

  try {
    await db.transaction(async (tx) => {
      // a. Mutate — idempotency decided inside tx by affected-row count
      //    (WHERE verified=false means 0 rows = already verified).
      const updatedRows = await tx
        .update(organizations)
        .set({
          verified: true,
          verifiedAt: new Date(),
          verifiedByUserId: actorUserId,
          updatedAt: new Date(),
        })
        .where(and(eq(organizations.id, input.organizationId), eq(organizations.verified, false)))
        .returning({ id: organizations.id });

      if (updatedRows.length < 1) {
        // Already verified (concurrent or pre-existing) — noOp, no audit.
        noOp = true;
        return;
      }

      // b. INSERT audit_log RETURNING id (not used for attachment claim, but kept for consistency)
      await tx.insert(auditLog).values({
        actorUserId,
        action: "org_verified",
        targetOrganizationId: input.organizationId,
        payload: {
          org_id: input.organizationId,
          org_display_name: org.displayName,
        },
      });

      // c. Collect org admin user IDs for notification fanout
      const adminUserIds = await loadOrgAdminUserIds(tx, input.organizationId);

      pendingNotifications = adminUserIds.map((userId) => ({
        userId,
        notificationType: "org_verification_granted",
        title: "Tu organización fue verificada",
        body: `${org.displayName} fue verificada por un administrador. Ya podés operar con credenciales verificadas.`,
        severity: "info" as const,
        ctaLabel: "Ir al panel",
        ctaUrl: "/org",
      }));
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error desconocido al verificar.",
    };
  }

  if (noOp) return { ok: true, noOp: true };

  // Notifications are best-effort — must not undo the verification
  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (verifyOrgForAuthority did succeed)", e);
    }
  }

  return { ok: true };
}
