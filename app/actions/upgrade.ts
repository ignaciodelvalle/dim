"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  approvalRequests,
  db,
  notifications,
  organizationMemberships,
  organizations,
  profiles,
} from "@/db";
import { validateApprovalPayload } from "@/lib/approval-payloads";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { getActiveMemberships } from "@/lib/capabilities";
import { tryResolveCanonicalJurisdiction } from "@/lib/jurisdiction-validation";
import { generateApprovalRequestToken, generatePublicToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";
import { generateUniqueToken } from "@/lib/unique-token";

// ============================================================================
// Types
// ============================================================================

// Vet upgrade input. Two location concepts kept separate per the spec:
//
// - matriculaJurisdiccion: where the matricula was issued (the registry to
//   check). Lives in the payload.
// - operationalProvince / operationalLocality: where the vet operates,
//   which routes the approval request to the right govt (or admin as
//   fallback). Lives on approval_requests.jurisdiction_*.
//
// They are often the same value but not always — a vet licensed in CABA
// may operate primarily in Pilar (Buenos Aires province).
export type VetUpgradeInput = {
  matriculaNumber: string;
  matriculaJurisdiccion: string;
  operationalProvince: string;
  operationalLocality: string;
  especialidad?: string | null;
  anosExperiencia?: number | null;
};

export type CreateOrganizationInput = {
  name: string;
  legalName: string;
  orgType: "clinic" | "shelter" | "rescue_network" | "sanitary_authority" | "other";
  cuit?: string | null;
  email: string;
  phone?: string | null;
  jurisdictionProvince: string;
  jurisdictionLocality: string;
  personeriaJuridicaNumber?: string | null;
};

export type UpgradeFormState = {
  error: string | null;
  ok?: boolean;
  organizationId?: string;
  // When a prerequisite is missing, the UI renders a CTA instead of the
  // generic error paragraph. See docs/patterns/petition-prerequisites.md.
  missingPrereq?: "dni";
  prereqUrl?: string;
};

// ============================================================================
// Validation helpers
// ============================================================================

const MATRICULA_RE = /^[A-Za-z0-9-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUIT_RE = /^\d{11}$/;
const ORG_TYPES = ["clinic", "shelter", "rescue_network", "sanitary_authority", "other"] as const;

function validateLocationField(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 60) {
    return `${label} debe tener entre 2 y 60 caracteres.`;
  }
  return null;
}

function validateVetInput(input: VetUpgradeInput): string | null {
  const matricula = input.matriculaNumber.trim();
  if (!matricula) return "La matrícula es requerida.";
  if (!MATRICULA_RE.test(matricula)) {
    return "La matrícula debe tener entre 3 y 30 caracteres alfanuméricos o guiones.";
  }
  const jurError = validateLocationField(
    input.matriculaJurisdiccion,
    "La jurisdicción de la matrícula",
  );
  if (jurError) return jurError;
  const provError = validateLocationField(input.operationalProvince, "La provincia donde ejercés");
  if (provError) return provError;
  const locError = validateLocationField(input.operationalLocality, "La localidad donde ejercés");
  if (locError) return locError;
  return null;
}

function validateOrgInput(input: CreateOrganizationInput): string | null {
  const name = input.name.trim();
  if (!name || name.length < 2 || name.length > 100) {
    return "El nombre debe tener entre 2 y 100 caracteres.";
  }
  const legalName = input.legalName.trim();
  if (!legalName || legalName.length < 2 || legalName.length > 100) {
    return "La razón social debe tener entre 2 y 100 caracteres.";
  }
  if (!ORG_TYPES.includes(input.orgType as (typeof ORG_TYPES)[number])) {
    return "Tipo de organización inválido.";
  }
  if (!EMAIL_RE.test(input.email)) {
    return "El correo electrónico es inválido.";
  }
  if (input.cuit) {
    const digits = input.cuit.replace(/-/g, "");
    if (!CUIT_RE.test(digits)) {
      return "El CUIT debe tener 11 dígitos.";
    }
  }
  const provError = validateLocationField(input.jurisdictionProvince, "La provincia");
  if (provError) return provError;
  const locError = validateLocationField(input.jurisdictionLocality, "La localidad");
  if (locError) return locError;
  return null;
}

// Postgres 23505 = unique_violation. Match by constraint metadata, not the
// error-message string, so renamed constraints or driver-level message
// changes don't silently miscategorize the error.
function isUniqueViolationOn(err: unknown, column: string): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as Record<string, unknown>;
  if (record.code !== "23505") return false;
  const constraint = typeof record.constraint_name === "string" ? record.constraint_name : "";
  const columnName = typeof record.column_name === "string" ? record.column_name : "";
  const detail = typeof record.detail === "string" ? record.detail : "";
  return constraint.includes(column) || columnName === column || detail.includes(`(${column})`);
}

