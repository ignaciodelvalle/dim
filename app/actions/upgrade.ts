"use server";

// upgrade.ts — thin shim (strangler migration 7/61).
//
// Business logic moved to:
//   src/modules/organizations/application/upgrade/
//
// This file re-exports the ForUser writers (used by integration tests and
// other server actions) and provides thin Action wrappers (used by UI
// components) that add the auth guard + revalidatePath/redirect.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db, organizations } from "@/db";
import { canonicalProvinceNameForStorage } from "@/lib/domain/jurisdiction-canonical";
import { createClient } from "@/lib/supabase/server";
import { createOrganizationForUser as _createOrg } from "@/src/modules/organizations/application/upgrade/create-organization";
import { requestVetUpgradeForUser as _requestVetUpgrade } from "@/src/modules/organizations/application/upgrade/request-vet-upgrade";
import type {
  CreateOrganizationInput,
  UpgradeFormState,
  VetUpgradeInput,
} from "@/src/modules/organizations/application/upgrade/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  VetUpgradeInput,
  CreateOrganizationInput,
  UpgradeFormState,
} from "@/src/modules/organizations/application/upgrade/types";

// ---------------------------------------------------------------------------
// ForUser re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function requestVetUpgradeForUser(
  userId: string,
  input: VetUpgradeInput,
): Promise<UpgradeFormState> {
  return _requestVetUpgrade(userId, input);
}

export async function createOrganizationForUser(
  userId: string,
  input: CreateOrganizationInput,
): Promise<UpgradeFormState> {
  return _createOrg(userId, input);
}

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

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

  return _requestVetUpgrade(user.id, {
    matriculaNumber: String(formData.get("matriculaNumber") ?? "").trim(),
    matriculaJurisdiccion: String(formData.get("matriculaJurisdiccion") ?? "").trim(),
    // LocationFields (l1) submits provinceCode (ISO) + localityName; keep the
    // legacy free-text names as fallback. canonicalProvinceNameForStorage
    // normalizes either shape to the canonical province display name.
    operationalProvince:
      canonicalProvinceNameForStorage(
        String(formData.get("provinceCode") ?? "").trim() ||
          String(formData.get("operationalProvince") ?? "").trim(),
      ) ?? "",
    operationalLocality:
      String(formData.get("localityName") ?? "").trim() ||
      String(formData.get("operationalLocality") ?? "").trim(),
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
    // LocationFields (l1) submits the ISO code as `provinceCode` + the display
    // name as `localityName`. Legacy free-text inputs submitted these under
    // `jurisdictionProvince` / `jurisdictionLocality`. canonicalProvinceNameForStorage
    // accepts any shape and returns the canonical display name (lib/jurisdiction-canonical.ts).
    jurisdictionProvince:
      canonicalProvinceNameForStorage(
        String(formData.get("provinceCode") ?? "").trim() ||
          String(formData.get("jurisdictionProvince") ?? "").trim(),
      ) ?? "",
    jurisdictionLocality:
      String(formData.get("localityName") ?? "").trim() ||
      String(formData.get("jurisdictionLocality") ?? "").trim(),
    personeriaJuridicaNumber: String(formData.get("personeriaJuridicaNumber") ?? "").trim() || null,
  };

  const result = await _createOrg(user.id, input);
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
    jurisdictionProvince:
      canonicalProvinceNameForStorage(
        String(formData.get("provinceCode") ?? "").trim() ||
          String(formData.get("jurisdictionProvince") ?? "").trim(),
      ) ?? "",
    jurisdictionLocality:
      String(formData.get("localityName") ?? "").trim() ||
      String(formData.get("jurisdictionLocality") ?? "").trim(),
    personeriaJuridicaNumber: String(formData.get("personeriaJuridicaNumber") ?? "").trim() || null,
  };

  const result = await _createOrg(user.id, input);
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
