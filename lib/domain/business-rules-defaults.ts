// Hardcoded defaults for govt business rules (POC scope).
// Spec 2026-05-19-govt-business-rules-poc-design §4.2.
//
// The resolver in lib/business-rules-resolver.ts returns one of these when
// no per-jurisdiction override row exists. Defaults snapshot the pre-POC
// behavior so the rollout is non-breaking.

import { POTENTIALLY_DANGEROUS_DOG_BREEDS } from "@/lib/reference/breeds";

export interface PppBreedList {
  /** Canonical breed labels (matches lib/breeds.ts entries). */
  breeds: string[];
}

export interface PppWeightThreshold {
  /** kg cutoff. null = no weight rule. */
  kg: number | null;
  /** When true, the threshold applies even to breeds NOT on ppp_breed_list. */
  appliesIfBreedNotPPP: boolean;
}

export interface PppAttestationRegistry {
  id: string;
  label: string;
  required: boolean;
}

export interface PppAttestationRequiredRegistries {
  registries: PppAttestationRegistry[];
}

export interface PhysicalCredentialProvider {
  enabled: boolean;
  providerName?: string;
  providerUrl?: string;
}

export interface PhysicalCredentialChannels {
  printable_qr: boolean;
  engraved_plate: PhysicalCredentialProvider;
  nfc_tag: PhysicalCredentialProvider;
}

export interface MicrochipRequired {
  /** Whether this jurisdiction requires a microchip. Default TRUE. */
  required: boolean;
}

// ---------------------------------------------------------------------------
// Promoted rule types (design ADR-2/ADR-4) — hardcoded operational constants
// promoted to per-jurisdiction-overridable rules. Each default snapshots the
// CURRENT constant so rollout is non-breaking (R4.2): no override anywhere
// -> resolveBusinessRule returns exactly what the old literal returned.
// ---------------------------------------------------------------------------

export interface RabiesObservationWindow {
  /** Legal rabies-observation window, in days. Was RABIES_OBSERVATION_WINDOW_DAYS. */
  days: number;
}

export interface DueSoonWindow {
  /** "Próximo a vencer" lookahead window, in days. Was DUE_SOON_WINDOW_DAYS. */
  days: number;
}

export interface ReminderWindows {
  /** Global reminder lookahead, in days. Was WINDOW_AHEAD_DAYS. */
  aheadDays: number;
}

export interface LongStayDays {
  /** Shelter long-stay threshold, in days. Was LONG_STAY_DAYS. */
  days: number;
}

// ---------------------------------------------------------------------------
// mpf_export_format (jurisdiction-compliance, 2026-07-22 "MPF export format
// cascade") — which format the welfare MPF (fiscalía) denuncia PDF export
// uses for a jurisdiction. Cascades locality > province > country > national
// default like every other rule type. Replaces the old CABA-only
// MPF_CONFIGURED_PROVINCES gate (lib/domain/mpf-jurisdiction.ts, removed):
// every jurisdiction can now export; this rule decides WHICH format they get.
//
// HONESTY CONSTRAINT: the codebase renders exactly ONE PDF shape today (the
// free-form Ley 14.346 document, decision F-D1 in lib/analytics/welfare-
// exports.ts) — so the enum ships with exactly one legal value,
// "estandar_nacional". No second fiscalía format is invented here; adding one
// later means widening MPF_EXPORT_FORMATS + the CHECK constraint + a new
// renderer branch, and the cascade (this rule type) already exists to roll it
// out per-jurisdiction when that day comes.
// ---------------------------------------------------------------------------

export const MPF_EXPORT_FORMATS = ["estandar_nacional"] as const;
export type MpfExportFormatId = (typeof MPF_EXPORT_FORMATS)[number];

export interface MpfExportFormat {
  format: MpfExportFormatId;
}

export interface BusinessRulePayloadByType {
  ppp_breed_list: PppBreedList;
  ppp_weight_threshold: PppWeightThreshold;
  ppp_attestation_required_registries: PppAttestationRequiredRegistries;
  physical_credential_channels: PhysicalCredentialChannels;
  microchip_required: MicrochipRequired;
  rabies_observation_window: RabiesObservationWindow;
  due_soon_window: DueSoonWindow;
  reminder_windows: ReminderWindows;
  long_stay_days: LongStayDays;
  mpf_export_format: MpfExportFormat;
}

export type BusinessRulePayload<T extends keyof BusinessRulePayloadByType> =
  BusinessRulePayloadByType[T];

export const BUSINESS_RULES_DEFAULTS: {
  [K in keyof BusinessRulePayloadByType]: BusinessRulePayloadByType[K];
} = {
  ppp_breed_list: {
    breeds: [...POTENTIALLY_DANGEROUS_DOG_BREEDS],
  },
  ppp_weight_threshold: {
    kg: null,
    appliesIfBreedNotPPP: false,
  },
  ppp_attestation_required_registries: {
    registries: [],
  },
  physical_credential_channels: {
    printable_qr: true,
    engraved_plate: { enabled: false },
    nfc_tag: { enabled: false },
  },
  // Default TRUE — every jurisdiction requires a microchip until one opts out,
  // preserving the pre-gate universal microchip obligation (migration 0150).
  microchip_required: { required: true },
  rabies_observation_window: { days: 10 },
  due_soon_window: { days: 30 },
  reminder_windows: { aheadDays: 14 },
  long_stay_days: { days: 60 },
  // The only format the codebase renders today — see the module docblock
  // above for why the enum has exactly one member.
  mpf_export_format: { format: "estandar_nacional" },
};
