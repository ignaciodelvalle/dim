"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db, notifications, organizationMemberships, organizations, profiles } from "@/db";
import { getActiveMemberships } from "@/lib/capabilities";
import { generatePublicToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// Types
// ============================================================================

export type VetUpgradeInput = {
  matriculaNumber: string;
  jurisdiccion: string;
};

export type CreateOrganizationInput = {
  name: string;
  legalName: string;
  orgType: "clinic" | "shelter" | "rescue_network" | "sanitary_authority" | "other";
  cuit?: string | null;
  email: string;
  phone?: string | null;
  jurisdictionProvince?: string | null;
  jurisdictionLocality?: string | null;
};

export type UpgradeFormState = {
  error: string | null;
  ok?: boolean;
  organizationId?: string;
};

// ============================================================================
// Validation helpers
// ============================================================================

const MATRICULA_RE = /^[A-Za-z0-9-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUIT_RE = /^\d{11}$/;
const ORG_TYPES = ["clinic", "shelter", "rescue_network", "sanitary_authority", "other"] as const;

function validateMatricula(value: string): string | null {
  if (!value) return "La matrícula es requerida.";
  if (!MATRICULA_RE.test(value)) {
    return "La matrícula debe tener entre 3 y 30 caracteres alfanuméricos o guiones.";
  }
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
  return null;
}

// Narrow the Postgres unique_violation (code 23505) for a specific column.
// postgres-js attaches `code`, `constraint_name`, `column_name`, and `detail`
// to its error objects.
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
  const matricula = input.matriculaNumber.trim();
  const jurisdiccion = input.jurisdiccion.trim();
  const validationError = validateMatricula(matricula);
  if (validationError) return { error: validationError };
  if (!jurisdiccion || jurisdiccion.length < 2 || jurisdiccion.length > 60) {
    return { error: "La jurisdicción debe tener entre 2 y 60 caracteres." };
  }

  // Idempotency: reject if profile already has a matricula set.
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profile) return { error: "Perfil no encontrado." };
  if (profile.matriculaNumber) {
    return {
      error: "Ya tenés una matrícula registrada — pedí cambio a un admin.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({
          matriculaNumber: matricula,
          matriculaJurisdiccion: jurisdiccion,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));

      await tx.insert(notifications).values({
        userId,
        notificationType: "vet_upgrade_requested",
        title: "Solicitud de verificación profesional enviada",
        body: "Vamos a verificar tu matrícula y te avisamos. Mientras tanto podés seguir usando DIM como dueño.",
        severity: "info",
        ctaLabel: "Ver estado",
        ctaUrl: "/cuenta/upgrade",
      });
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

  // Idempotency: reject if user already admins an org.
  const memberships = await getActiveMemberships(userId);
  const alreadyAdmin = memberships.some((m) => m.membership.role === "admin");
  if (alreadyAdmin) {
    return { error: "Ya administrás una organización." };
  }

  const publicToken = generatePublicToken();
  const cuit = input.cuit ? input.cuit.replace(/-/g, "") : null;
  let organizationId: string;

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
          jurisdictionProvince: input.jurisdictionProvince?.trim() || null,
          jurisdictionLocality: input.jurisdictionLocality?.trim() || null,
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

      await tx.insert(notifications).values({
        userId,
        notificationType: "org_creation_requested",
        title: "Organización creada — pendiente de verificación",
        body: "Tu organización fue creada. Mientras se verifica, los eventos que registres aparecen como no verificados.",
        severity: "info",
        ctaLabel: "Ir al panel",
        ctaUrl: "/refugio",
      });

      return { organizationId: newOrg.id };
    });
    organizationId = result.organizationId;
  } catch (err) {
    // Postgres 23505 = unique_violation. Match by constraint metadata, not
    // error-message substring, so renamed constraints or driver-level message
    // changes don't silently miscategorize the error.
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

  const matriculaNumber = String(formData.get("matriculaNumber") ?? "").trim();
  const jurisdiccion = String(formData.get("jurisdiccion") ?? "").trim();

  return requestVetUpgradeForUser(user.id, { matriculaNumber, jurisdiccion });
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
    jurisdictionProvince: String(formData.get("jurisdictionProvince") ?? "").trim() || null,
    jurisdictionLocality: String(formData.get("jurisdictionLocality") ?? "").trim() || null,
  };

  const result = await createOrganizationForUser(user.id, input);
  if (result.error) return result;

  revalidatePath("/cuenta/upgrade");
  redirect("/refugio");
}
