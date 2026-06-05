"use server";

// Coverage-zone management actions for the org portal.
//
// Auth gate: requireOrgAccessByToken + role ∈ {admin, coordinator}.
// All mutations are scoped to the resolved org id — callers cannot target
// coverage rows from other orgs.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, organizationCoverage } from "@/db";
import { listLocalitiesByProvince } from "@/lib/ar-localidades";
import { PROVINCES, type ProvinceCode, provinceByName } from "@/lib/ar-provincias";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { isManagerRole } from "@/lib/org-roles";

// ============================================================================
// Shared helpers
// ============================================================================

type ActionResult = { ok: true } | { error: string };

// Canonical province names as a fast lookup set (widened to string for has() compatibility).
const VALID_PROVINCE_NAMES: ReadonlySet<string> = new Set<string>(PROVINCES.map((p) => p.name));

// ============================================================================
// addCoverageZoneAction
// ============================================================================

export type AddCoverageZoneInput = {
  orgToken: string;
  /** Canonical province name (e.g. "Buenos Aires", "CABA"). */
  province: string;
  /** Locality name as returned by listLocalitiesByProvince. null = whole-province. */
  locality: string | null;
};

export async function addCoverageZoneAction(input: AddCoverageZoneInput): Promise<ActionResult> {
  const { organization, membership } = await requireOrgAccessByToken(input.orgToken);

  if (!isManagerRole(membership.role)) {
    return { error: "Solo administradores y coordinadores pueden gestionar zonas de cobertura." };
  }

  // Validate province name.
  if (!VALID_PROVINCE_NAMES.has(input.province)) {
    return { error: "La provincia indicada no es válida." };
  }

  // Validate locality (if provided) belongs to the province.
  if (input.locality !== null) {
    const provinceObj = provinceByName(input.province);
    if (!provinceObj) {
      return { error: "La provincia indicada no es válida." };
    }
    const localities = await listLocalitiesByProvince(provinceObj.code as ProvinceCode);
    const match = localities.find((l) => l.name === input.locality);
    if (!match) {
      return { error: "La localidad indicada no pertenece a la provincia seleccionada." };
    }
  }

  // Idempotency: reject if the same (org, province, locality) already exists.
  const existing = await db
    .select({ id: organizationCoverage.id })
    .from(organizationCoverage)
    .where(
      and(
        eq(organizationCoverage.organizationId, organization.id),
        eq(organizationCoverage.jurisdictionProvince, input.province),
        input.locality === null
          ? isNull(organizationCoverage.jurisdictionLocality)
          : eq(organizationCoverage.jurisdictionLocality, input.locality),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { error: "Esa zona ya está registrada para esta organización." };
  }

  await db.insert(organizationCoverage).values({
    organizationId: organization.id,
    jurisdictionProvince: input.province,
    jurisdictionLocality: input.locality,
  });

  revalidatePath(`/org/${input.orgToken}/cobertura`);
  return { ok: true };
}

// ============================================================================
// removeCoverageZoneAction
// ============================================================================

export type RemoveCoverageZoneInput = {
  orgToken: string;
  coverageId: string;
};

export async function removeCoverageZoneAction(
  input: RemoveCoverageZoneInput,
): Promise<ActionResult> {
  const { organization, membership } = await requireOrgAccessByToken(input.orgToken);

  if (!isManagerRole(membership.role)) {
    return { error: "Solo administradores y coordinadores pueden gestionar zonas de cobertura." };
  }

  // W2: fold the ownership check into the DELETE WHERE so there is no
  // TOCTOU window between the ownership SELECT and the actual DELETE.
  // Drizzle does not expose affected-row count directly, so we use
  // a returning() clause: if zero rows come back, the row either
  // didn't exist or belonged to another org.
  const deleted = await db
    .delete(organizationCoverage)
    .where(
      and(
        eq(organizationCoverage.id, input.coverageId),
        eq(organizationCoverage.organizationId, organization.id),
      ),
    )
    .returning({ id: organizationCoverage.id });

  if (deleted.length === 0) {
    return { error: "Zona no encontrada." };
  }

  revalidatePath(`/org/${input.orgToken}/cobertura`);
  return { ok: true };
}

// ============================================================================
// setPrimaryCoverageZoneAction
// ============================================================================

export type SetPrimaryInput = {
  orgToken: string;
  coverageId: string;
};

export async function setPrimaryCoverageZoneAction(input: SetPrimaryInput): Promise<ActionResult> {
  const { organization, membership } = await requireOrgAccessByToken(input.orgToken);

  if (!isManagerRole(membership.role)) {
    return { error: "Solo administradores y coordinadores pueden gestionar zonas de cobertura." };
  }

  // W2: move the ownership verification inside the transaction and scope
  // the target UPDATE by organizationId so no TOCTOU window exists.
  // The two-step pattern is: clear all isPrimary for this org, then atomically
  // set the target — but only if that row also belongs to this org.
  // Using returning() on the second UPDATE to detect "not found or wrong org".
  const result = await db.transaction(async (tx) => {
    // Clear all isPrimary flags for this org.
    await tx
      .update(organizationCoverage)
      .set({ isPrimary: false })
      .where(eq(organizationCoverage.organizationId, organization.id));

    // Set the target row primary — scoped by both id AND organizationId.
    const updated = await tx
      .update(organizationCoverage)
      .set({ isPrimary: true })
      .where(
        and(
          eq(organizationCoverage.id, input.coverageId),
          eq(organizationCoverage.organizationId, organization.id),
        ),
      )
      .returning({ id: organizationCoverage.id });

    return updated;
  });

  if (result.length === 0) {
    return { error: "Zona no encontrada." };
  }

  revalidatePath(`/org/${input.orgToken}/cobertura`);
  return { ok: true };
}
