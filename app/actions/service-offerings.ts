"use server";

// Service offering actions — thin Next.js "use server" controllers.
//
// Business logic lives in src/modules/service-offerings/application/.
// This file: parse input · AUTH guard · delegate to use-case · revalidate/redirect.
//
// Writer/wrapper split (preserved):
//   - createServiceOfferingForOrg / approveServiceOfferingForAuthority /
//     rejectServiceOfferingForAuthority / updateOfferingCapacityWriter are
//     re-exported from their use-case modules so existing callers keep working.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db, profiles, serviceOfferings } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { approveServiceOfferingForAuthority as approveServiceOfferingForAuthorityUC } from "@/src/modules/service-offerings/application/approve-service-offering";
import { createServiceOfferingForOrg as createServiceOfferingForOrgUC } from "@/src/modules/service-offerings/application/create-service-offering";
import {
  archiveServiceOfferingUseCase,
  pauseServiceOfferingUseCase,
  unpauseServiceOfferingUseCase,
} from "@/src/modules/service-offerings/application/lifecycle-offering";
import { rejectServiceOfferingForAuthority as rejectServiceOfferingForAuthorityUC } from "@/src/modules/service-offerings/application/reject-service-offering";
import { updateOfferingCapacityWriter as updateOfferingCapacityWriterUC } from "@/src/modules/service-offerings/application/update-offering-capacity";
import type {
  ServiceOfferingFormState,
  ServiceOfferingResult,
  UpdateCapacityResult,
} from "@/src/modules/service-offerings/domain/types";

// ============================================================================
// Type re-exports — keep public type surface stable for existing callers
// (type-only exports are erased at runtime; allowed in "use server" files)
// ============================================================================

export type { ServiceOfferingResult } from "@/src/modules/service-offerings/domain/types";
export type { UpdateCapacityResult } from "@/src/modules/service-offerings/domain/types";
export type { ServiceOfferingFormState } from "@/src/modules/service-offerings/domain/types";

// ============================================================================
// Inner writers — thin pass-through wrappers so callers (tests, other actions)
// can import from this path unchanged. These are async functions, satisfying
// the "use server" constraint ("use server" only allows async function exports).
// No auth logic — callers are trusted (server-side only).
// ============================================================================

export async function createServiceOfferingForOrg(
  actorUserId: string,
  orgId: string,
  orgToken: string,
  orgDisplayName: string,
  orgProvince: string | null,
  orgLocality: string | null,
  input: {
    serviceKind: string;
    displayName: string;
    description: string | null;
    durationMinutes: number;
    slotCapacity: number;
    priceArs: number | null;
    eligibilitySpecies: ("dog" | "cat")[] | null;
    eligibilityAgeMinMonths: number | null;
    eligibilityAgeMaxMonths: number | null;
  },
): Promise<ServiceOfferingResult> {
  return createServiceOfferingForOrgUC(
    actorUserId,
    orgId,
    orgToken,
    orgDisplayName,
    orgProvince,
    orgLocality,
    input,
  );
}

export async function approveServiceOfferingForAuthority(
  actorUserId: string,
  publicToken: string,
): Promise<ServiceOfferingResult> {
  return approveServiceOfferingForAuthorityUC(actorUserId, publicToken);
}

export async function rejectServiceOfferingForAuthority(
  actorUserId: string,
  publicToken: string,
  rejectionReason: string,
): Promise<ServiceOfferingResult> {
  return rejectServiceOfferingForAuthorityUC(actorUserId, publicToken, rejectionReason);
}

export async function updateOfferingCapacityWriter(
  offeringId: string,
  newCapacity: number,
): Promise<UpdateCapacityResult> {
  return updateOfferingCapacityWriterUC(offeringId, newCapacity);
}

// ============================================================================
// Form-shaped wrappers — gate auth + capability, delegate to use-cases
// ============================================================================

