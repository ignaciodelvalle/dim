"use server";

// Admin action: directly verify (or unverify) an organization.
//
// This fills the P0 gap where org.verified could only be set by:
//   (a) a DB edit in Supabase Studio (prod — not scalable), or
//   (b) the solo-vet autoVerifiedViaMatricula path (D1 edge case).
//
// Design follows admin-revocations.ts / admin-institutional.ts conventions:
//   - Inner writer (*ForAuthority) — pure, testable without Next.js runtime.
//   - Public wrapper (*Action) — gated by requireAdminOrRedirect, calls revalidatePath.
//   - db.transaction: mutate → audit_log INSERT → notification (best-effort post-tx).
//
// Audit actions added to AUDIT_LOG_ACTIONS catalog (schema.ts):
//   "org_verified"   — admin directly verifies a pending org
//   "org_unverified" — admin directly un-verifies without the revocation evidence flow
//                      (use revokeOrgVerificationAction for the full evidence-backed path)
//
// The unverify path here is intentionally lightweight (no evidence upload required)
// to handle fast corrections. For formal accountability revocations with evidence,
// use revokeOrgVerificationAction from admin-revocations.ts instead.

import { and, eq, isNull } from "drizzle-orm";

// accountType check mirrors requireAdminOrRedirect (defense-in-depth: the
// role→accountType DB CHECK was dropped, so we enforce it here too).
function isActiveInstitutionalAdmin(actor: {
  role: string | null;
  accountType: string | null;
  deactivatedAt: Date | null;
}): boolean {
  return (
    actor.role === "admin" && actor.accountType === "institutional" && actor.deactivatedAt === null
  );
}
import { revalidatePath } from "next/cache";

import {
  auditLog,
  db,
  notifications,
  organizationMemberships,
  organizations,
  profiles,
} from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type VerifyOrgResult = { error: string } | { ok: true; noOp?: boolean };

// ---------------------------------------------------------------------------
// Helper: load the org admins' user IDs for notification fanout
// ---------------------------------------------------------------------------

async function loadOrgAdminUserIds(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
): Promise<string[]> {
  const members = await tx
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.role, "admin"),
        isNull(organizationMemberships.leftAt),
      ),
    );
  return members.map((m) => m.userId);
}

// ---------------------------------------------------------------------------
// Inner writer: verifyOrgForAuthority
//
// Sets organizations.verified=true, verifiedAt=now(), verifiedByUserId=actor.
// Idempotent: if already verified returns { ok: true, noOp: true }.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Inner writer: unverifyOrgForAuthority
//
// Lightweight un-verify without evidence upload. For evidence-backed revocations
// with formal accountability, use revokeOrgVerificationForAuthority instead.
// Sets organizations.verified=false; preserves verifiedAt/verifiedByUserId as
// historical record (mirrors revokeOrgVerificationForAuthority behaviour).
// ---------------------------------------------------------------------------

export async function unverifyOrgForAuthority(
  actorUserId: string,
  input: { organizationId: string; reason?: string },
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
      //    (WHERE verified=true means 0 rows = already unverified, no audit).
      // Preserve verifiedAt / verifiedByUserId as historical record.
      const updatedRows = await tx
        .update(organizations)
        .set({
          verified: false,
          updatedAt: new Date(),
        })
        .where(and(eq(organizations.id, input.organizationId), eq(organizations.verified, true)))
        .returning({ id: organizations.id });

      if (updatedRows.length < 1) {
        // Already unverified (concurrent or pre-existing) — noOp, no audit.
        noOp = true;
        return;
      }

      // b. INSERT audit_log
      await tx.insert(auditLog).values({
        actorUserId,
        action: "org_unverified",
        targetOrganizationId: input.organizationId,
        payload: {
          org_id: input.organizationId,
          org_display_name: org.displayName,
          ...(input.reason ? { reason: input.reason.trim() } : {}),
        },
      });

      // c. Notify org admins
      const adminUserIds = await loadOrgAdminUserIds(tx, input.organizationId);

      const body = input.reason
        ? `${org.displayName} fue des-verificada. Motivo: ${input.reason.trim()}`
        : `${org.displayName} fue des-verificada por un administrador.`;

      pendingNotifications = adminUserIds.map((userId) => ({
        userId,
        notificationType: "org_verification_revoked",
        title: "La verificación de tu organización fue removida",
        body,
        severity: "warning" as const,
        ctaLabel: "Ir al panel",
        ctaUrl: "/org",
      }));
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error desconocido al des-verificar.",
    };
  }

  if (noOp) return { ok: true, noOp: true };

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (unverifyOrgForAuthority did succeed)", e);
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public wrappers — gated by requireAdminOrRedirect
// ---------------------------------------------------------------------------

export async function verifyOrgAction(input: {
  organizationId: string;
}): Promise<VerifyOrgResult> {
  const { user } = await requireAdminOrRedirect();
  const result = await verifyOrgForAuthority(user.id, input);
  if ("ok" in result) {
    // The org list lives under /gob now (AC3 — the /admin duplicate was removed).
    revalidatePath("/gob/organizaciones");
    revalidatePath("/admin");
  }
  return result;
}

export async function unverifyOrgAction(input: {
  organizationId: string;
  reason?: string;
}): Promise<VerifyOrgResult> {
  const { user } = await requireAdminOrRedirect();
  const result = await unverifyOrgForAuthority(user.id, input);
  if ("ok" in result) {
    // The org list lives under /gob now (AC3 — the /admin duplicate was removed).
    revalidatePath("/gob/organizaciones");
    revalidatePath("/admin");
  }
  return result;
}
