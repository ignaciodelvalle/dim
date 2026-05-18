"use server";

// Direct revocation actions for the admin UI (Fase 4).
//
// Three action types:
//   - revokeVetRoleForAuthority    (REQ-1) — downgrades vet → owner
//   - revokeOrgVerificationForAuthority (REQ-2) — clears org.verified flag
//   - revokeGovtLocalityForAuthority   (REQ-3) — revokes a govt_assignments row
//
// Module structure mirrors admin-decisions.ts: pure inner writers (testable
// without Next.js runtime) + form-shaped wrappers (gated via requireAdminOrGovtOrRedirect).
//
// Each writer follows the transactional pattern from design §2d:
//   1. Pre-flight validation (motivo length, attachmentIds count)
//   2. loadActorAuthority — reject if not admin/govt
//   3. Load target, check state (no-op idempotency)
//   4. canRevoke — reject if out of scope
//   5. db.transaction:
//      a. Mutate target (anti-race WHERE + rowCount check)
//      b. INSERT audit_log RETURNING id
//      c. Claim attachments (UPDATE WHERE uploaded_by_user_id=actor)
//      d. INSERT notification to target
//   6. Return { ok: true } or { error: string }

import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  attachments,
  auditLog,
  db,
  govtAssignments,
  notifications,
  organizations,
  profiles,
} from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { canRevoke } from "@/lib/revocation-scope";
import type { RevocationTarget } from "@/lib/revocation-scope";
import { validateMotivoAndAttachments } from "@/lib/revocation-validation";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type RevocationResult = { error: string } | { ok: true; noOp?: boolean };

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

type AuthorityLoad =
  | {
      ok: true;
      profile: { id: string; role: "admin" | "govt" };
      jurisdictions: { province: string; locality: string }[];
    }
  | { ok: false; error: string };

async function loadActorAuthority(actorUserId: string): Promise<AuthorityLoad> {
  const [profile] = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, actorUserId))
    .limit(1);
  if (!profile || (profile.role !== "admin" && profile.role !== "govt")) {
    return { ok: false, error: "Solo govt o admin pueden revocar." };
  }
  let jurisdictions: { province: string; locality: string }[] = [];
  if (profile.role === "govt") {
    jurisdictions = await db
      .select({
        province: govtAssignments.jurisdictionProvince,
        locality: govtAssignments.jurisdictionLocality,
      })
      .from(govtAssignments)
      .where(and(eq(govtAssignments.userId, profile.id), isNull(govtAssignments.revokedAt)));
  }
  return { ok: true, profile: { id: profile.id, role: profile.role }, jurisdictions };
}

