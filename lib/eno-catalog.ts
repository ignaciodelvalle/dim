// ENO catalog — Enfermedades de Notificación Obligatoria (Argentina).
//
// Source: spec 2026-05-21-eno-pipeline-design.md (ENO-D1 = A — Lista corta core).
// Decision ENO-D1: 5 zoonotic diseases + severity tiers critical/high.
// These are NOT the same as the vaccine catalog in lib/vaccine-reminder-state.ts.
//
// DO NOT add diseases here without updating the spec. The list is locked per
// ENO-D1 (2026-05-21).
//
// Legal framework: SENASA + ministerios provinciales bajo Decreto 1228/2018 + Ley 27.305.

export type EnoDisease = {
  /** Stable key used for indexing and payload discrimination. */
  code: string;
  /** Display name in Spanish. */
  label: string;
  /** Notification severity — drives badge color in govt inbox. */
  severity: "critical" | "high";
  /** Legal SLA window (hours) for notifying the govt authority. */
  notifyHours: number;
  /**
   * When true, the owner is NOT auto-notified.
   * The vet communicates the diagnosis directly to preserve the sensitive
   * clinical context (ENO-D4 = B — stigma filter).
   */
  stigmaSensitive: boolean;
  /** Legal anchor cited in the audit trail and future govt UI. */
  legalAnchor: string;
};

export const ENO_DISEASES_AR: readonly EnoDisease[] = [
  {
    code: "rabies",
    label: "Rabia",
    severity: "critical",
    notifyHours: 24,
    stigmaSensitive: false,
    legalAnchor: "Ley 22.953 (control rabia)",
  },
  {
    code: "leptospirosis",
    label: "Leptospirosis",
    severity: "high",
    notifyHours: 48,
    stigmaSensitive: false,
    legalAnchor: "Ley 27.305 (zoonosis)",
  },
  {
    code: "hidatidosis",
    label: "Hidatidosis / Equinococosis",
    severity: "high",
    notifyHours: 48,
    stigmaSensitive: false,
    legalAnchor: "Ley 27.305 + Res. SENASA 422/2003",
  },
  {
    code: "brucelosis_canina",
    label: "Brucelosis canina",
    severity: "high",
    notifyHours: 72,
    stigmaSensitive: true, // owner may experience social stigma
    legalAnchor: "Res. SENASA 374/2003",
  },
  {
    code: "leishmaniasis",
    label: "Leishmaniasis visceral canina",
    severity: "critical",
    notifyHours: 48,
    stigmaSensitive: true, // stigma from human-health risk + impact on pet
    legalAnchor: "Res. SENASA 405/2017",
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const _indexByCode = new Map<string, EnoDisease>(ENO_DISEASES_AR.map((d) => [d.code, d]));

/**
 * Returns the EnoDisease for a given code, or null if not in the catalog.
 * O(1) via map — safe to call in hot paths.
 */
export function getEnoDisease(code: string): EnoDisease | null {
  return _indexByCode.get(code) ?? null;
}

/**
 * Returns true when the given disease_code is in the ENO catalog.
 * Use this for early-exit guards before calling getEnoDisease.
 */
export function isEnoCode(code: string): boolean {
  return _indexByCode.has(code);
}
