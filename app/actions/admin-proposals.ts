"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { approvalRequests, auditLog, db, notifications, organizations, profiles } from "@/db";
import { validateApprovalPayload } from "@/lib/approval-payloads";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { generateApprovalRequestToken } from "@/lib/publicToken";
import { generateUniqueToken } from "@/lib/unique-token";

// All proposal actions follow the same shape: validate caller authority,
// validate payload, refuse on existing pending request (avoid duplicates),
// then atomic tx that writes the approval_request + notifies the target.
// initiated_by='authority' + initiated_by_user_id=actor distinguishes
// these from self-submitted requests.

export type ProposalResult = { error: string } | { ok: true; publicToken: string };

// Logged on every PII read so it leaves a trail. Callers await this so the
// audit row (the Ley 25.326 accountability guarantee) is durable before the
// page returns. AC2: list pages log BOTH the typed-query search and the
// no-query landing (query=""), since the landing still exposes the first N
// users' name/id/role.
export async function logPiiQueryForAuthority(
  actorUserId: string,
  query: string,
  resultCount: number,
  // "omnibox" is the operator global-search surface (Wave 2 Item 10). It is a
  // free-form JSONB payload value, not a schema column — no migration needed.
  surface: "users" | "organizations" | "omnibox",
): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId,
    action: "pii_queried",
    payload: { query, result_count: resultCount, surface },
  });
}

