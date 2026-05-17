"use server";

// User self-service role transition actions (Slice 3d).
//
// Writer/wrapper pattern (matches profile.ts and approval-requests.ts):
//   - Inner writers exported for tests — no Next.js runtime dependency.
//   - Public wrappers gate via requireUserOrRedirect and call revalidatePath.
//
// Covers:
//   § 7.8  vetSelfResignForUser / vetSelfResignAction
//   § 7.5  govtSelfDeactivateForUser / govtSelfDeactivateAction

import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auditLog, db, govtAssignments, notifications, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type VetSelfResignResult = { error: string } | { ok: true; noOp?: boolean };

export type GovtSelfDeactivateResult =
  | { error: string; uncoveredLocalities?: { province: string; locality: string }[] }
  | { ok: true; noOp?: boolean };

// ---------------------------------------------------------------------------
// Inner writer: vetSelfResignForUser (§7.8)
//
// Steps:
//   1. Load profile
//   2. Idempotency: if already owner → noOp
//   3. Capability check: role must be 'vet' AND accountType must be 'personal'
//   4. UPDATE profiles: role='owner', matriculaVerified=false (anti-race WHERE)
//   5. INSERT audit_log action='self_resignation_vet'
//   6. INSERT notification to self (type='self_resignation_confirmed')
//
// Note: matriculaNumber and matriculaJurisdiccion are PRESERVED — they are
// biographical facts, not a live entitlement. Only the verified flag is cleared.
// ---------------------------------------------------------------------------

