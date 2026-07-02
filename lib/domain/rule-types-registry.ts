// Generalized rule-type registry — the linchpin of the admin-rules-console
// change (design ADR-2). Turns `govt_business_rules` from per-type
// hardcoding into a data + one-form-component system.
//
// Pure module — safe to import from client AND server code. It intentionally
// imports schemas from `lib/infra/business-rules-validators` (which itself has
// NO db import — only zod + an erased type import), so pulling it into a
// client bundle does not drag in the resolver/db bundle. This mirrors why
// `lib/infra/breeds-server.ts` is kept separate from `lib/breeds.ts`.
//
// Replaces:
//   - the 3 duplicated RULE_TYPE_LABEL maps (gob/reglas/page.tsx,
//     jurisdicciones/.../reglas/page.tsx x2)
//   - the RULE_TYPE_DESCRIPTION map
//   - the `parseRulePayloadFromForm` switch (app/actions/business-rules.ts)
//   - the RULE_TYPES_NOT_YET_AVAILABLE set (superseded by the form-component
//     map in app/gob/reglas/.../forms/index.ts — "has a form" now means
//     "has an entry in that map", not a flag duplicated here)
//
// Adding a rule type = 1 entry here + (if enforced) 1 effect hook in
// lib/infra/rule-types-effects.ts + 1 form component + (if new) 1 migration.
// The 4 "promoted" rule types (rabies_observation_window, due_soon_window,
// reminder_windows, long_stay_days) are added by a later commit alongside
// their schemas/defaults/migration — see db/migrations for the CHECK
// constraint widening.

import type { GovtBusinessRuleType } from "@/db";
import {
  BUSINESS_RULES_DEFAULTS,
  type BusinessRulePayloadByType,
} from "@/lib/domain/business-rules-defaults";
import { BUSINESS_RULE_VALIDATORS } from "@/lib/infra/business-rules-validators";
import { parseRegistriesJson } from "@/lib/infra/parse-registries";
import type { z } from "zod";

/**
 * Drives how a rule type's write-consumer resolves the applicable
 * jurisdiction (design ADR-4):
 *   - "pet"                — resolved per-pet, via the pet's own jurisdiction.
 *   - "org"                — resolved per-org, via the org's jurisdiction.
 *   - "jurisdiction-metric" — resolved per jurisdiction GROUP in an aggregate
 *                             projection; falls back to country-level for
 *                             cross-jurisdiction ("global") aggregates.
 *   - "global"              — resolved once, country-level only (no per-row
 *                             jurisdictional variance — e.g. a cron sweep).
 */
export type RuleResolutionScope = "pet" | "org" | "jurisdiction-metric" | "global";

export interface RuleTypeDef<T extends GovtBusinessRuleType = GovtBusinessRuleType> {
  id: T;
  /** es-AR display label. */
  label: string;
  /** Consumer-facing description (shown in the "missing types" list). */
  description: string;
  /** `.strict()` Zod validator — same instance BUSINESS_RULE_VALIDATORS uses. */
  schema: z.ZodSchema;
  /** Hardcoded default payload — the resolver's fallback tier. */
  default: BusinessRulePayloadByType[T];
  /** Parse this rule type's payload out of a submitted <form>. */
  parseFromForm: (formData: FormData) => unknown;
  resolutionScope: RuleResolutionScope;
}

function parseProviderChannel(formData: FormData, channel: string) {
  const enabled = formData.get(`enabled_${channel}`) === "on";
  const providerNameRaw = (formData.get(`provider_name_${channel}`) as string | null)?.trim();
  const providerUrlRaw = (formData.get(`provider_url_${channel}`) as string | null)?.trim();
  return {
    enabled,
    ...(providerNameRaw ? { providerName: providerNameRaw } : {}),
    ...(providerUrlRaw ? { providerUrl: providerUrlRaw } : {}),
  };
}

export const RULE_TYPE_REGISTRY: { [K in GovtBusinessRuleType]: RuleTypeDef<K> } = {
  ppp_breed_list: {
    id: "ppp_breed_list",
    label: "Lista de razas PPP",
    description: "Qué razas se consideran Potencialmente Peligrosas en esta jurisdicción.",
    schema: BUSINESS_RULE_VALIDATORS.ppp_breed_list,
    default: BUSINESS_RULES_DEFAULTS.ppp_breed_list,
    resolutionScope: "pet",
    parseFromForm: (formData) => {
      const breeds = (formData.getAll("breeds") as string[])
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return { breeds };
    },
  },
  ppp_weight_threshold: {
    id: "ppp_weight_threshold",
    label: "Umbral de peso PPP",
    description: "Si el peso del animal por sí solo dispara el status PPP, y a qué kilos.",
    schema: BUSINESS_RULE_VALIDATORS.ppp_weight_threshold,
    default: BUSINESS_RULES_DEFAULTS.ppp_weight_threshold,
    resolutionScope: "pet",
    parseFromForm: (formData) => {
      const kgRaw = (formData.get("kg") as string | null)?.trim();
      const kg = kgRaw && kgRaw !== "" ? Number.parseFloat(kgRaw) : null;
      const appliesIfBreedNotPPP = formData.get("appliesIfBreedNotPPP") === "on";
      return { kg, appliesIfBreedNotPPP };
    },
  },
  ppp_attestation_required_registries: {
    id: "ppp_attestation_required_registries",
    label: "Registros de atestación requeridos",
    description: "En qué registros oficiales el dueño debe atestar a su mascota PPP.",
    schema: BUSINESS_RULE_VALIDATORS.ppp_attestation_required_registries,
    default: BUSINESS_RULES_DEFAULTS.ppp_attestation_required_registries,
    resolutionScope: "pet",
    parseFromForm: (formData) => {
      const raw = formData.get("registriesJson") as string | null;
      return { registries: parseRegistriesJson(raw) };
    },
  },
  physical_credential_channels: {
    id: "physical_credential_channels",
    label: "Canales de credencial física",
    description:
      "Qué canales de emisión de credencial física están habilitados (QR imprimible, placa grabada, NFC).",
    schema: BUSINESS_RULE_VALIDATORS.physical_credential_channels,
    default: BUSINESS_RULES_DEFAULTS.physical_credential_channels,
    resolutionScope: "pet",
    parseFromForm: (formData) => {
      const printable_qr = formData.get("printable_qr") === "on";
      return {
        printable_qr,
        engraved_plate: parseProviderChannel(formData, "engraved_plate"),
        nfc_tag: parseProviderChannel(formData, "nfc_tag"),
      };
    },
  },
};

export function getRuleTypeDef<T extends GovtBusinessRuleType>(ruleType: T): RuleTypeDef<T> {
  return RULE_TYPE_REGISTRY[ruleType] as RuleTypeDef<T>;
}
