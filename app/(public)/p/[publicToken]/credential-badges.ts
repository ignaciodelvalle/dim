// Pure badge derivations for the PUBLIC credential (Tier 0 / Tier 2).
//
// WAVE D1 (Invariant #3 — "a correction supersedes everywhere"): a stranger
// scanning the QR must see the CORRECTED value of an amended clinical event,
// exactly like the authenticated libreta does. These helpers take the RAW
// fetched stream (the amendable clinical events PLUS the pet's `event_amended`
// rows) and fold corrections via overlayAmendments BEFORE deriving each badge —
// so a corrected vaccine name / date flips the public credential, not just the
// owner's timeline.
//
// overlayAmendments also upcasts each payload (single read-boundary helper), so
// a historical row's shape is normalized before the badge reads it.
//
// Kept pure + co-located (no DB, no React) so the "corrected vaccination flips
// the public badge" contract is unit-testable without rendering the page.

import { overlayAmendments } from "@/lib/infra/amendment";

/** Minimal event shape overlayAmendments needs. `occurredAt` is required by the
 *  overlay's latest-wins comparison on the `event_amended` rows. */
export type CredentialEvent = {
  id: string;
  eventType: string;
  occurredAt: Date | string;
  payload: unknown;
};

// countActiveVaccineNames (Tier 2 "vacunas vigentes" v1 — a 12-month distinct
// name dedupe) was REMOVED (staging validation 2026-07-04, bug 3): its counts
// contradicted the owner libreta for the same pet. The Tier 2 vaccine summary
// now derives from the SAME shared function the owner path uses —
// computeVaccinationSummary (lib/domain/libreta-health-status.ts) — with
// overlayAmendments folded by the caller (page.tsx).

/**
 * Active medications (Tier 2): `medication_started` events with no referencing
 * `medication_stopped`, surfaced by CORRECTED `drug_name`. Same shape as
 * computeMedicationsActive (lib/domain/libreta-health-status.ts) but scoped to
 * the public credential. Pass medication_started/stopped rows + `event_amended`.
 */
export function deriveActiveMedications(events: CredentialEvent[]): string[] {
  const projected = overlayAmendments(events);

  const stoppedIds = new Set<string>();
  for (const e of projected) {
    if (e.eventType !== "medication_stopped") continue;
    const sid = (e.payload as { medication_started_event_id?: unknown })
      ?.medication_started_event_id;
    if (typeof sid === "string") stoppedIds.add(sid);
  }

  const active: string[] = [];
  for (const e of projected) {
    if (e.eventType !== "medication_started") continue;
    if (stoppedIds.has(e.id)) continue;
    const drug = (e.payload as { drug_name?: unknown })?.drug_name;
    if (typeof drug === "string" && drug.trim()) active.push(drug.trim());
  }
  return active;
}

/**
 * Rabies-at-risk flag for the service-dog banner (Art. 8, Ley 26.858): the pet's
 * most recent rabies vaccination is expired. Reads the CORRECTED `vaccine_name`
 * and `next_due_at` so amending a mistyped rabies dose (name or due date) flips
 * the public warning. Conservative heuristic (false negatives OK — soft warning
 * only).
 *
 * "Expired" means `next_due_at < now`, the same due-ness test the owner-side
 * derivation applies (computeVaccinationSummary marks a dose `expired` when its
 * next_due_at is in the past). The vaccination_administered schema writes
 * `next_due_at`; there is no `valid_until` key — reading it left this banner
 * permanently dark (lint:events ghost-key finding).
 *
 * Pass the pet's `vaccination_administered` rows (any recency) + `event_amended`.
 */
export function isRabiesAtRisk(events: CredentialEvent[], now: Date): boolean {
  const vaccinations = overlayAmendments(events)
    .filter((e) => e.eventType === "vaccination_administered")
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const latest = vaccinations[0];
  if (!latest) return false;

  const payload = latest.payload as { vaccine_name?: string; next_due_at?: string };
  if (!payload?.vaccine_name?.toLowerCase().includes("rabia") || !payload.next_due_at) {
    return false;
  }
  const nextDueAt = new Date(payload.next_due_at);
  return !Number.isNaN(nextDueAt.getTime()) && nextDueAt < now;
}
