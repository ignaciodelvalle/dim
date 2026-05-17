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
  ownerships,
  profiles,
} from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { canDecideRequest } from "@/lib/approval-scope";

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
    .select({ id: approvalRequests.id, targetUserId: approvalRequests.targetUserId, targetOrganizationId: approvalRequests.targetOrganizationId })
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

    case "role_upgrade_govt": {
      if (!request.targetUserId) throw new Error("role_upgrade_govt requires target_user_id.");
      const payload = request.payload as {
        requested_localities?: { province: string; locality: string }[];
      };
      const localities = payload.requested_localities ?? [];
      if (localities.length === 0) {
        throw new Error("Payload requested_localities is empty.");
      }
      await tx
        .update(profiles)
        .set({ role: "govt", updatedAt: new Date() })
        .where(eq(profiles.id, request.targetUserId));
      for (const loc of localities) {
        await tx.insert(govtAssignments).values({
          userId: request.targetUserId,
          jurisdictionProvince: loc.province,
          jurisdictionLocality: loc.locality,
          grantedByUserId: actorUserId,
        });
      }
      return {
        kind: "role_upgrade_govt",
        target_user_id: request.targetUserId,
        assignments_granted: localities.length,
      };
    }

    case "role_upgrade_admin": {
      if (!request.targetUserId) throw new Error("role_upgrade_admin requires target_user_id.");
      // Spec §7.2 — re-check the anti-pets invariant at decision time.
      // Between submission and approval the target may have adopted pets.
      const owned = await tx
        .select({ id: ownerships.id })
        .from(ownerships)
        .where(
          and(eq(ownerships.ownerUserId, request.targetUserId), isNull(ownerships.endedAt)),
        );
      if (owned.length > 0) {
        throw new Error(
          `El usuario destino tiene ${owned.length} mascota(s) registrada(s). El rol admin no puede tener mascotas — transferí o dale de baja antes de aprobar.`,
        );
      }
      await tx
        .update(profiles)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(profiles.id, request.targetUserId));
      return { kind: "role_upgrade_admin", target_user_id: request.targetUserId };
    }

    case "govt_assignment_grant": {
      if (!request.targetUserId) {
        throw new Error("govt_assignment_grant requires target_user_id.");
      }
      const payload = request.payload as {
        requested_province?: string;
        requested_locality?: string;
      };
      if (!payload.requested_province || !payload.requested_locality) {
        throw new Error("Payload missing requested_province or requested_locality.");
      }
      await tx.insert(govtAssignments).values({
        userId: request.targetUserId,
        jurisdictionProvince: payload.requested_province,
        jurisdictionLocality: payload.requested_locality,
        grantedByUserId: actorUserId,
      });
      return {
        kind: "govt_assignment_grant",
        target_user_id: request.targetUserId,
        province: payload.requested_province,
        locality: payload.requested_locality,
      };
    }
  }
}

function titleForApproval(type: ApprovalRequest["type"]): string {
  switch (type) {
    case "role_upgrade_vet":
      return "Matrícula aprobada";
    case "role_upgrade_govt":
      return "Tu rol govt fue aprobado";
    case "role_upgrade_admin":
      return "Tu rol admin fue aprobado";
    case "organization_verification":
      return "Tu organización fue verificada";
    case "govt_assignment_grant":
      return "Tu nueva localidad fue aprobada";
  }
}

function bodyForApproval(type: ApprovalRequest["type"], notes: string | null): string {
  const trail = notes ? ` Notas: ${notes}` : "";
  switch (type) {
    case "role_upgrade_vet":
      return `Verificamos tu matrícula. Ya figurás como veterinario/a en MiMAR.${trail}`;
    case "role_upgrade_govt":
      return `Te asignamos el rol govt con tus localidades solicitadas.${trail}`;
    case "role_upgrade_admin":
      return `Te aprobamos como admin de MiMAR.${trail}`;
    case "organization_verification":
      return `Tu organización ahora figura como verificada. Los eventos que registres aparecen con el sello de verificación.${trail}`;
    case "govt_assignment_grant":
      return `Tu solicitud para cubrir una nueva localidad fue aprobada.${trail}`;
  }
}

function titleForRejection(type: ApprovalRequest["type"]): string {
  switch (type) {
    case "role_upgrade_vet":
      return "Matrícula rechazada";
    case "role_upgrade_govt":
      return "Solicitud govt rechazada";
    case "role_upgrade_admin":
      return "Solicitud admin rechazada";
    case "organization_verification":
      return "Verificación de organización rechazada";
    case "govt_assignment_grant":
      return "Solicitud de localidad rechazada";
  }
}

function ctaForApplicant(request: ApprovalRequest): string {
  if (request.targetOrganizationId) return "/refugio";
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
    revalidatePath("/admin/cola");
    revalidatePath(`/admin/cola/${publicToken}`);
  }
  return result;
}
