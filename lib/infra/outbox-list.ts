// Outbox list helpers — pure logic for the admin outbox list and detail pages.
//
// All functions here are pure and testable without a DB connection.
// The actual Drizzle query lives in the page components to keep this file
// importable in test environments.

import type { OutboxStatus } from "@/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BreachCue = "delivered" | "ok" | "breach" | "failed";

export interface OutboxListFilters {
  status?: string;
  target_kind?: string;
  breach?: string;
  province?: string;
}

/**
 * Builds the DB update payload for the retry-now admin action.
 * Pure helper — lives here (not in `app/admin/outbox/actions.ts`) because
 * the actions file is `"use server"` and can only export async functions.
 */
export function buildRetryPayload(): { nextRetryAt: Date; status: "pending" } {
  return {
    nextRetryAt: new Date(),
    status: "pending",
  };
}

// ---------------------------------------------------------------------------
// Pure predicates
// ---------------------------------------------------------------------------

/**
 * Returns true when an outbox row is in SLA breach:
 * status must be 'pending' AND slaDueAt must be in the past.
 */
export function isSlaBreached(status: OutboxStatus, slaDueAt: Date): boolean {
  if (status !== "pending") return false;
  return slaDueAt.getTime() < Date.now();
}

/**
 * Honest status wording for an external-authority row whose transmission has
 * no receiving endpoint yet (C2 language contract, 2026-07-22 — PO-locked
 * phrasing; promoted from footnote to STATUS on 2026-08-02, G7).
 *
 * One constant feeds both the status label and the delivery note so the two
 * renderings can never drift apart.
 */
export const ENO_PENDING_TRANSMISSION_STATUS =
  "Registrada y auditada — transmisión a la autoridad pendiente de endpoint receptor";

/**
 * ENO honest-delivery note (C2 language contract, 2026-07-22 — PO-locked).
 *
 * Our outbox pipeline genuinely generates, queues, SLA-tracks and audit-logs
 * every ENO notification (AGENTS.md: "Measures OUR outbox pipeline, not
 * external delivery"). But an eno_authority row completes its pipeline leg
 * with status 'delivered' — which a reader parses as "the health authority
 * received this", when no external receiving endpoint exists yet. This note
 * states reality instead of implying external transmission, and deliberately
 * never says "próximamente" (the pipeline is real and running TODAY; only the
 * external leg is missing). Returns null for every other target_kind —
 * govt_webhook/audit_export/internal_dashboard all resolve to a real,
 * already-built destination with no such gap.
 */
export function enoExternalDeliveryNote(targetKind: string): string | null {
  if (targetKind !== "eno_authority") return null;
  return `${ENO_PENDING_TRANSMISSION_STATUS}.`;
}

/**
 * G7 (2026-08-02): TRUE for exactly the rows whose "Entregado" label was a
 * lie — status 'delivered' on a target_kind with no external receiving
 * endpoint (today only eno_authority; anchored on enoExternalDeliveryNote so
 * the endpoint-less class has ONE definition). 'delivered' there means OUR
 * outbox pipeline processed and audit-logged the row (lib/infra/
 * outbox-drainer.ts v1 no-op handler) — the external authority never
 * received anything. Never true for pending/failed (those labels are honest
 * as-is) nor for the internal target kinds, whose 'delivered' is genuine.
 */
export function isPendingExternalTransmission(status: OutboxStatus, targetKind: string): boolean {
  return status === "delivered" && enoExternalDeliveryNote(targetKind) !== null;
}

/**
 * Maps an outbox status to a human-readable Spanish label.
 *
 * Pass the row's `targetKind` whenever a CONCRETE row is being labeled: a
 * 'delivered' eno_authority row then reads the honest pending-transmission
 * state instead of "Entregado" (G7 — enoExternalDeliveryNote documents why
 * "Entregado" is a lie for that class). Omitting `targetKind` is only valid
 * for kind-agnostic contexts (the status <select> options in
 * lib/ui/outbox-filter-axes.ts), where no row exists to be honest about.
 */
export function buildStatusLabel(status: OutboxStatus, targetKind?: string): string {
  if (targetKind !== undefined && isPendingExternalTransmission(status, targetKind)) {
    return ENO_PENDING_TRANSMISSION_STATUS;
  }
  switch (status) {
    case "delivered":
      return "Entregado";
    case "failed":
      return "Fallido";
    case "pending":
      return "Pendiente";
    default: {
      const _exhaustive: never = status;
      return String(_exhaustive);
    }
  }
}

/**
 * Returns a traffic-light cue value for a row based on its status and SLA deadline.
 *
 * Cue values (rendered in page.tsx as emoji or color classes):
 *   "delivered" — row is delivered (green)
 *   "ok"        — pending and within SLA (amber)
 *   "breach"    — pending and past SLA (red)
 *   "failed"    — terminal failure (black/error)
 */
export function buildBreachCue(status: OutboxStatus, slaDueAt: Date): BreachCue {
  switch (status) {
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    case "pending":
      return isSlaBreached(status, slaDueAt) ? "breach" : "ok";
    default: {
      const _exhaustive: never = status;
      return String(_exhaustive) as BreachCue;
    }
  }
}

// ---------------------------------------------------------------------------
// Filter predicate (JS-side filtering after DB fetch, like auditoria pattern)
// ---------------------------------------------------------------------------

/**
 * Applies in-memory filters to a list of outbox rows.
 * DB fetches LIMIT 200 ordered by created_at DESC; this does JS-side narrowing.
 */
export function applyOutboxFilters<
  T extends {
    status: OutboxStatus;
    targetKind: string;
    slaDueAt: Date;
    targetJurisdictionProvince: string | null;
  },
>(rows: T[], filters: OutboxListFilters): T[] {
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.target_kind && row.targetKind !== filters.target_kind) return false;
    if (filters.province && row.targetJurisdictionProvince !== filters.province) return false;
    if (filters.breach === "yes" && !isSlaBreached(row.status, row.slaDueAt)) return false;
    if (filters.breach === "no" && isSlaBreached(row.status, row.slaDueAt)) return false;
    return true;
  });
}
