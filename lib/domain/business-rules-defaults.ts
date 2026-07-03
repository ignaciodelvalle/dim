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

export interface ReminderWindowCadence {
  vaccineType: string;
  aheadDays: number;
}

export interface ReminderWindows {
  /** Global reminder lookahead, in days. Was WINDOW_AHEAD_DAYS. */
  aheadDays: number;
  /**
   * Per-vaccine cadence overrides (R4.7) — validated independently, but not
   * yet editable from the console UI (no per-vaccine cadence concept exists
   * in the current consumer). Defaults to empty; extensible without a schema
   * change once a UI/consumer for it ships.
   */
  cadences: ReminderWindowCadence[];
}

export interface LongStayDays {
  /** Shelter long-stay threshold, in days. Was LONG_STAY_DAYS. */
  days: number;
}

export interface BusinessRulePayloadByType {
  ppp_breed_list: PppBreedList;
  ppp_weight_threshold: PppWeightThreshold;
  ppp_attestation_required_registries: PppAttestationRequiredRegistries;
  physical_credential_channels: PhysicalCredentialChannels;
  rabies_observation_window: RabiesObservationWindow;
  due_soon_window: DueSoonWindow;
  reminder_windows: ReminderWindows;
  long_stay_days: LongStayDays;
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
  rabies_observation_window: { days: 10 },
  due_soon_window: { days: 30 },
  reminder_windows: { aheadDays: 14, cadences: [] },
  long_stay_days: { days: 60 },
};
