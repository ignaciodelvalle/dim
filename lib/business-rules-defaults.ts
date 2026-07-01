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

export interface BusinessRulePayloadByType {
  ppp_breed_list: PppBreedList;
  ppp_weight_threshold: PppWeightThreshold;
  ppp_attestation_required_registries: PppAttestationRequiredRegistries;
  physical_credential_channels: PhysicalCredentialChannels;
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
};