export async function createServiceOfferingAction(
  _prev: ServiceOfferingFormState,
  formData: FormData,
): Promise<ServiceOfferingFormState> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // auth.error === null narrows to RequireCapabilitySuccess; all fields non-null.
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const user = auth.user!;
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  const orgToken = organization.publicToken;

  const priceRaw = formData.get("priceArs");
  const priceArs =
    priceRaw !== null && priceRaw !== "" ? Number.parseFloat(String(priceRaw)) : null;

  const durationRaw = formData.get("durationMinutes");
  const durationMinutes = durationRaw !== null ? Number.parseInt(String(durationRaw), 10) : 15;

  const capacityRaw = formData.get("slotCapacity");
  const slotCapacity = capacityRaw !== null ? Number.parseInt(String(capacityRaw), 10) : 1;

  const ageMinRaw = formData.get("eligibilityAgeMinMonths");
  const ageMaxRaw = formData.get("eligibilityAgeMaxMonths");

  const speciesRaw = formData.getAll("eligibilitySpecies");
  const eligibilitySpecies =
    speciesRaw.length > 0
      ? (speciesRaw.map(String).filter((s) => s === "dog" || s === "cat") as ("dog" | "cat")[])
      : null;

  const input = {
    serviceKind: String(formData.get("serviceKind") ?? "").trim(),
    displayName: String(formData.get("displayName") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 15,
    slotCapacity: Number.isFinite(slotCapacity) ? slotCapacity : 1,
    priceArs: priceArs !== null && Number.isFinite(priceArs) ? priceArs : null,
    eligibilitySpecies,
    eligibilityAgeMinMonths:
      ageMinRaw !== null && ageMinRaw !== "" ? Number.parseInt(String(ageMinRaw), 10) : null,
    eligibilityAgeMaxMonths:
      ageMaxRaw !== null && ageMaxRaw !== "" ? Number.parseInt(String(ageMaxRaw), 10) : null,
  };

  const result = await createServiceOfferingForOrgUC(
    user.id,
    organization.id,
    orgToken,
    organization.displayName,
    organization.jurisdictionProvince,
    organization.jurisdictionLocality,
    input,
  );

  if ("error" in result) return { error: result.error };

  revalidatePath(`/org/${orgToken}/servicios`);
  redirect(`/org/${orgToken}/servicios`);
}

export async function approveServiceOfferingAction(
  publicToken: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.role !== "admin" && profile?.role !== "govt") {
    return { error: "Solo admin o govt pueden aprobar servicios." };
  }

  const result = await approveServiceOfferingForAuthorityUC(user.id, publicToken);
  if ("error" in result) return { error: result.error };

  revalidatePath("/admin/servicios");
  revalidatePath("/gob/servicios");
  return { error: null };
}

// ============================================================================
// Org-side lifecycle actions: pause / unpause / archive
// ============================================================================

export async function pauseServiceOfferingAction(
  orgToken: string,
  publicToken: string,
): Promise<ServiceOfferingResult> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const result = await pauseServiceOfferingUseCase(organization.id, publicToken);
  if ("error" in result) return result;

  revalidatePath(`/org/${orgToken}/servicios`);
  revalidatePath(`/org/${orgToken}/servicios/${publicToken}`);
  return { ok: true };
}

export async function unpauseServiceOfferingAction(
  orgToken: string,
  publicToken: string,
): Promise<ServiceOfferingResult> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const result = await unpauseServiceOfferingUseCase(organization.id, publicToken);
  if ("error" in result) return result;

  revalidatePath(`/org/${orgToken}/servicios`);
  revalidatePath(`/org/${orgToken}/servicios/${publicToken}`);
  return { ok: true };
}

export async function archiveServiceOfferingAction(
  orgToken: string,
  publicToken: string,
): Promise<ServiceOfferingResult> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const result = await archiveServiceOfferingUseCase(organization.id, publicToken);
  if ("error" in result) return result;

  revalidatePath(`/org/${orgToken}/servicios`);
  revalidatePath(`/org/${orgToken}/servicios/${publicToken}`);
  return { ok: true };
}

export async function rejectServiceOfferingAction(
  publicToken: string,
  rejectionReason: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.role !== "admin" && profile?.role !== "govt") {
    return { error: "Solo admin o govt pueden rechazar servicios." };
  }

  const result = await rejectServiceOfferingForAuthorityUC(user.id, publicToken, rejectionReason);
  if ("error" in result) return { error: result.error };

  revalidatePath("/admin/servicios");
  revalidatePath("/gob/servicios");
  return { error: null };
}

// ============================================================================
// Offering capacity update — ARCH-F
// ============================================================================

/**
 * Org-scoped server action: updates the capacity of a service offering.
 * The authenticated user must have the service_offering.create capability
 * on the org that owns the offering.
 */
export async function updateOfferingCapacityAction(
  orgToken: string,
  offeringPublicToken: string,
  newCapacity: number,
): Promise<UpdateCapacityResult> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const [offering] = await db
    .select({ id: serviceOfferings.id, status: serviceOfferings.status })
    .from(serviceOfferings)
    .where(
      and(
        eq(serviceOfferings.publicToken, offeringPublicToken),
        eq(serviceOfferings.organizationId, organization.id),
      ),
    )
    .limit(1);

  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.status === "archived") {
    return { error: "No podés modificar un servicio archivado." };
  }

  const result = await updateOfferingCapacityWriterUC(offering.id, newCapacity);
  if ("error" in result) return result;

  revalidatePath(`/org/${orgToken}/servicios`);
  revalidatePath(`/org/${orgToken}/servicios/${offeringPublicToken}`);
  revalidatePath(`/org/${orgToken}/servicios/${offeringPublicToken}/agenda`);
  revalidatePath(`/org/${orgToken}/agenda`);
  return result;
}
