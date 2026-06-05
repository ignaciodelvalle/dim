"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, organizationMemberships, organizations } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";

// ============================================================================
// Types
// ============================================================================

export type UpdateOrgFormState = {
  error: string | null;
  ok?: boolean;
};

export type UpdateOrgInput = {
  orgToken: string;
  displayName: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  description?: string | null;
  personeriaJuridicaNumber?: string | null;
};

// ============================================================================
// Validation
// ============================================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.{1,}/;

function validateUpdateOrgInput(input: UpdateOrgInput): string | null {
  const displayName = (input.displayName ?? "").trim();
  if (!displayName || displayName.length < 2 || displayName.length > 100) {
    return "El nombre debe tener entre 2 y 100 caracteres.";
  }
  if (input.legalName) {
    const legalName = input.legalName.trim();
    if (legalName.length < 2 || legalName.length > 100) {
      return "La razón social debe tener entre 2 y 100 caracteres.";
    }
  }
  if (input.email) {
    if (!EMAIL_RE.test(input.email.trim())) {
      return "El correo electrónico es inválido.";
    }
  }
  if (input.website) {
    if (!URL_RE.test(input.website.trim())) {
      return "El sitio web debe comenzar con http:// o https://.";
    }
    if (input.website.trim().length > 200) {
      return "El sitio web no puede tener más de 200 caracteres.";
    }
  }
  if (input.description && input.description.trim().length > 2000) {
    return "La descripción no puede tener más de 2000 caracteres.";
  }
  if (input.phone && input.phone.trim().length > 30) {
    return "El teléfono no puede tener más de 30 caracteres.";
  }
  if (input.personeriaJuridicaNumber && input.personeriaJuridicaNumber.trim().length > 60) {
    return "El número de personería jurídica no puede tener más de 60 caracteres.";
  }
  return null;
}

// ============================================================================
// Inner writer — testable with mocked createClient (no FormData required)
//
// Takes userId + orgToken and performs its own membership lookup so the
// function is independently auditable without relying on the caller to pass
// a pre-fetched session. The outer action calls requireOrgAccessByToken first
// (login guard); this function performs the admin-role check.
// ============================================================================

export async function updateOrganizationForUser(
  userId: string,
  orgToken: string,
  input: UpdateOrgInput,
): Promise<UpdateOrgFormState> {
  const validationError = validateUpdateOrgInput(input);
  if (validationError) return { error: validationError };

  // Resolve org + assert active admin membership for userId.
  // Separate from the outer action's requireOrgAccessByToken so this function
  // is independently security-auditable — the admin check can't be skipped by
  // calling the inner writer without the outer wrapper.
  const [row] = await db
    .select({ orgId: organizations.id, role: organizationMemberships.role })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizations.publicToken, orgToken),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!row) return { error: "No tenés acceso a esta organización." };
  if (row.role !== "admin") {
    return { error: "Solo los administradores de la organización pueden editar el perfil." };
  }

  // Whitelist: ONLY update safe profile fields.
  // orgType, verified, status, publicToken, jurisdictionProvince, jurisdictionLocality
  // are intentionally excluded — they require out-of-band admin action.
  await db
    .update(organizations)
    .set({
      displayName: input.displayName.trim(),
      legalName: input.legalName?.trim() || undefined,
      email: input.email?.trim() || undefined,
      phone: input.phone?.trim() || null,
      website: input.website?.trim() || null,
      description: input.description?.trim() || null,
      personeriaJuridicaNumber: input.personeriaJuridicaNumber?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, row.orgId));

  revalidatePath(`/org/${orgToken}/configuracion`);
  revalidatePath(`/org/${orgToken}`);

  return { error: null, ok: true };
}

// ============================================================================
// Form-shaped wrapper (server action consumed by useActionState)
// ============================================================================

export async function updateOrganizationAction(
  _prev: UpdateOrgFormState,
  formData: FormData,
): Promise<UpdateOrgFormState> {
  const orgToken = String(formData.get("orgToken") ?? "").trim();
  if (!orgToken) return { error: "Token de organización requerido." };

  // requireOrgAccessByToken: redirects to /login when unauthenticated;
  // calls notFound() when no active membership exists for this orgToken.
  // The admin-role check happens inside updateOrganizationForUser.
  const { user } = await requireOrgAccessByToken(orgToken);

  return updateOrganizationForUser(user.id, orgToken, {
    orgToken,
    displayName: String(formData.get("displayName") ?? "").trim(),
    legalName: String(formData.get("legalName") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    website: String(formData.get("website") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    personeriaJuridicaNumber: String(formData.get("personeriaJuridicaNumber") ?? "").trim() || null,
  });
}
