"use server";

// Institutional account management actions for the admin UI (Fase 5).
//
// This module follows the writer/wrapper pattern from admin-revocations.ts:
//   - Inner writer functions (e.g. createInstitutionalAccountForAuthority) are
//     exported and testable without the Next.js runtime.
//   - Public wrapper functions (e.g. createInstitutionalAccountAction) gate via
//     requireAdminOrRedirect and call revalidatePath.
//
// PR-A scope: createInstitutionalAccountForAuthority + wrapper.
// PR-B scope: deactivateAdminForAuthority + deactivateGovtForAuthority + wrappers.
// PR-C scope will add resetInstitutionalCredentialsForAuthority + assignGovtLocalityForAuthority.

import crypto from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

import {
  claimAttachmentsForAudit,
  validateMotivoAndAttachments,
} from "@/app/actions/admin-revocations";
import { auditLog, db, govtAssignments, notifications, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { canCreateInstitutional, canDeactivateGovt } from "@/lib/institutional-scope";
import type { ActorProfile } from "@/lib/institutional-scope";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type CreateInstitutionalResult =
  | { error: string }
  | { ok: true; profileId: string; magicLink: string };

export type DeactivateResult = { error: string } | { ok: true; noOp?: boolean };

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const localitySchema = z.object({
  province: z.string().min(1, "Province is required"),
  locality: z.string().min(1, "Locality is required"),
});

const createInstitutionalSchema = z.object({
  role: z.enum(["govt", "admin"]),
  email: z.email("Invalid email address"),
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(100, "Display name must be at most 100 characters")
    .trim(),
  initialLocalities: z.array(localitySchema),
});

// ---------------------------------------------------------------------------
// Helper: load actor's profile for capability checks
// ---------------------------------------------------------------------------

async function loadActorProfile(actorUserId: string): Promise<ActorProfile | null> {
  const [row] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, actorUserId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    role: row.role as ActorProfile["role"],
    accountType: row.accountType as ActorProfile["accountType"],
    deactivatedAt: row.deactivatedAt,
  };
}

// ---------------------------------------------------------------------------
// Inner writer: createInstitutionalAccountForAuthority (PR-A)
//
// Creates a new institutional account (govt or admin) with:
//   1. Zod validation
//   2. Capability check (admin only)
//   3. Pre-flight duplicate email check via auth admin SDK
//   4. auth.admin.createUser (email_confirm: true, throwaway password)
//   5. DB transaction: profile + govt_assignments + audit_log + notification
//   6. Compensating auth.admin.deleteUser on tx failure
//   7. auth.admin.generateLink for magic link
// ---------------------------------------------------------------------------

