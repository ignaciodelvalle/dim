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
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { parseRegistriesJson } from "@/lib/parse-registries";

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
  // Each rule type encodes its payload as form fields. Parsing logic lives
  // here so the action stays declarative — validators run after.
  switch (ruleType) {
    case "ppp_breed_list": {
      const breeds = (formData.getAll("breeds") as string[])
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return { breeds };
    }
    case "ppp_weight_threshold": {
      const kgRaw = (formData.get("kg") as string | null)?.trim();
      const kg = kgRaw && kgRaw !== "" ? Number.parseFloat(kgRaw) : null;
      const appliesIfBreedNotPPP = formData.get("appliesIfBreedNotPPP") === "on";
      return { kg, appliesIfBreedNotPPP };
    }
    case "ppp_attestation_required_registries": {
      // Registries are serialised as a single JSON string (reorder-safe).
      const raw = formData.get("registriesJson") as string | null;
      const registries = parseRegistriesJson(raw);
      return { registries };
    }
    case "physical_credential_channels": {
      const printable_qr = formData.get("printable_qr") === "on";

      function parseProvider(channel: string) {
        const enabled = formData.get(`enabled_${channel}`) === "on";
        const providerNameRaw = (formData.get(`provider_name_${channel}`) as string | null)?.trim();
        const providerUrlRaw = (formData.get(`provider_url_${channel}`) as string | null)?.trim();
        return {
          enabled,
          ...(providerNameRaw ? { providerName: providerNameRaw } : {}),
          ...(providerUrlRaw ? { providerUrl: providerUrlRaw } : {}),
        };
      }

      return {
        printable_qr,
        engraved_plate: parseProvider("engraved_plate"),
        nfc_tag: parseProvider("nfc_tag"),
      };
    }
  }
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
    `/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}/reglas`,
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
    `/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}/reglas`,
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
    `/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province || "_")}/${encodeURIComponent(locality || "_")}/reglas`,
  );
}