// AC2: safe wrapper for list-page PII logging. Awaited so the audit row is
// durable, but a failing insert must NOT break the page render — it is logged
// to console.error and swallowed. Returns true on success, false on failure,
// so it stays unit-testable without a Next.js render context.
// @no-auth-required: thin wrapper over logPiiQueryForAuthority (an inner
// writer). Only callers are /gob list pages already gated by the /gob layout
// guard, which supplies the authenticated actorUserId; this function adds no
// new capability beyond that inner writer.
export async function logPiiReadSafely(
  actorUserId: string,
  query: string,
  resultCount: number,
  surface: "users" | "organizations",
): Promise<boolean> {
  try {
    await logPiiQueryForAuthority(actorUserId, query, resultCount, surface);
    return true;
  } catch (e) {
    console.error(`pii_queried log failed (${surface} list)`, e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------

type ActorAuthority = {
  profile: { id: string; role: "admin" | "govt" };
  jurisdictions: { province: string; locality: string }[];
};

async function loadActorAuthority(
  actorUserId: string,
): Promise<ActorAuthority | { error: string }> {
  const [profile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, actorUserId))
    .limit(1);
  if (!profile || (profile.role !== "admin" && profile.role !== "govt")) {
    return { error: "Solo govt o admin pueden proponer cambios." };
  }
  // AC1 defense-in-depth: deactivated authorities cannot propose changes, even
  // if the inner writer is reached directly (the /gob guard already rejects
  // them at the request boundary; this mirrors that at the data layer).
  if (profile.deactivatedAt !== null) {
    return { error: "La cuenta está desactivada." };
  }
  return {
    profile: { id: profile.id, role: profile.role },
    jurisdictions: [],
    // Govt's assignments aren't strictly needed for the propose path —
    // capability is enforced per type below. We keep the shape uniform
    // with admin-decisions.ts for symmetry.
  };
}

async function hasPendingOfType(
  applicantUserId: string,
  type: Parameters<typeof validateApprovalPayload>[0],
): Promise<boolean> {
  const [row] = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.applicantUserId, applicantUserId),
        eq(approvalRequests.type, type),
        eq(approvalRequests.status, "pending"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Pure inner writers
// ---------------------------------------------------------------------------

export async function proposeVetUpgradeForUser(
  actorUserId: string,
  input: {
    targetUserId: string;
    matriculaNumber: string;
    matriculaJurisdiccion: string;
    operationalProvince: string;
    operationalLocality: string;
    especialidad?: string | null;
    anosExperiencia?: number | null;
  },
): Promise<ProposalResult> {
  const auth = await loadActorAuthority(actorUserId);
  if ("error" in auth) return { error: auth.error };
  // Both admin + govt can propose vet upgrades.

  const [target] = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, input.targetUserId))
    .limit(1);
  if (!target) return { error: "Usuario destino no encontrado." };
  if (target.role === "vet") return { error: "El usuario ya es veterinario." };

  if (await hasPendingOfType(input.targetUserId, "role_upgrade_vet")) {
    return { error: "Ya hay una solicitud pendiente para este usuario." };
  }

  let payload: unknown;
  try {
    payload = validateApprovalPayload("role_upgrade_vet", {
      matricula_number: input.matriculaNumber.trim(),
      matricula_jurisdiccion: input.matriculaJurisdiccion.trim(),
      especialidad: input.especialidad?.trim() || null,
      anos_experiencia:
        typeof input.anosExperiencia === "number" && Number.isFinite(input.anosExperiencia)
          ? input.anosExperiencia
          : null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Payload inválido." };
  }

  const publicToken = await generateUniqueToken(
    approvalRequests,
    approvalRequests.publicToken,
    generateApprovalRequestToken,
  );
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  await db.transaction(async (tx) => {
    await tx.insert(approvalRequests).values({
      publicToken,
      type: "role_upgrade_vet",
      status: "pending",
      applicantUserId: input.targetUserId,
      initiatedBy: "authority",
      initiatedByUserId: actorUserId,
      targetUserId: input.targetUserId,
      jurisdictionProvince: input.operationalProvince.trim(),
      jurisdictionLocality: input.operationalLocality.trim(),
      payload,
    });
    pendingNotifications.push({
      userId: input.targetUserId,
      notificationType: "approval_request_proposed_authority",
      title: "Te propusieron el rol veterinario",
      body: "Una autoridad inició una solicitud para verificar tu matrícula. Vas a recibir una respuesta cuando se decida.",
      severity: "info",
      ctaLabel: "Ver detalle",
      ctaUrl: "/cuenta/upgrade",
    });
  });

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true, publicToken };
}

export async function proposeOrgVerificationForOrg(
  actorUserId: string,
  input: { organizationId: string },
): Promise<ProposalResult> {
  const auth = await loadActorAuthority(actorUserId);
  if ("error" in auth) return { error: auth.error };
  // Both admin and govt (in scope of org's locality) can propose. The
  // canDecide guard kicks in at approval time; here we just allow either.

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
  if (org.verified) return { error: "Esta organización ya está verificada." };
  if (!org.jurisdictionProvince || !org.jurisdictionLocality) {
    return { error: "La organización no tiene jurisdicción registrada." };
  }

  // Idempotency: one pending org_verification per org.
  const [pending] = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.targetOrganizationId, org.id),
        eq(approvalRequests.type, "organization_verification"),
        eq(approvalRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (pending) {
    return { error: "Ya hay una solicitud pendiente de verificación para esta organización." };
  }

  let payload: unknown;
  try {
    payload = validateApprovalPayload("organization_verification", {
      org_type: "other",
      cuit: null,
      personeria_juridica_number: null,
      additional_documents_summary: "Propuesta admin-initiated. Sin documentos adjuntos en v1.",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Payload inválido." };
  }

  // applicant_user_id: the org's creator if known, fallback to the actor.
  const applicantUserId = org.createdByUserId ?? actorUserId;
  const publicToken = await generateUniqueToken(
    approvalRequests,
    approvalRequests.publicToken,
    generateApprovalRequestToken,
  );
  // The earlier guard rejects null jurisdiction values, but TS doesn't
  // propagate the narrowing through the transaction closure. Pin the
  // values into a const so the insert sees `string`, not `string | null`.
  const province = org.jurisdictionProvince;
  const locality = org.jurisdictionLocality;

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  await db.transaction(async (tx) => {
    await tx.insert(approvalRequests).values({
      publicToken,
      type: "organization_verification",
      status: "pending",
      applicantUserId,
      initiatedBy: "authority",
      initiatedByUserId: actorUserId,
      targetOrganizationId: org.id,
      jurisdictionProvince: province,
      jurisdictionLocality: locality,
      payload,
    });
    if (applicantUserId !== actorUserId) {
      pendingNotifications.push({
        userId: applicantUserId,
        notificationType: "approval_request_proposed_authority",
        title: "Verificación propuesta para tu organización",
        body: "Una autoridad inició una solicitud de verificación para tu organización.",
        severity: "info",
        ctaLabel: "Ver panel",
        ctaUrl: "/org",
      });
    }
  });

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true, publicToken };
}

// ---------------------------------------------------------------------------
// Form-shaped wrappers — gate via requireAdminOrGovtOrRedirect.
// ---------------------------------------------------------------------------

export async function proposeVetUpgradeAction(
  input: Parameters<typeof proposeVetUpgradeForUser>[1],
): Promise<ProposalResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await proposeVetUpgradeForUser(user.id, input);
  if ("ok" in result) {
    revalidatePath("/gob/cola");
    revalidatePath("/gob/usuarios");
  }
  return result;
}

export async function proposeOrgVerificationAction(
  input: Parameters<typeof proposeOrgVerificationForOrg>[1],
): Promise<ProposalResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await proposeOrgVerificationForOrg(user.id, input);
  if ("ok" in result) {
    revalidatePath("/gob/cola");
    revalidatePath("/gob/organizaciones");
  }
  return result;
}

export async function logPiiQueryAction(input: {
  query: string;
  resultCount: number;
  surface: "users" | "organizations";
}): Promise<void> {
  const { user } = await requireAdminOrGovtOrRedirect();
  await logPiiQueryForAuthority(user.id, input.query, input.resultCount, input.surface);
}