export async function createInstitutionalAccountForAuthority(
  actorUserId: string,
  input: {
    role: "govt" | "admin";
    email: string;
    displayName: string;
    initialLocalities: { province: string; locality: string }[];
  },
): Promise<CreateInstitutionalResult> {
  // 1. Validate inputs
  const parsed = createInstitutionalSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: `VALIDATION_ERROR: ${firstError.message}` };
  }
  const { role, email, displayName, initialLocalities } = parsed.data;

  // 2. Load actor + capability check
  const actorProfile = await loadActorProfile(actorUserId);
  if (!actorProfile) return { error: "CAPABILITY_DENIED" };
  if (!canCreateInstitutional(actorProfile)) return { error: "CAPABILITY_DENIED" };

  const supabase = createAdminClient();

  // 3. Pre-flight duplicate email check
  const { data: existingUsers, error: listErr } = await supabase.auth.admin.listUsers({
    perPage: 200,
  });
  if (listErr) return { error: `AUTH_LIST_FAILED: ${listErr.message}` };

  const duplicateUser = existingUsers?.users.find((u) => u.email === email);
  if (duplicateUser) return { error: "DUPLICATE_EMAIL" };

  // 4. Create auth user with throwaway password (never surfaced or logged)
  const throwawayPassword = crypto.randomBytes(32).toString("hex");
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: throwawayPassword,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      // Pass role via metadata so the handle_new_user trigger sets the right role
      // (the trigger reads raw_user_meta_data.user_role). We also UPDATE the profile
      // inside the tx for correctness, but the trigger pre-populates the row first.
      user_role: role,
    },
  });

  if (authErr || !authData.user) {
    return { error: `AUTH_CREATE_FAILED: ${authErr?.message ?? "unknown error"}` };
  }

  const authUserId = authData.user.id;

  // 5. DB transaction: update profile + insert assignments + audit_log + notification
  // Note: handle_new_user trigger already created a profile row — we UPDATE it here
  // to set account_type='institutional' and the correct role.
  try {
    await db.transaction(async (tx) => {
      // a. Update the auto-created profile to institutional
      const updatedRows = await tx
        .update(profiles)
        .set({
          displayName,
          role,
          accountType: "institutional",
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, authUserId))
        .returning({ id: profiles.id });

      if (updatedRows.length < 1) {
        throw new Error("PROFILE_UPDATE_FAILED: profile row not found after auth.admin.createUser");
      }

      // b. If role='govt': insert govt_assignments for each initialLocality
      if (role === "govt" && initialLocalities.length > 0) {
        await tx.insert(govtAssignments).values(
          initialLocalities.map((l) => ({
            userId: authUserId,
            jurisdictionProvince: l.province,
            jurisdictionLocality: l.locality,
            grantedByUserId: actorUserId,
          })),
        );
      }

      // c. Insert audit_log
      await tx.insert(auditLog).values({
        actorUserId,
        action: role === "admin" ? "institutional_admin_created" : "institutional_govt_created",
        targetUserId: authUserId,
        payload: {
          role,
          display_name: displayName,
          email,
          initial_localities: initialLocalities,
          method: "auth_admin_sdk",
        },
      });

      // d. Insert welcome notification to the new operator
      await tx.insert(notifications).values({
        userId: authUserId,
        notificationType: "institutional_account_created",
        title: "Tu cuenta institucional fue creada",
        body: "Un administrador te creó una cuenta. Usá el link de acceso que te compartió para entrar.",
        severity: "info",
        ctaLabel: "Acceder",
        ctaUrl: "/login",
      });
    });
  } catch (txErr) {
    // Compensating delete: remove the auth user to avoid orphans
    try {
      await supabase.auth.admin.deleteUser(authUserId);
    } catch (cleanupErr) {
      // Best-effort orphan logging — do NOT swallow the original error
      try {
        await db.insert(auditLog).values({
          actorUserId,
          action: "institutional_create_orphan_auth_user",
          payload: {
            orphan_auth_user_id: authUserId,
            intended_email: email,
            tx_error: txErr instanceof Error ? txErr.message : String(txErr),
            cleanup_error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          },
        });
      } catch {
        // Swallow — we've done our best
      }
    }
    return {
      error: `DB_TX_FAILED: ${txErr instanceof Error ? txErr.message : String(txErr)}`,
    };
  }

  // 6. Generate magic link
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkErr || !linkData?.properties?.action_link) {
    // Account was created successfully but magic link generation failed.
    // Return a partial success so the admin knows to use "Reset credentials" instead.
    return {
      ok: true,
      profileId: authUserId,
      magicLink: "",
    };
  }

  return {
    ok: true,
    profileId: authUserId,
    magicLink: linkData.properties.action_link,
  };
}

// ---------------------------------------------------------------------------
// Public wrapper: createInstitutionalAccountAction
// ---------------------------------------------------------------------------
//
// Gated via requireAdminOrRedirect. Delegates to the inner writer.
// On success: revalidates the admin govts and admins list pages.

