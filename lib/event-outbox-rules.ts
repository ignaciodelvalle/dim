// ENO event outbox rules — maps EventType to outbox target(s) with SLA hours.
//
// Each rule declares:
//   - target_kind: which delivery channel to use (matches outbox_target_kind DB enum)
//   - slaHours(payload): returns the SLA window in hours, or null when this
//     event+payload combination does NOT warrant an outbox row.
//   - buildSnapshot (optional): produce a custom payload snapshot; defaults to
//     the full event payload when omitted.
//
// OUTBOX_RULES is a Partial<Record<EventType, OutboxRule[]>> — only event types
// that have at least one outbox target appear here. All other event types are
// silent (no outbox row).
//
// Spec: docs/superpowers/plans/2026-05-22-event-trust-tier-1.md §4 C.3

import type { EventType } from "@/db/schema";
import { diseaseCodeToEnoCode, getEnoDisease } from "./eno-catalog";

/**
 * Returns the ENO catalog disease for a given diseases.ts disease_code, or
 * null if the code is not in the ENO catalog (non-ENO disease or unknown code).
 *
 * Uses the canonical `diseaseCodeToEnoCode` bridge from `lib/eno-catalog.ts`
 * so the form-code → ENO-code mapping is shared with `lib/eno-trigger.ts`.
 */
function getEnoForDiseaseCode(diseaseCode: string) {
  return getEnoDisease(diseaseCodeToEnoCode(diseaseCode));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutboxTargetKind =
  | "govt_webhook"
  | "eno_authority"
  | "audit_export"
  | "internal_dashboard";

export interface OutboxRule {
  /** Which delivery channel this rule targets. */
  target_kind: OutboxTargetKind;

  /**
   * Returns the SLA window in hours for this event/payload, or null when this
   * rule should NOT produce an outbox row (the event does not require
   * notification to this target kind for this payload shape).
   */
  slaHours(payload: Record<string, unknown>): number | null;

  /**
   * Optional: produce a custom snapshot for the outbox row. When omitted,
   * enqueueOutboxForEvent stores the full event payload as-is.
   */
  buildSnapshot?: (payload: Record<string, unknown>) => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

/**
 * Rule for clinical_info_logged → sub_kind='disease_diagnosis'.
 *
 * Fires only when:
 *   1. payload.sub_kind === 'disease_diagnosis'
 *   2. payload.disease_code is in the ENO catalog
 *
 * SLA = disease.notifyHours from ENO_DISEASES_AR.
 */
const clinicalInfoLoggedGovtWebhook: OutboxRule = {
  target_kind: "govt_webhook",
  slaHours(payload) {
    if (payload.sub_kind !== "disease_diagnosis") return null;
    const diseaseCode = typeof payload.disease_code === "string" ? payload.disease_code : null;
    if (!diseaseCode) return null;
    const disease = getEnoForDiseaseCode(diseaseCode);
    if (!disease) return null;
    return disease.notifyHours;
  },
};

/**
 * Rule for outbreak_signal → govt_webhook.
 *
 * Fires only when the signal's disease_code maps to a disease in the ENO
 * catalog (i.e., severity is 'critical' or 'high'). All ENO catalog diseases
 * warrant a 24-hour notification window regardless of notifyHours — the outbox
 * SLA here is the notification-to-authority window, which is uniformly 24h
 * for the outbreak-signal path (the signal itself is already a derived alert).
 *
 * Returns null for disease codes not in the ENO catalog.
 */
const outbreakSignalGovtWebhook: OutboxRule = {
  target_kind: "govt_webhook",
  slaHours(payload) {
    const diseaseCode = typeof payload.disease_code === "string" ? payload.disease_code : null;
    if (!diseaseCode) return null;
    const disease = getEnoForDiseaseCode(diseaseCode);
    if (!disease) return null;
    // Outbreak signals from ENO diseases always warrant 24h govt notification.
    return 24;
  },
};

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

export const OUTBOX_RULES: Partial<Record<EventType, OutboxRule[]>> = {
  clinical_info_logged: [clinicalInfoLoggedGovtWebhook],
  outbreak_signal: [outbreakSignalGovtWebhook],
};
