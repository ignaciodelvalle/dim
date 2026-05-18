"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  type ApprovalRequest,
  approvalRequests,
  auditLog,
  db,
  govtAssignments,
  notifications,
  organizations,
  profiles,
} from "@/db";
import { canDecideRequest } from "@/lib/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

export type DecisionResult = { error: string } | { ok: true };

// ---------------------------------------------------------------------------
// Pure inner writers — testable.
// ---------------------------------------------------------------------------

export async function approveRequestForAuthority(
  actorUserId: string,
  publicToken: string,
  notes: string | null,
): Promise<DecisionResult> {
  const [request] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.publicToken, publicToken))
    .limit(1);
  if (!request) return { error: "Solicitud no encontrada." };
  if (request.status !== "pending") {
    return { error: `La solicitud ya está en estado "${request.status}".` };
  }

  const auth = await loadActorAuthority(actorUserId);
  if (!auth.ok) return { error: auth.error };
  if (!canDecideRequest(auth.profile, request, auth.jurisdictions)) {
    return { error: "No tenés permiso para decidir esta solicitud (fuera de tu jurisdicción)." };
  }

  try {
    await db.transaction(async (tx) => {
      const mutationSummary = await applyApprovalMutation(tx, request, actorUserId);

      await tx
        .update(approvalRequests)
        .set({
          status: "approved",
          decidedAt: new Date(),
          decidedByUserId: actorUserId,
          decisionNotes: notes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(approvalRequests.id, request.id));

      await tx.insert(auditLog).values({
        actorUserId,
        action: "request_approved",
        approvalRequestId: request.id,
        targetUserId: request.targetUserId,
        targetOrganizationId: request.targetOrganizationId,
        payload: { mutations_applied: mutationSummary, notes: notes ?? null },
      });

      await tx.insert(notifications).values({
        userId: request.applicantUserId,
        notificationType: "approval_request_approved",
        title: titleForApproval(request.type),
        body: bodyForApproval(request.type, notes),
        severity: "success",
        ctaLabel: "Ver detalle",
        ctaUrl: ctaForApplicant(request),
      });
    });
  } catch (err) {
    return {
      error: `No se pudo aprobar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true };
}

export async function rejectRequestForAuthority(
  actorUserId: string,
  publicToken: string,
  reason: string,
): Promise<DecisionResult> {
  const trimmedReason = reason.trim();
  if (!trimmedReason || trimmedReason.length < 5 || trimmedReason.length > 1000) {
    return { error: "La razón del rechazo debe tener entre 5 y 1000 caracteres." };
  }

  const [request] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.publicToken, publicToken))
    .limit(1);
  if (!request) return { error: "Solicitud no encontrada." };
  if (request.status !== "pending") {
    return { error: `La solicitud ya está en estado "${request.status}".` };
  }

  const auth = await loadActorAuthority(actorUserId);
  if (!auth.ok) return { error: auth.error };
  if (!canDecideRequest(auth.profile, request, auth.jurisdictions)) {
    return { error: "No tenés permiso para decidir esta solicitud (fuera de tu jurisdicción)." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(approvalRequests)
        .set({
          status: "rejected",
          decidedAt: new Date(),
          decidedByUserId: actorUserId,
          decisionNotes: trimmedReason,
          updatedAt: new Date(),
        })
        .where(eq(approvalRequests.id, request.id));

      await tx.insert(auditLog).values({
        actorUserId,
        action: "request_rejected",
        approvalRequestId: request.id,
        targetUserId: request.targetUserId,
        targetOrganizationId: request.targetOrganizationId,
        payload: { reason: trimmedReason },
      });

      await tx.insert(notifications).values({
        userId: request.applicantUserId,
        notificationType: "approval_request_rejected",
        title: titleForRejection(request.type),
        body: `Tu solicitud fue rechazada: ${trimmedReason}`,
        severity: "warning",
        ctaLabel: "Ver detalle",
        ctaUrl: ctaForApplicant(request),
      });
    });
  } catch (err) {
    return {
      error: `No se pudo rechazar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true };
}

// Records that the actor opened the review page for this request. Fires
// once per render (acceptable noise for an admin tool); the audit_log row
// captures the page-view via spec §7.4.
export async function logRequestViewedForAuthority(
  actorUserId: string,
  publicToken: string,
): Promise<void> {
  const [request] = await db
    .select({
      id: approvalRequests.id,
      targetUserId: approvalRequests.targetUserId,
      targetOrganizationId: approvalRequests.targetOrganizationId,
    })
    .from(approvalRequests)
    .where(eq(approvalRequests.publicToken, publicToken))
    .limit(1);
  if (!request) return;
  await db.insert(auditLog).values({
    actorUserId,
    action: "request_viewed",
    approvalRequestId: request.id,
    targetUserId: request.targetUserId,
    targetOrganizationId: request.targetOrganizationId,
    payload: {},
  });
}

// ---------------------------------------------------------------------------
// Helpers
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
    return { ok: false, error: "Solo govt o admin pueden decidir solicitudes." };
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

// Polymorphic mutation. Returns a summary object for the audit_log payload.
// Each branch is the spec §7.4 "Aplicar mutación al target" step for its type.
async function applyApprovalMutation(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  request: ApprovalRequest,
  actorUserId: string,
): Promise<Record<string, unknown>> {
  switch (request.type) {
    case "role_upgrade_vet": {
      if (!request.targetUserId) throw new Error("role_upgrade_vet requires target_user_id.");
      await tx
        .update(profiles)
        .set({
          role: "vet",
          matriculaVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, request.targetUserId));
      return { kind: "role_upgrade_vet", target_user_id: request.targetUserId };
    }

    case "organization_verification": {
      if (!request.targetOrganizationId) {
        throw new Error("organization_verification requires target_organization_id.");
      }
      await tx
        .update(organizations)
        .set({
          verified: true,
          verifiedAt: new Date(),
          verifiedByUserId: actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, request.targetOrganizationId));
      return {
        kind: "organization_verification",
        target_organization_id: request.targetOrganizationId,
      };
    }
  }
}

function titleForApproval(type: ApprovalRequest["type"]): string {
  switch (type) {
    case "role_upgrade_vet":
      return "Matrícula aprobada";
    case "organization_verification":
      return "Tu organización fue verificada";
  }
}

function bodyForApproval(type: ApprovalRequest["type"], notes: string | null): string {
  const trail = notes ? ` Notas: ${notes}` : "";
  switch (type) {
    case "role_upgrade_vet":
      return `Verificamos tu matrícula. Ya figurás como veterinario/a en MiMAR.${trail}`;
    case "organization_verification":
      return `Tu organización ahora figura como verificada. Los eventos que registres aparecen con el sello de verificación.${trail}`;
  }
}

function titleForRejection(type: ApprovalRequest["type"]): string {
  switch (type) {
    case "role_upgrade_vet":
      return "Matrícula rechazada";
    case "organization_verification":
      return "Verificación de organización rechazada";
  }
}

function ctaForApplicant(request: ApprovalRequest): string {
  if (request.targetOrganizationId) return "/org";
  return "/cuenta/upgrade";
}

// ---------------------------------------------------------------------------
// Form-shaped wrappers — gate via requireAdminOrGovtOrRedirect.
// ---------------------------------------------------------------------------

export async function approveRequestAction(
  publicToken: string,
  notes: string | null,
): Promise<DecisionResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await approveRequestForAuthority(user.id, publicToken, notes);
  if ("ok" in result) {
    revalidatePath("/gob/cola");
    revalidatePath(`/gob/cola/${publicToken}`);
    revalidatePath("/admin/cola");
    revalidatePath(`/admin/cola/${publicToken}`);
  }
  return result;
}

export async function rejectRequestAction(
  publicToken: string,
  reason: string,
): Promise<DecisionResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await rejectRequestForAuthority(user.id, publicToken, reason);
  if ("ok" in result) {
    revalidatePath("/gob/cola");
    revalidatePath(`/gob/cola/${publicToken}`);
    revalidatePath("/admin/cola");
    revalidatePath(`/admin/cola/${publicToken}`);
  }
  return result;
}
