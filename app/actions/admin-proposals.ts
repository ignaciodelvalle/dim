"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  approvalRequests,
  auditLog,
  db,
  notifications,
  organizations,
  ownerships,
  profiles,
} from "@/db";
import { validateApprovalPayload } from "@/lib/approval-payloads";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { generateApprovalRequestToken } from "@/lib/publicToken";

// All proposal actions follow the same shape: validate caller authority,
// validate payload, refuse on existing pending request (avoid duplicates),
// then atomic tx that writes the approval_request + notifies the target.
// initiated_by='authority' + initiated_by_user_id=actor distinguishes
// these from self-submitted requests.

export type ProposalResult = { error: string } | { ok: true; publicToken: string };

// Logged on every search hit so PII reads have a trail. Fire-and-forget;
// callers don't need to await for the search to render.
export async function logPiiQueryForAuthority(
  actorUserId: string,
  query: string,
  resultCount: number,
  surface: "users" | "organizations",
): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId,
    action: "pii_queried",
    payload: { query, result_count: resultCount, surface },
  });
}

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------

type ActorAuthority = {
  profile: { id: string; role: "admin" | "govt" };
  jurisdictions: { province: string; locality: string }[];
};

async function loadActorAuthority(actorUserId: string): Promise<ActorAuthority | { error: string }> {
  const [profile] = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, actorUserId))
    .limit(1);
  if (!profile || (profile.role !== "admin" && profile.role !== "govt")) {
    return { error: "Solo govt o admin pueden proponer cambios." };
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

  const publicToken = generateApprovalRequestToken();
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
    await tx.insert(notifications).values({
      userId: input.targetUserId,
      notificationType: "approval_request_proposed_authority",
      title: "Te propusieron el rol veterinario",
      body: "Una autoridad inició una solicitud para verificar tu matrícula. Vas a recibir una respuesta cuando se decida.",
      severity: "info",
      ctaLabel: "Ver detalle",
      ctaUrl: "/cuenta/upgrade",
    });
  });

  return { ok: true, publicToken };
}