export async function vetSelfResignForUser(
  userId: string,
  input?: { reason?: string },
): Promise<VetSelfResignResult> {
  // 1. Load profile
  const [profile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!profile) return { error: "NOT_FOUND" };

  // 2. Idempotency: already owner → nothing to do
  if (profile.role === "owner") {
    return { ok: true, noOp: true };
  }

  // 3. Capability check
  if (profile.role !== "vet" || profile.accountType !== "personal") {
    return { error: "ROLE_MISMATCH: only a personal vet account can self-resign" };
  }

  // 4. UPDATE profiles with anti-race WHERE (only transitions from role='vet')
  const updated = await db
    .update(profiles)
    .set({ role: "owner", matriculaVerified: false, updatedAt: new Date() })
    .where(and(eq(profiles.id, userId), eq(profiles.role, "vet")))
    .returning({ id: profiles.id });

  if (updated.length < 1) {
    // Race: another request already changed the role
    return { ok: true, noOp: true };
  }

  // 5. Audit log
  await db.insert(auditLog).values({
    actorUserId: userId,
    action: "self_resignation_vet",
    targetUserId: userId,
    payload: { reason: input?.reason ?? null },
  });

  // 6. Notification to self
  await db.insert(notifications).values({
    userId,
    notificationType: "self_resignation_confirmed",
    title: "Renuncia registrada",
    body: "Renunciaste a tu rol de veterinario/a. Volviste a ser dueño/a. Tu matrícula quedó registrada pero sin verificar.",
    severity: "info",
    ctaLabel: "Ver mi cuenta",
    ctaUrl: "/cuenta",
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public wrapper: vetSelfResignAction
// ---------------------------------------------------------------------------

export async function vetSelfResignAction(input?: {
  reason?: string;
}): Promise<VetSelfResignResult> {
  const { user } = await requireUserOrRedirect();
  const result = await vetSelfResignForUser(user.id, input);
  if ("ok" in result) {
    revalidatePath("/cuenta");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inner writer: govtSelfDeactivateForUser (§7.5)
//
// Steps:
//   1. Load profile
//   2. Idempotency: if already deactivated → noOp
//   3. Capability check: role='govt', accountType='institutional', deactivatedAt IS NULL
//   4. Coverage check (inside tx with SELECT FOR UPDATE):
//      For each active locality assignment, count OTHER active govts covering it.
//      If any has count=0 → block with LOCALITY_WOULD_BE_UNCOVERED.
//   5. If coverage OK (same tx):
//      a. Revoke all active govt_assignments for caller
//      b. SET deactivated_at on profiles (anti-race WHERE)
//      c. INSERT audit_log action='govt_self_deactivated'
//      d. INSERT notification to each active admin
//      e. INSERT notification to each OTHER govt who now sole-covers a locality
//         (cascade notice — they didn't gain a new assignment, but their existing
//          one may now be the only coverage for a formerly-shared locality)
//
// Note: auth.users is NOT deleted. The deactivated_at IS NOT NULL check in
// requireAdminOrGovtOrRedirect already blocks further privileged access.
// Pending approval_requests for ex-localities fall back to admin queue via the
// NOT EXISTS clause in lib/approval-scope.ts (already in place since Fase 5).
// ---------------------------------------------------------------------------

export async function govtSelfDeactivateForUser(
  userId: string,
  input?: { reason?: string },
): Promise<GovtSelfDeactivateResult> {
  // 1. Load profile
  const [profile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!profile) return { error: "NOT_FOUND" };

  // 2. Idempotency: already deactivated → noOp
  if (profile.deactivatedAt !== null) {
    return { ok: true, noOp: true };
  }

  // 3. Capability check
  if (profile.role !== "govt" || profile.accountType !== "institutional") {
    return { error: "ROLE_MISMATCH: only an active institutional govt account can self-deactivate" };
  }

  // 4+5. Coverage check + deactivation inside a single transaction.
  // SELECT FOR UPDATE on profiles + govtAssignments rows prevents concurrent
  // self-deactivations from two govts in the same locality racing past coverage.
  try {
    await db.transaction(async (tx) => {
      // Lock caller's profile row to serialise concurrent self-deactivation attempts.
      await tx.execute(
        sql`SELECT id FROM profiles WHERE id = ${userId} FOR UPDATE`,
      );

      // Load caller's active assignments
      const myAssignments = await tx
        .select({
          id: govtAssignments.id,
          province: govtAssignments.jurisdictionProvince,
          locality: govtAssignments.jurisdictionLocality,
        })
        .from(govtAssignments)
        .where(and(eq(govtAssignments.userId, userId), isNull(govtAssignments.revokedAt)));

      // 4. Coverage check — for each locality, ensure at least one OTHER active govt covers it
      const uncovered: { province: string; locality: string }[] = [];

      for (const assignment of myAssignments) {
        // Count other active govts covering this same (province, locality).
        // "Active" means: their assignment is not revoked AND their profile is not deactivated.
        const [{ otherCount }] = await tx
          .select({ otherCount: count() })
          .from(govtAssignments)
          .innerJoin(profiles, eq(profiles.id, govtAssignments.userId))
          .where(
            and(
              ne(govtAssignments.userId, userId),
              eq(govtAssignments.jurisdictionProvince, assignment.province),
              eq(govtAssignments.jurisdictionLocality, assignment.locality),
              isNull(govtAssignments.revokedAt),
              isNull(profiles.deactivatedAt),
            ),
          );

        if (otherCount === 0) {
          uncovered.push({ province: assignment.province, locality: assignment.locality });
        }
      }

      if (uncovered.length > 0) {
        // Surface all uncovered localities to the caller so the UI can display them.
        throw Object.assign(new Error("LOCALITY_WOULD_BE_UNCOVERED"), { uncovered });
      }

      // 5a. Revoke all active assignments
      const revokedRows = await tx
        .update(govtAssignments)
        .set({
          revokedAt: new Date(),
          revokedByUserId: userId,
          revocationReason: "Self-deactivation",
        })
        .where(and(eq(govtAssignments.userId, userId), isNull(govtAssignments.revokedAt)))
        .returning({
          id: govtAssignments.id,
          province: govtAssignments.jurisdictionProvince,
          locality: govtAssignments.jurisdictionLocality,
        });

      const revokedCount = revokedRows.length;

      // 5b. SET deactivated_at (anti-race WHERE)
      const updatedRows = await tx
        .update(profiles)
        .set({ deactivatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(profiles.id, userId), isNull(profiles.deactivatedAt)))
        .returning({ id: profiles.id });

      if (updatedRows.length < 1) {
        throw new Error("RACE_CONDITION");
      }

      // 5c. Audit log
      await tx.insert(auditLog).values({
        actorUserId: userId,
        action: "govt_self_deactivated",
        targetUserId: userId,
        payload: {
          reason: input?.reason ?? null,
          assignments_revoked_count: revokedCount,
          revoked_localities: revokedRows.map((r) => ({
            province: r.province,
            locality: r.locality,
          })),
        },
      });

      // 5d. Notify each active admin
      const activeAdmins = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(
          and(
            eq(profiles.role, "admin"),
            eq(profiles.accountType, "institutional"),
            isNull(profiles.deactivatedAt),
          ),
        );

      if (activeAdmins.length > 0) {
        await tx.insert(notifications).values(
          activeAdmins.map((admin) => ({
            userId: admin.id,
            notificationType: "govt_self_deactivated_admin_notice",
            title: "Un operador govt se auto-desactivó",
            body: `El operador con ID ${userId} desactivó su propia cuenta.${input?.reason ? ` Motivo: ${input.reason}` : ""}`,
            severity: "warning" as const,
            ctaUrl: `/admin/govts/${userId}`,
            ctaLabel: "Ver perfil",
          })),
        );
      }

      // 5e. Notify other govts who now sole-cover one of the revoked localities.
      // Collect unique other-govt user IDs that have active assignments in the revoked localities.
      const revokedLocalities = revokedRows.map((r) => ({
        province: r.province,
        locality: r.locality,
      }));

      const cascadeGovtIds = new Set<string>();

      for (const loc of revokedLocalities) {
        const otherGovts = await tx
          .select({ userId: govtAssignments.userId })
          .from(govtAssignments)
          .innerJoin(profiles, eq(profiles.id, govtAssignments.userId))
          .where(
            and(
              ne(govtAssignments.userId, userId),
              eq(govtAssignments.jurisdictionProvince, loc.province),
              eq(govtAssignments.jurisdictionLocality, loc.locality),
              isNull(govtAssignments.revokedAt),
              isNull(profiles.deactivatedAt),
            ),
          );

        for (const g of otherGovts) {
          cascadeGovtIds.add(g.userId);
        }
      }

      if (cascadeGovtIds.size > 0) {
        await tx.insert(notifications).values(
          [...cascadeGovtIds].map((gId) => ({
            userId: gId,
            notificationType: "govt_self_deactivated_cascade_notice",
            title: "Cambio en tus localidades asignadas",
            body: "Un operador govt de tu área desactivó su cuenta. Tus asignaciones de localidad siguen activas y pueden tener mayor alcance.",
            severity: "info" as const,
            ctaUrl: "/gobierno",
            ctaLabel: "Ver mi panel",
          })),
        );
      }
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "LOCALITY_WOULD_BE_UNCOVERED") {
        const uncovered = (err as Error & { uncovered?: { province: string; locality: string }[] })
          .uncovered ?? [];
        return { error: "LOCALITY_WOULD_BE_UNCOVERED", uncoveredLocalities: uncovered };
      }
      if (err.message === "RACE_CONDITION") {
        return { ok: true, noOp: true };
      }
    }
    return {
      error: err instanceof Error ? err.message : "Error desconocido al desactivar cuenta.",
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public wrapper: govtSelfDeactivateAction
// ---------------------------------------------------------------------------

export async function govtSelfDeactivateAction(input?: {
  reason?: string;
}): Promise<GovtSelfDeactivateResult> {
  const { user } = await requireUserOrRedirect();
  const result = await govtSelfDeactivateForUser(user.id, input);
  if ("ok" in result && !result.noOp) {
    revalidatePath("/cuenta");
  }
  return result;
}