// Claims `attachmentIds` for `auditLogId` inside a transaction.
// The WHERE clause enforces that:
//   - audit_log_id is still NULL (not yet claimed by another revocation)
//   - uploaded_by_user_id === actor (defense against passing foreign attachment IDs)
// Throws if the number of rows updated != attachmentIds.length — triggers tx rollback.
//
// Exported for reuse in admin-institutional.ts (Fase 5). ADR-5: export rather
// than duplicate — identical contract, identical error semantics.
export async function claimAttachmentsForAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  auditLogId: string,
  attachmentIds: string[],
  actorUserId: string,
): Promise<void> {
  const updatedRows = await tx
    .update(attachments)
    .set({ auditLogId })
    .where(
      and(
        inArray(attachments.id, attachmentIds),
        isNull(attachments.auditLogId),
        eq(attachments.uploadedByUserId, actorUserId),
      ),
    )
    .returning({ id: attachments.id });
  if (updatedRows.length !== attachmentIds.length) {
    throw new Error(
      `ATTACHMENT_CLAIM_FAILED: expected ${attachmentIds.length} rows updated, got ${updatedRows.length}. Attachment IDs may not belong to actor or are already claimed.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Inner writer: revokeVetRoleForAuthority (REQ-1, REQ-4, REQ-7)
// ---------------------------------------------------------------------------

export async function revokeVetRoleForAuthority(
  actorUserId: string,
  input: {
    targetUserId: string;
    motivo: string;
    attachmentIds: string[];
  },
): Promise<RevocationResult> {
  // Pre-flight validation
  const validationError = validateMotivoAndAttachments(input.motivo, input.attachmentIds);
  if (validationError) return validationError;

  const auth = await loadActorAuthority(actorUserId);
  if (!auth.ok) return { error: auth.error };

  // Load target profile
  const [targetProfile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      matriculaVerified: profiles.matriculaVerified,
      matriculaJurisdiccion: profiles.matriculaJurisdiccion,
    })
    .from(profiles)
    .where(eq(profiles.id, input.targetUserId))
    .limit(1);

  if (!targetProfile) return { error: "Usuario destino no encontrado." };

  // Idempotency: already owner
  if (targetProfile.role !== "vet") {
    return { ok: true, noOp: true };
  }

  // Capability check
  const target: RevocationTarget = {
    type: "vet_role",
    matriculaJurisdiccion: targetProfile.matriculaJurisdiccion ?? "",
  };
  if (!canRevoke(auth.profile, target, auth.jurisdictions)) {
    return { error: "CAPABILITY_DENIED" };
  }

  try {
    await db.transaction(async (tx) => {
      // a. Mutate target with anti-race WHERE clause
      const updatedRows = await tx
        .update(profiles)
        .set({ role: "owner", matriculaVerified: false, updatedAt: new Date() })
        .where(and(eq(profiles.id, input.targetUserId), eq(profiles.role, "vet")))
        .returning({ id: profiles.id });
      if (updatedRows.length < 1) {
        // Lost the race — another concurrent revocation already ran
        throw new Error("RACE_CONDITION: target profile already updated");
      }

      // b. INSERT audit_log RETURNING id
      const [logRow] = await tx
        .insert(auditLog)
        .values({
          actorUserId,
          action: "revocation_vet_role",
          targetUserId: input.targetUserId,
          payload: {
            reason: input.motivo.trim(),
            evidence_attachment_ids: input.attachmentIds,
          },
        })
        .returning({ id: auditLog.id });

      // c. Claim attachments
      await claimAttachmentsForAudit(tx, logRow.id, input.attachmentIds, actorUserId);

      // d. Notification to target
      await tx.insert(notifications).values({
        userId: input.targetUserId,
        notificationType: "revocation_executed_vet",
        title: "Tu rol veterinario fue revocado",
        body: input.motivo.trim(),
        severity: "warning",
        ctaLabel: "Ver opciones",
        ctaUrl: "/cuenta/upgrade",
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("RACE_CONDITION")) {
      return { ok: true, noOp: true };
    }
    return {
      error: err instanceof Error ? err.message : "Error desconocido al revocar.",
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Inner writer: revokeOrgVerificationForAuthority (REQ-2, REQ-4)
// ---------------------------------------------------------------------------

export async function revokeOrgVerificationForAuthority(
  actorUserId: string,
  input: {
    organizationId: string;
    motivo: string;
    attachmentIds: string[];
  },
): Promise<RevocationResult> {
  const validationError = validateMotivoAndAttachments(input.motivo, input.attachmentIds);
  if (validationError) return validationError;

  const auth = await loadActorAuthority(actorUserId);
  if (!auth.ok) return { error: auth.error };

  // Load target org
  const [org] = await db
    .select({
      id: organizations.id,
      verified: organizations.verified,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
      createdByUserId: organizations.createdByUserId,
    })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);

  if (!org) return { error: "Organización no encontrada." };

  // Idempotency: already unverified
  if (!org.verified) {
    return { ok: true, noOp: true };
  }

  // Capability check
  const target: RevocationTarget = {
    type: "org_verification",
    province: org.jurisdictionProvince ?? "",
    locality: org.jurisdictionLocality ?? "",
  };
  if (!canRevoke(auth.profile, target, auth.jurisdictions)) {
    return { error: "CAPABILITY_DENIED" };
  }

  try {
    await db.transaction(async (tx) => {
      // a. Mutate target — do NOT clear verified_at / verified_by_user_id (historical record)
      const updatedRows = await tx
        .update(organizations)
        .set({ verified: false, updatedAt: new Date() })
        .where(and(eq(organizations.id, input.organizationId), eq(organizations.verified, true)))
        .returning({ id: organizations.id });
      if (updatedRows.length < 1) {
        throw new Error("RACE_CONDITION: org already updated");
      }

      // b. INSERT audit_log RETURNING id
      const [logRow] = await tx
        .insert(auditLog)
        .values({
          actorUserId,
          action: "revocation_org_verified",
          targetOrganizationId: input.organizationId,
          payload: {
            reason: input.motivo.trim(),
            evidence_attachment_ids: input.attachmentIds,
          },
        })
        .returning({ id: auditLog.id });

      // c. Claim attachments
      await claimAttachmentsForAudit(tx, logRow.id, input.attachmentIds, actorUserId);

      // d. Notification to org owner — skip if createdByUserId is null
      if (org.createdByUserId) {
        await tx.insert(notifications).values({
          userId: org.createdByUserId,
          notificationType: "revocation_executed_org",
          title: "La verificación de tu organización fue revocada",
          body: input.motivo.trim(),
          severity: "warning",
          ctaLabel: "Ir al panel",
          ctaUrl: "/org",
        });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("RACE_CONDITION")) {
      return { ok: true, noOp: true };
    }
    return {
      error: err instanceof Error ? err.message : "Error desconocido al revocar.",
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Inner writer: revokeGovtLocalityForAuthority (REQ-3, REQ-4)
// ---------------------------------------------------------------------------

export async function revokeGovtLocalityForAuthority(
  actorUserId: string,
  input: {
    govtAssignmentId: string;
    motivo: string;
    attachmentIds: string[];
  },
): Promise<RevocationResult> {
  const validationError = validateMotivoAndAttachments(input.motivo, input.attachmentIds);
  if (validationError) return validationError;

  const auth = await loadActorAuthority(actorUserId);
  if (!auth.ok) return { error: auth.error };

  // Load target assignment
  const [assignment] = await db
    .select({
      id: govtAssignments.id,
      userId: govtAssignments.userId,
      jurisdictionProvince: govtAssignments.jurisdictionProvince,
      jurisdictionLocality: govtAssignments.jurisdictionLocality,
      revokedAt: govtAssignments.revokedAt,
    })
    .from(govtAssignments)
    .where(eq(govtAssignments.id, input.govtAssignmentId))
    .limit(1);

  if (!assignment) return { error: "Asignación de localidad no encontrada." };

  // Self-revocation footgun — BEFORE canRevoke (spec §REQ-3, design §2d)
  if (assignment.userId === actorUserId) {
    return { error: "SELF_REVOCATION_DENIED" };
  }

  // Idempotency: already revoked
  if (assignment.revokedAt !== null) {
    return { ok: true, noOp: true };
  }

  // Capability check
  const target: RevocationTarget = {
    type: "govt_locality",
    province: assignment.jurisdictionProvince,
    locality: assignment.jurisdictionLocality,
  };
  if (!canRevoke(auth.profile, target, auth.jurisdictions)) {
    return { error: "CAPABILITY_DENIED" };
  }

  // Check if this is the last active locality for the target user (for notification body)
  const [activeCount] = await db
    .select({ count: count() })
    .from(govtAssignments)
    .where(and(eq(govtAssignments.userId, assignment.userId), isNull(govtAssignments.revokedAt)));
  const isLastLocality = (activeCount?.count ?? 0) <= 1;

  try {
    await db.transaction(async (tx) => {
      // a. Mutate target — anti-race WHERE revoked_at IS NULL
      const updatedRows = await tx
        .update(govtAssignments)
        .set({
          revokedAt: new Date(),
          revokedByUserId: actorUserId,
          revocationReason: input.motivo.trim(),
        })
        .where(
          and(eq(govtAssignments.id, input.govtAssignmentId), isNull(govtAssignments.revokedAt)),
        )
        .returning({ id: govtAssignments.id });
      if (updatedRows.length < 1) {
        throw new Error("RACE_CONDITION: assignment already revoked");
      }

      // b. INSERT audit_log RETURNING id
      const [logRow] = await tx
        .insert(auditLog)
        .values({
          actorUserId,
          action: "revocation_govt_assignment",
          targetUserId: assignment.userId,
          targetGovtAssignmentId: input.govtAssignmentId,
          payload: {
            reason: input.motivo.trim(),
            evidence_attachment_ids: input.attachmentIds,
            province: assignment.jurisdictionProvince,
            locality: assignment.jurisdictionLocality,
          },
        })
        .returning({ id: auditLog.id });

      // c. Claim attachments
      await claimAttachmentsForAudit(tx, logRow.id, input.attachmentIds, actorUserId);

      // d. Notification to the govt user whose locality was revoked
      const lastLocalityWarning = isLastLocality
        ? " Perdiste tu última localidad activa — ya no tenés jurisdicción asignada."
        : "";
      await tx.insert(notifications).values({
        userId: assignment.userId,
        notificationType: "govt_locality_revoked",
        title: `Localidad revocada: ${assignment.jurisdictionLocality}`,
        body: `${input.motivo.trim()}${lastLocalityWarning}`,
        severity: "warning",
        ctaLabel: "Ver cuenta",
        ctaUrl: "/cuenta",
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("RACE_CONDITION")) {
      return { ok: true, noOp: true };
    }
    return {
      error: err instanceof Error ? err.message : "Error desconocido al revocar.",
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Form-shaped wrappers — gate via requireAdminOrGovtOrRedirect (REQ-1, REQ-2, REQ-3)
// ---------------------------------------------------------------------------

export async function revokeVetRoleAction(input: {
  targetUserId: string;
  motivo: string;
  attachmentIds: string[];
}): Promise<RevocationResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await revokeVetRoleForAuthority(user.id, input);
  if ("ok" in result) {
    revalidatePath("/gob/usuarios");
    revalidatePath("/admin");
  }
  return result;
}

export async function revokeOrgVerificationAction(input: {
  organizationId: string;
  motivo: string;
  attachmentIds: string[];
}): Promise<RevocationResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await revokeOrgVerificationForAuthority(user.id, input);
  if ("ok" in result) {
    revalidatePath("/gob/organizaciones");
    revalidatePath("/admin");
  }
  return result;
}

export async function revokeGovtLocalityAction(input: {
  govtAssignmentId: string;
  motivo: string;
  attachmentIds: string[];
}): Promise<RevocationResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await revokeGovtLocalityForAuthority(user.id, input);
  if ("ok" in result) {
    revalidatePath("/admin");
    // Revalidate the gob/usuarios page — Next.js silently ignores
    // paths for non-existent pages, so this is safe.
    revalidatePath("/gob/usuarios");
  }
  return result;
}
