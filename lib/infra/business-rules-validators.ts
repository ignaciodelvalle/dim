// Zod validators per rule_type. Spec 2026-05-19 §4.4.
//
// INSERT/UPDATE of govt_business_rules MUST validate `rule_payload` against
// the schema for its `rule_type` before persisting. Garbage in → 400.

import { z } from "zod";

import type { GovtBusinessRuleType } from "@/db";

export const pppBreedListSchema = z
  .object({
    breeds: z.array(z.string().min(1).max(80)).min(0).max(100),
  })
  .strict();

export const pppWeightThresholdSchema = z
  .object({
    kg: z.number().min(0).max(200).nullable(),
    appliesIfBreedNotPPP: z.boolean(),
  })
  .strict();

export const pppAttestationRequiredRegistriesSchema = z
  .object({
    registries: z
      .array(
        z
          .object({
            id: z.string().min(2).max(40),
            label: z.string().min(2).max(120),
            required: z.boolean(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

const physicalCredentialProviderSchema = z
  .object({
    enabled: z.boolean(),
    providerName: z.string().min(1).max(120).optional(),
    providerUrl: z.string().url().max(300).optional(),
  })
  .strict()
  .refine((p) => !p.enabled || (p.providerName != null && p.providerUrl != null), {
    message: "Proveedor (nombre + URL) requerido cuando el canal está habilitado.",
  });

export const physicalCredentialChannelsSchema = z
  .object({
    printable_qr: z.boolean(),
    engraved_plate: physicalCredentialProviderSchema,
    nfc_tag: physicalCredentialProviderSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Promoted rule types (design ADR-2/ADR-4, R4.1) — see
// lib/domain/business-rules-defaults.ts for the payload shapes + rationale.
// ---------------------------------------------------------------------------

export const rabiesObservationWindowSchema = z
  .object({ days: z.number().int().min(1).max(60) })
  .strict();

export const dueSoonWindowSchema = z.object({ days: z.number().int().min(1).max(365) }).strict();

const reminderWindowCadenceSchema = z
  .object({
    vaccineType: z.string().min(1).max(80),
    aheadDays: z.number().int().min(1).max(365),
  })
  .strict();

export const reminderWindowsSchema = z
  .object({
    aheadDays: z.number().int().min(1).max(90),
    cadences: z.array(reminderWindowCadenceSchema).max(50),
  })
  .strict();

export const longStayDaysSchema = z.object({ days: z.number().int().min(1).max(365) }).strict();

export const BUSINESS_RULE_VALIDATORS: Record<GovtBusinessRuleType, z.ZodSchema> = {
  ppp_breed_list: pppBreedListSchema,
  ppp_weight_threshold: pppWeightThresholdSchema,
  ppp_attestation_required_registries: pppAttestationRequiredRegistriesSchema,
  physical_credential_channels: physicalCredentialChannelsSchema,
  rabies_observation_window: rabiesObservationWindowSchema,
  due_soon_window: dueSoonWindowSchema,
  reminder_windows: reminderWindowsSchema,
  long_stay_days: longStayDaysSchema,
};

export function validateRulePayload(
  ruleType: GovtBusinessRuleType,
  payload: unknown,
): { ok: true; data: unknown } | { ok: false; error: string } {
  const validator = BUSINESS_RULE_VALIDATORS[ruleType];
  const parsed = validator.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true, data: parsed.data };
}
