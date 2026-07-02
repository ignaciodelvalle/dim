"use server";

// business-rules.ts — thin shim (strangler migration 15/61).
//
// Business logic moved to:
//   src/modules/organizations/application/business-rules/
//
// This file re-exports all writer functions (used by integration tests)
// and provides thin Action wrappers (used by UI components) that add
// the auth guard + redirect.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { redirect } from "next/navigation";

import { GOVT_BUSINESS_RULE_TYPES, type GovtBusinessRuleType } from "@/db";
import { getRuleTypeDef } from "@/lib/domain/rule-types-registry";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";

import { createBusinessRuleWriter as _createBusinessRuleWriter } from "@/src/modules/organizations/application/business-rules/create-business-rule";
import { deleteBusinessRuleWriter as _deleteBusinessRuleWriter } from "@/src/modules/organizations/application/business-rules/delete-business-rule";
import type {
  BusinessRuleFormState,
  CreateBusinessRuleResult,
  CreateBusinessRuleWriterParams,
  DeleteBusinessRuleWriterParams,
  UpdateBusinessRuleWriterParams,
} from "@/src/modules/organizations/application/business-rules/types";
import { updateBusinessRuleWriter as _updateBusinessRuleWriter } from "@/src/modules/organizations/application/business-rules/update-business-rule";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  BusinessRuleFormState,
  CreateBusinessRuleResult,
  CreateBusinessRuleWriterParams,
  DeleteBusinessRuleWriterParams,
  UpdateBusinessRuleWriterParams,
} from "@/src/modules/organizations/application/business-rules/types";

// ---------------------------------------------------------------------------
// Writer re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function createBusinessRuleWriter(
  params: CreateBusinessRuleWriterParams,
): Promise<CreateBusinessRuleResult> {
  return _createBusinessRuleWriter(params);
}

export async function updateBusinessRuleWriter(
  params: UpdateBusinessRuleWriterParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return _updateBusinessRuleWriter(params);
}

export async function deleteBusinessRuleWriter(
  params: DeleteBusinessRuleWriterParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return _deleteBusinessRuleWriter(params);
}

// ---------------------------------------------------------------------------
// Private helpers (controller-only — form data parsing)
// ---------------------------------------------------------------------------

function normalizeJurisdiction(formData: FormData): {
  country: string;
  province: string | null;
  locality: string | null;
} {
  const country = (formData.get("jurisdictionCountry") as string | null)?.trim() || "AR";
  const provinceRaw = (formData.get("jurisdictionProvince") as string | null)?.trim();
  const localityRaw = (formData.get("jurisdictionLocality") as string | null)?.trim();
  return {
    country,
    province: provinceRaw && provinceRaw !== "" ? provinceRaw : null,
    locality: localityRaw && localityRaw !== "" ? localityRaw : null,
  };
}

function parseLegalAnchorIds(formData: FormData): string[] {
  return (formData.getAll("legalAnchorIds") as string[])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Form-bound actions (admin-gated)
// ---------------------------------------------------------------------------

function parseRulePayloadFromForm(ruleType: GovtBusinessRuleType, formData: FormData): unknown {
  // Parsing logic per rule type lives in the registry (lib/domain/rule-types-
  // registry.ts) so the action stays declarative — validators run after.
  return getRuleTypeDef(ruleType).parseFromForm(formData);
}

export async function createBusinessRuleAction(
  _previous: BusinessRuleFormState,
  formData: FormData,
): Promise<BusinessRuleFormState> {
  const { user } = await requireAdminOrRedirect();

  const ruleTypeRaw = String(formData.get("ruleType") ?? "").trim();
  if (!(GOVT_BUSINESS_RULE_TYPES as readonly string[]).includes(ruleTypeRaw)) {
    return { error: "Rule type inválido" };
  }
  const ruleType = ruleTypeRaw as GovtBusinessRuleType;

  const { country, province, locality } = normalizeJurisdiction(formData);
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  const legalAnchorIds = parseLegalAnchorIds(formData);

  const result = await _createBusinessRuleWriter({
    actorUserId: user.id,
    ruleType,
    jurisdictionCountry: country,
    jurisdictionProvince: province,
    jurisdictionLocality: locality,
    rulePayload: parseRulePayloadFromForm(ruleType, formData),
    notes,
    legalAnchorIds,
  });
  if (!result.ok) return { error: result.error };
  if (result.noOp) {
    return { error: null, warning: result.reason };
  }
  redirect(
    `/gob/reglas/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}`,
  );
}

export async function updateBusinessRuleAction(
  ruleId: string,
  _previous: BusinessRuleFormState,
  formData: FormData,
): Promise<BusinessRuleFormState> {
  const { user } = await requireAdminOrRedirect();

  const ruleTypeRaw = String(formData.get("ruleType") ?? "").trim();
  if (!(GOVT_BUSINESS_RULE_TYPES as readonly string[]).includes(ruleTypeRaw)) {
    return { error: "Rule type inválido" };
  }
  const ruleType = ruleTypeRaw as GovtBusinessRuleType;
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  const legalAnchorIds = parseLegalAnchorIds(formData);

  const result = await _updateBusinessRuleWriter({
    actorUserId: user.id,
    ruleId,
    rulePayload: parseRulePayloadFromForm(ruleType, formData),
    notes,
    legalAnchorIds,
  });
  if (!result.ok) return { error: result.error };

  const { country, province, locality } = normalizeJurisdiction(formData);
  redirect(
    `/gob/reglas/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}`,
  );
}

export async function deleteBusinessRuleAction(ruleId: string, formData: FormData): Promise<void> {
  const { user } = await requireAdminOrRedirect();
  const reason = (formData.get("reason") as string | null)?.trim() ?? "";
  const result = await _deleteBusinessRuleWriter({ actorUserId: user.id, ruleId, reason });
  if (!result.ok) throw new Error(result.error);
  const country = (formData.get("jurisdictionCountry") as string | null) ?? "AR";
  const province = (formData.get("jurisdictionProvince") as string | null) ?? "_";
  const locality = (formData.get("jurisdictionLocality") as string | null) ?? "_";
  redirect(
    `/gob/reglas/${encodeURIComponent(country)}/${encodeURIComponent(province || "_")}/${encodeURIComponent(locality || "_")}`,
  );
}