// ============================================================================
// Pure inner writers — testable without FormData or Supabase client
// ============================================================================

export async function requestVetUpgradeForUser(
  userId: string,
  input: VetUpgradeInput,
): Promise<UpgradeFormState> {
  const validationError = validateVetInput(input);
  if (validationError) return { error: validationError };

  const matricula = input.matriculaNumber.trim();
  const matriculaJur = input.matriculaJurisdiccion.trim();
  // Canonicalize operational jurisdiction against the INDEC catalog when
  // it resolves; on a catalog miss we keep the trimmed input so submissions
  // from yet-uncatalogued localities (notably CABA barrios) still land.
  const opJurisdiction = await tryResolveCanonicalJurisdiction({
    rawProvince: input.operationalProvince,
    rawLocality: input.operationalLocality,
  });
  const opProvince = opJurisdiction.province;
  const opLocality = opJurisdiction.locality;
  const especialidad = input.especialidad?.trim() || null;
  const anosExperiencia =
    typeof input.anosExperiencia === "number" && Number.isFinite(input.anosExperiencia)
      ? input.anosExperiencia
      : null;

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profile) return { error: "Perfil no encontrado." };
  if (profile.role === "vet") {
    return { error: "Ya sos veterinario/a en MiMAR." };
  }

  // Prerequisite: DNI must be verified before submitting a vet upgrade.
  // prereqUrl uses the canonical ?next= pattern so the user lands back here
  // after completing verification. TODO(mi-argentina): when the real OAuth
  // flow lands, this prereq is satisfied by the Mi Argentina callback, not the
  // placeholder form. The contract (dniVerified=true before petition) stays.
  if (!profile.dniVerified) {
    return {
      error: "Necesitás verificar tu DNI antes de enviar una solicitud de veterinario.",
      missingPrereq: "dni",
      prereqUrl: "/cuenta/verificar-dni?next=/cuenta/upgrade",
    };
  }

  // Idempotency: one pending vet-upgrade request per applicant. A previously
  // rejected/withdrawn request does NOT block a re-submission (the new row
  // lives alongside the old one — full history in /cuenta/solicitudes).
  const [pending] = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.applicantUserId, userId),
        eq(approvalRequests.type, "role_upgrade_vet"),
        eq(approvalRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (pending) {
    return { error: "Ya tenés una solicitud pendiente de revisión." };
  }

  let payload: unknown;
  try {
    payload = validateApprovalPayload("role_upgrade_vet", {
      matricula_number: matricula,
      matricula_jurisdiccion: matriculaJur,
      especialidad,
      anos_experiencia: anosExperiencia,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Payload inválido.",
    };
  }

  const authorityIds = await findAuthoritiesForJurisdiction({
    province: opProvince,
    locality: opLocality,
  });
  const publicToken = await generateUniqueToken(
    approvalRequests,
    approvalRequests.publicToken,
    generateApprovalRequestToken,
  );

  try {
    await db.transaction(async (tx) => {
      // Step 1: insert the approval_request — the canonical contract.
      await tx.insert(approvalRequests).values({
        publicToken,
        type: "role_upgrade_vet",
        status: "pending",
        applicantUserId: userId,
        initiatedBy: "self",
        targetUserId: userId,
        jurisdictionProvince: opProvince,
        jurisdictionLocality: opLocality,
        payload,
      });

      // Step 2 (deferred): attachments with purpose='approval_evidence' —
      // wired in when the form has an upload field. The data model already
      // supports it via attachments.approval_request_id.

      // Step 3: update profiles so the user sees their submitted data
      // reflected in /cuenta/upgrade. role stays as-is until approval.
      await tx
        .update(profiles)
        .set({
          matriculaNumber: matricula,
          matriculaJurisdiccion: matriculaJur,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));

      // Step 4a: notify the applicant.
      await tx.insert(notifications).values({
        userId,
        notificationType: "approval_request_submitted_self",
        title: "Solicitud de verificación profesional enviada",
        body: "Vamos a verificar tu matrícula y te avisamos. Mientras tanto podés seguir usando MiMAR como dueño.",
        severity: "info",
        ctaLabel: "Ver estado",
        ctaUrl: "/cuenta/upgrade",
      });

      // Step 4b: notify every authority that should review this. Empty when
      // no admin is seeded — that's a configuration issue, not a fatal one.
      if (authorityIds.length > 0) {
        await tx.insert(notifications).values(
          authorityIds.map((authorityId) => ({
            userId: authorityId,
            notificationType: "approval_request_pending_authority",
            title: `Nueva solicitud: matrícula veterinaria en ${opLocality}`,
            body: `Un usuario solicitó verificación profesional. Matrícula ${matricula} (${matriculaJur}).`,
            severity: "info" as const,
            ctaLabel: "Revisar",
            ctaUrl: `/admin/cola/${publicToken}`,
          })),
        );
      }
    });
  } catch (err) {
    return {
      error: `No se pudo guardar la solicitud: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { error: null, ok: true };
}

export async function createOrganizationForUser(
  userId: string,
  input: CreateOrganizationInput,
): Promise<UpgradeFormState> {
  const validationError = validateOrgInput(input);
  if (validationError) return { error: validationError };

  // Prerequisite: DNI must be verified before creating an organization.
  const [profile] = await db
    .select({ dniVerified: profiles.dniVerified })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!profile) return { error: "Perfil no encontrado." };
  if (!profile.dniVerified) {
    return {
      error: "Necesitás verificar tu DNI antes de crear una organización.",
      missingPrereq: "dni",
      prereqUrl: "/cuenta/verificar-dni?next=/cuenta/upgrade",
    };
  }

  // Idempotency: one org per user (the existing membership-based guard).
  const memberships = await getActiveMemberships(userId);
  const alreadyAdmin = memberships.some((m) => m.membership.role === "admin");
  if (alreadyAdmin) {
    return { error: "Ya administrás una organización." };
  }

  // NOTE: organizations.public_token historically uses the DIM-XXXX prefix
  // even though it's an org, not a pet. Kept as-is for backward compat with
  // existing org URLs. The retry wrapper still ensures uniqueness against
  // the organizations table.
  const publicToken = await generateUniqueToken(
    organizations,
    organizations.publicToken,
    generatePublicToken,
  );
  const approvalPublicToken = await generateUniqueToken(
    approvalRequests,
    approvalRequests.publicToken,
    generateApprovalRequestToken,
  );
  const cuit = input.cuit ? input.cuit.replace(/-/g, "") : null;
  const orgJurisdiction = await tryResolveCanonicalJurisdiction({
    rawProvince: input.jurisdictionProvince,
    rawLocality: input.jurisdictionLocality,
  });
  const province = orgJurisdiction.province;
  const locality = orgJurisdiction.locality;
  let organizationId: string;

  let payload: unknown;
  try {
    payload = validateApprovalPayload("organization_verification", {
      org_type: input.orgType,
      cuit,
      personeria_juridica_number: input.personeriaJuridicaNumber?.trim() || null,
      additional_documents_summary: null,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Payload inválido.",
    };
  }

  const authorityIds = await findAuthoritiesForJurisdiction({ province, locality });

  try {
    const result = await db.transaction(async (tx) => {
      const [newOrg] = await tx
        .insert(organizations)
        .values({
          publicToken,
          displayName: input.name.trim(),
          legalName: input.legalName.trim(),
          orgType: input.orgType,
          cuit: cuit || null,
          email: input.email.trim(),
          phone: input.phone?.trim() || null,
          jurisdictionProvince: province,
          jurisdictionLocality: locality,
          verified: false,
          createdByUserId: userId,
        })
        .returning();

      await tx.insert(organizationMemberships).values({
        organizationId: newOrg.id,
        userId,
        role: "admin",
        canWritePetEvents: true,
      });

      // Canonical contract: the approval request is what authorities act on.
      await tx.insert(approvalRequests).values({
        publicToken: approvalPublicToken,
        type: "organization_verification",
        status: "pending",
        applicantUserId: userId,
        initiatedBy: "self",
        targetOrganizationId: newOrg.id,
        jurisdictionProvince: province,
        jurisdictionLocality: locality,
        payload,
      });

      await tx.insert(notifications).values({
        userId,
        notificationType: "approval_request_submitted_self",
        title: "Organización creada — pendiente de verificación",
        body: "Tu organización fue creada. Mientras se verifica, los eventos que registres aparecen como no verificados.",
        severity: "info",
        ctaLabel: "Ir al panel",
        ctaUrl: "/org",
      });

      if (authorityIds.length > 0) {
        await tx.insert(notifications).values(
          authorityIds.map((authorityId) => ({
            userId: authorityId,
            notificationType: "approval_request_pending_authority",
            title: `Nueva organización a verificar en ${locality}`,
            body: `${newOrg.displayName} (${input.orgType}) solicitó verificación.`,
            severity: "info" as const,
            ctaLabel: "Revisar",
            ctaUrl: `/admin/cola/${approvalPublicToken}`,
          })),
        );
      }

      return { organizationId: newOrg.id };
    });
    organizationId = result.organizationId;
  } catch (err) {
    if (isUniqueViolationOn(err, "cuit")) {
      return { error: "Ya existe una organización con ese CUIT." };
    }
    const msg = err instanceof Error ? err.message : "error desconocido";
    return { error: `No se pudo crear la organización: ${msg}` };
  }

  return { error: null, ok: true, organizationId };
}

// ============================================================================
// Form-shaped wrappers (server actions consumed by useActionState)
// ============================================================================

export async function requestVetUpgradeAction(
  _prev: UpgradeFormState,
  formData: FormData,
): Promise<UpgradeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const anosRaw = String(formData.get("anosExperiencia") ?? "").trim();
  const anos = anosRaw ? Number.parseInt(anosRaw, 10) : null;

  return requestVetUpgradeForUser(user.id, {
    matriculaNumber: String(formData.get("matriculaNumber") ?? "").trim(),
    matriculaJurisdiccion: String(formData.get("matriculaJurisdiccion") ?? "").trim(),
    operationalProvince: String(formData.get("operationalProvince") ?? "").trim(),
    operationalLocality: String(formData.get("operationalLocality") ?? "").trim(),
    especialidad: String(formData.get("especialidad") ?? "").trim() || null,
    anosExperiencia: anos && Number.isFinite(anos) ? anos : null,
  });
}

export async function createOrganizationAction(
  _prev: UpgradeFormState,
  formData: FormData,
): Promise<UpgradeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const orgType = String(formData.get("orgType") ?? "").trim();
  const input: CreateOrganizationInput = {
    name: String(formData.get("name") ?? "").trim(),
    legalName: String(formData.get("legalName") ?? "").trim(),
    orgType: orgType as CreateOrganizationInput["orgType"],
    cuit: String(formData.get("cuit") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    jurisdictionProvince: String(formData.get("jurisdictionProvince") ?? "").trim(),
    jurisdictionLocality: String(formData.get("jurisdictionLocality") ?? "").trim(),
    personeriaJuridicaNumber: String(formData.get("personeriaJuridicaNumber") ?? "").trim() || null,
  };

  const result = await createOrganizationForUser(user.id, input);
  if (result.error) return result;

  revalidatePath("/cuenta/upgrade");
  redirect("/org");
}

// Clinic-only wrapper used by /cuenta/crear-consultorio.
// Forces orgType='clinic' and redirects to the new org's panel instead of /org.
export async function createClinicAction(
  _prev: UpgradeFormState,
  formData: FormData,
): Promise<UpgradeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const input: CreateOrganizationInput = {
    name: String(formData.get("name") ?? "").trim(),
    legalName: String(formData.get("legalName") ?? "").trim(),
    orgType: "clinic",
    cuit: String(formData.get("cuit") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    jurisdictionProvince: String(formData.get("jurisdictionProvince") ?? "").trim(),
    jurisdictionLocality: String(formData.get("jurisdictionLocality") ?? "").trim(),
    personeriaJuridicaNumber: String(formData.get("personeriaJuridicaNumber") ?? "").trim() || null,
  };

  const result = await createOrganizationForUser(user.id, input);
  if (result.error || !result.organizationId)
    return result.error ? result : { error: "No se pudo obtener el ID de la organización." };

  const [org] = await db
    .select({ publicToken: organizations.publicToken })
    .from(organizations)
    .where(eq(organizations.id, result.organizationId))
    .limit(1);

  revalidatePath("/cuenta/crear-consultorio");
  revalidatePath("/cuenta");
  redirect(org ? `/org/${org.publicToken}` : "/org");
}