export async function proposeGovtUpgradeForUser(
  actorUserId: string,
  input: {
    targetUserId: string;
    organismo: string;
    cargo: string;
    motivo: string;
    requestedLocalities: { province: string; locality: string }[];
    routingProvince: string;
    routingLocality: string;
  },
): Promise<ProposalResult> {
  const auth = await loadActorAuthority(actorUserId);
  if ("error" in auth) return { error: auth.error };
  if (auth.profile.role !== "admin") {
    return { error: "Solo admin puede proponer el rol govt." };
  }

  const [target] = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, input.targetUserId))
    .limit(1);
  if (!target) return { error: "Usuario destino no encontrado." };
  if (target.role === "govt" || target.role === "admin") {
    return { error: `El usuario ya tiene rol ${target.role}.` };
  }

  if (await hasPendingOfType(input.targetUserId, "role_upgrade_govt")) {
    return { error: "Ya hay una solicitud pendiente de rol govt para este usuario." };
  }

  if (input.requestedLocalities.length === 0) {
    return { error: "Tenés que solicitar al menos una localidad." };
  }

  let payload: unknown;
  try {
    payload = validateApprovalPayload("role_upgrade_govt", {
      organismo: input.organismo.trim(),
      cargo: input.cargo.trim(),
      motivo: input.motivo.trim(),
      requested_localities: input.requestedLocalities,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Payload inválido." };
  }

  const publicToken = generateApprovalRequestToken();
  await db.transaction(async (tx) => {
    await tx.insert(approvalRequests).values({
      publicToken,
      type: "role_upgrade_govt",
      status: "pending",
      applicantUserId: input.targetUserId,
      initiatedBy: "authority",
      initiatedByUserId: actorUserId,
      targetUserId: input.targetUserId,
      jurisdictionProvince: input.routingProvince.trim(),
      jurisdictionLocality: input.routingLocality.trim(),
      payload,
    });
    await tx.insert(notifications).values({
      userId: input.targetUserId,
      notificationType: "approval_request_proposed_authority",
      title: "Te propusieron el rol govt",
      body: "Un admin propuso asignarte el rol gubernamental. Vas a recibir una respuesta cuando otro admin lo decida.",
      severity: "info",
      ctaLabel: "Ver detalle",
      ctaUrl: "/cuenta/upgrade",
    });
  });

  return { ok: true, publicToken };
}

export async function proposeAdminUpgradeForUser(
  actorUserId: string,
  input: {
    targetUserId: string;
    motivo: string;
    routingProvince: string;
    routingLocality: string;
  },
): Promise<ProposalResult> {
  const auth = await loadActorAuthority(actorUserId);
  if ("error" in auth) return { error: auth.error };
  if (auth.profile.role !== "admin") {
    return { error: "Solo admin puede proponer el rol admin." };
  }

  const [target] = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, input.targetUserId))
    .limit(1);
  if (!target) return { error: "Usuario destino no encontrado." };
  if (target.role === "admin") return { error: "El usuario ya es admin." };

  // Anti-pets at PROPOSAL time. Re-checked again at decision time
  // (see admin-decisions.ts) — both sides per spec §7.2.
  const owned = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(and(eq(ownerships.ownerUserId, input.targetUserId), isNull(ownerships.endedAt)));
  if (owned.length > 0) {
    return {
      error: `El usuario tiene ${owned.length} mascota(s) registrada(s). Para ser admin no puede tener mascotas.`,
    };
  }

  if (await hasPendingOfType(input.targetUserId, "role_upgrade_admin")) {
    return { error: "Ya hay una solicitud pendiente de rol admin para este usuario." };
  }

  let payload: unknown;
  try {
    payload = validateApprovalPayload("role_upgrade_admin", {
      motivo: input.motivo.trim(),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Payload inválido." };
  }

  const publicToken = generateApprovalRequestToken();
  await db.transaction(async (tx) => {
    await tx.insert(approvalRequests).values({
      publicToken,
      type: "role_upgrade_admin",
      status: "pending",
      applicantUserId: input.targetUserId,
      initiatedBy: "authority",
      initiatedByUserId: actorUserId,
      targetUserId: input.targetUserId,
      jurisdictionProvince: input.routingProvince.trim(),
      jurisdictionLocality: input.routingLocality.trim(),
      payload,
    });
    await tx.insert(notifications).values({
      userId: input.targetUserId,
      notificationType: "approval_request_proposed_authority",
      title: "Te propusieron el rol admin",
      body: "Un admin propuso asignarte el rol admin de MiMAR. Recordá: el rol admin no puede tener mascotas.",
      severity: "warning",
      ctaLabel: "Ver detalle",
      ctaUrl: "/cuenta/upgrade",
    });
  });

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
  const publicToken = generateApprovalRequestToken();
  // The earlier guard rejects null jurisdiction values, but TS doesn't
  // propagate the narrowing through the transaction closure. Pin the
  // values into a const so the insert sees `string`, not `string | null`.
  const province = org.jurisdictionProvince;
  const locality = org.jurisdictionLocality;

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
      await tx.insert(notifications).values({
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
    revalidatePath("/admin/cola");
    revalidatePath("/admin/usuarios");
  }
  return result;
}

export async function proposeGovtUpgradeAction(
  input: Parameters<typeof proposeGovtUpgradeForUser>[1],
): Promise<ProposalResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await proposeGovtUpgradeForUser(user.id, input);
  if ("ok" in result) {
    revalidatePath("/admin/cola");
    revalidatePath("/admin/usuarios");
  }
  return result;
}

export async function proposeAdminUpgradeAction(
  input: Parameters<typeof proposeAdminUpgradeForUser>[1],
): Promise<ProposalResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await proposeAdminUpgradeForUser(user.id, input);
  if ("ok" in result) {
    revalidatePath("/admin/cola");
    revalidatePath("/admin/usuarios");
  }
  return result;
}

export async function proposeOrgVerificationAction(
  input: Parameters<typeof proposeOrgVerificationForOrg>[1],
): Promise<ProposalResult> {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await proposeOrgVerificationForOrg(user.id, input);
  if ("ok" in result) {
    revalidatePath("/admin/cola");
    revalidatePath("/admin/organizaciones");
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