export async function createInstitutionalAccountAction(input: {
  role: "govt" | "admin";
  email: string;
  displayName: string;
  initialLocalities: { province: string; locality: string }[];
}): Promise<CreateInstitutionalResult> {
  const { user } = await requireAdminOrRedirect();
  const result = await createInstitutionalAccountForAuthority(user.id, input);
  if ("ok" in result) {
    revalidatePath("/admin/govts");
    revalidatePath("/admin/admins");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inner writer: deactivateAdminForAuthority (PR-B)
//
// Deactivates an admin account with:
//   1. Validation (motivo ≥30 chars, attachmentIds ≥1)
//   2. Self-deactivation check
//   3. Capability check (actor must be active admin)
//   4. DB transaction with SELECT FOR UPDATE on active admin set (last-admin guard)
//   5. SET deactivated_at, audit_log, claim attachments, notification
// ---------------------------------------------------------------------------

export async function deactivateAdminForAuthority(
  actorUserId: string,
  input: {
    targetAdminUserId: string;
    motivo: string;
    attachmentIds: string[];
  },
): Promise<DeactivateResult> {
  // 1. Validate motivo + attachments
  const validationError = validateMotivoAndAttachments(input.motivo, input.attachmentIds);
  if (validationError) return validationError;

  // 2. Self-deactivation check (before any DB read)
  if (actorUserId === input.targetAdminUserId) {
    return { error: "SELF_DENIED" };
  }

  // 3. Load actor profile + capability check
  const actorProfile = await loadActorProfile(actorUserId);
  if (!actorProfile) return { error: "CAPABILITY_DENIED" };
  if (!canCreateInstitutional(actorProfile)) return { error: "CAPABILITY_DENIED" };

  // 4. Transaction with SELECT FOR UPDATE on active admin set (last-admin guard + deactivation)
  try {
    await db.transaction(async (tx) => {
      // SELECT FOR UPDATE — locks ALL active admin rows to prevent concurrent last-admin races.
      // The lock is row-level; only competing writers to these rows will wait.
      // We use raw SQL here because drizzle ORM doesn't expose FOR UPDATE in SELECT directly.
      // With drizzle-orm/postgres-js, tx.execute returns the raw postgres-js result which
      // behaves as an array-like iterable of row objects.
      const lockResult = await tx.execute(
        sql`SELECT id FROM profiles WHERE account_type = 'institutional' AND role = 'admin' AND deactivated_at IS NULL FOR UPDATE`,
      );
      // postgres-js with drizzle returns the SQL result directly as an iterable array.
      // Cast to unknown first, then spread into a regular array for safe iteration.
      const adminRows: Array<{ id: string }> = [
        ...(lockResult as unknown as Iterable<{ id: string }>),
      ];
      const adminCount = adminRows.length;

      // Idempotency: if target is NOT in the active set, it's already deactivated
      const targetIsActive = adminRows.some((r) => r.id === input.targetAdminUserId);
      if (!targetIsActive) {
        throw new Error("NO_OP");
      }

      // Last-admin guard: count - 1 must be ≥ 1
      if (adminCount - 1 < 1) {
        throw new Error("LAST_ADMIN");
      }

      // a. SET deactivated_at with anti-race WHERE
      const updatedRows = await tx
        .update(profiles)
        .set({ deactivatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(profiles.id, input.targetAdminUserId), isNull(profiles.deactivatedAt)))
        .returning({ id: profiles.id });

      if (updatedRows.length < 1) {
        throw new Error("RACE_CONDITION");
      }

      // b. INSERT audit_log RETURNING id
      const [logRow] = await tx
        .insert(auditLog)
        .values({
          actorUserId,
          action: "admin_deactivated_by_admin",
          targetUserId: input.targetAdminUserId,
          payload: {
            reason: input.motivo.trim(),
            evidence_attachment_ids: input.attachmentIds,
            remaining_admins_count: adminCount - 1,
          },
        })
        .returning({ id: auditLog.id });

      // c. Claim attachments
      await claimAttachmentsForAudit(tx, logRow.id, input.attachmentIds, actorUserId);

      // d. Notification to deactivated admin
      await tx.insert(notifications).values({
        userId: input.targetAdminUserId,
        notificationType: "admin_deactivated",
        title: "Tu cuenta de administrador fue desactivada",
        body: input.motivo.trim(),
        severity: "warning",
        ctaLabel: "Ver notificaciones",
        ctaUrl: "/cuenta",
      });
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NO_OP") return { ok: true, noOp: true };
      if (err.message === "LAST_ADMIN") {
        return { error: "LAST_ADMIN: No podés desactivar al último admin del sistema." };
      }
      if (err.message === "RACE_CONDITION") return { ok: true, noOp: true };
    }
    return {
      error: err instanceof Error ? err.message : "Error desconocido al desactivar admin.",
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Inner writer: deactivateGovtForAuthority (PR-B)
//
// Deactivates a govt account:
//   1. Validation
//   2. Capability check (admin only)
//   3. Verify target is active institutional govt
//   4. DB transaction: revoke localities, deactivate, audit_log, claim attachments, notification
// ---------------------------------------------------------------------------

export async function deactivateGovtForAuthority(
  actorUserId: string,
  input: {
    targetGovtUserId: string;
    motivo: string;
    attachmentIds: string[];
  },
): Promise<DeactivateResult> {
  // 1. Validate motivo + attachments
  const validationError = validateMotivoAndAttachments(input.motivo, input.attachmentIds);
  if (validationError) return validationError;

  // 2. Load actor profile + capability check
  const actorProfile = await loadActorProfile(actorUserId);
  if (!actorProfile) return { error: "CAPABILITY_DENIED" };
  if (!canDeactivateGovt(actorProfile)) return { error: "CAPABILITY_DENIED" };

  // 3. Verify target is an active institutional govt
  const [targetProfile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, input.targetGovtUserId))
    .limit(1);

  if (!targetProfile) return { error: "NOT_INSTITUTIONAL_GOVT" };
  if (targetProfile.role !== "govt" || targetProfile.accountType !== "institutional") {
    return { error: "NOT_INSTITUTIONAL_GOVT" };
  }
  if (targetProfile.deactivatedAt !== null) {
    return { error: "TARGET_ALREADY_DEACTIVATED" };
  }

  // 4. Transaction: revoke localities, deactivate, audit, notify
  try {
    await db.transaction(async (tx) => {
      // a. Revoke all active govt_assignments for target
      const revokedAssignments = await tx
        .update(govtAssignments)
        .set({
          revokedAt: new Date(),
          revokedByUserId: actorUserId,
          revocationReason: input.motivo.trim(),
        })
        .where(
          and(
            eq(govtAssignments.userId, input.targetGovtUserId),
            isNull(govtAssignments.revokedAt),
          ),
        )
        .returning({ id: govtAssignments.id });

      const revokedCount = revokedAssignments.length;

      // b. SET deactivated_at with anti-race WHERE
      const updatedRows = await tx
        .update(profiles)
        .set({ deactivatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(profiles.id, input.targetGovtUserId), isNull(profiles.deactivatedAt)))
        .returning({ id: profiles.id });

      if (updatedRows.length < 1) {
        throw new Error("RACE_CONDITION");
      }

      // c. INSERT audit_log RETURNING id
      const [logRow] = await tx
        .insert(auditLog)
        .values({
          actorUserId,
          action: "govt_deactivated_by_admin",
          targetUserId: input.targetGovtUserId,
          payload: {
            reason: input.motivo.trim(),
            evidence_attachment_ids: input.attachmentIds,
            revoked_assignments_count: revokedCount,
          },
        })
        .returning({ id: auditLog.id });

      // d. Claim attachments
      await claimAttachmentsForAudit(tx, logRow.id, input.attachmentIds, actorUserId);

      // e. Notification to deactivated govt operator
      await tx.insert(notifications).values({
        userId: input.targetGovtUserId,
        notificationType: "govt_deactivated",
        title: "Tu cuenta de operador fue desactivada",
        body: input.motivo.trim(),
        severity: "warning",
        ctaLabel: "Ver notificaciones",
        ctaUrl: "/cuenta",
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "RACE_CONDITION") {
      return { ok: true, noOp: true };
    }
    return {
      error: err instanceof Error ? err.message : "Error desconocido al desactivar govt.",
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public wrapper: deactivateAdminAction
// ---------------------------------------------------------------------------

export async function deactivateAdminAction(input: {
  targetAdminUserId: string;
  motivo: string;
  attachmentIds: string[];
}): Promise<DeactivateResult> {
  const { user } = await requireAdminOrRedirect();
  const result = await deactivateAdminForAuthority(user.id, input);
  if ("ok" in result && !result.noOp) {
    revalidatePath("/admin/admins");
    revalidatePath(`/admin/admins/${input.targetAdminUserId}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public wrapper: deactivateGovtAction
// ---------------------------------------------------------------------------

export async function deactivateGovtAction(input: {
  targetGovtUserId: string;
  motivo: string;
  attachmentIds: string[];
}): Promise<DeactivateResult> {
  const { user } = await requireAdminOrRedirect();
  const result = await deactivateGovtForAuthority(user.id, input);
  if ("ok" in result && !result.noOp) {
    revalidatePath("/admin/govts");
    revalidatePath(`/admin/govts/${input.targetGovtUserId}`);
  }
  return result;
}
