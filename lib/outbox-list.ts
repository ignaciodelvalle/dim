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
 * Maps an outbox status to a human-readable Spanish label.
 */
export function buildStatusLabel(status: OutboxStatus): string {
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
