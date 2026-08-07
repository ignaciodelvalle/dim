// Notification list ordering + grouping — pure, testable projection helpers.
//
// The /notificaciones page fetches a chronologically ordered page (keyset
// pagination on created_at,id). These helpers reshape THAT page for display:
//   1. sortNotificationsForDisplay — severity-first, then recency (the inbox
//      floats urgent items to the top of the current page).
//   2. groupNotifications — collapses ≥3 same-pet+type rows into one group.
//
// Both are non-mutating. The caller keeps its SQL-ordered `rows` intact because
// the keyset cursor is derived from the SQL order's last row, NOT from the
// display order — reordering in place would corrupt "Ver más antiguos".

import type { Notification, Pet } from "@/db";

export type NotificationRow = { notification: Notification; pet: Pet | null };

// ---------------------------------------------------------------------------
// Severity ordering
// ---------------------------------------------------------------------------

// Inbox priority: urgent surfaces first, info last. Lower number = higher up.
const SEVERITY_RANK: Record<Notification["severity"], number> = {
  urgent: 0,
  warning: 1,
  success: 2,
  info: 3,
};

export function severityRank(severity: Notification["severity"]): number {
  return SEVERITY_RANK[severity] ?? SEVERITY_RANK.info;
}

/**
 * Order a page of rows for display: highest severity first, then most recent,
 * then id descending as a stable tiebreak (mirrors the SQL keyset order's
 * secondary sort). Returns a NEW array — the input is never mutated, so the
 * caller's chronologically ordered page stays valid for keyset pagination.
 */
export function sortNotificationsForDisplay(rows: NotificationRow[]): NotificationRow[] {
  return [...rows].sort((a, b) => {
    const rankDelta = severityRank(a.notification.severity) - severityRank(b.notification.severity);
    if (rankDelta !== 0) return rankDelta;
    const tsDelta = b.notification.createdAt.getTime() - a.notification.createdAt.getTime();
    if (tsDelta !== 0) return tsDelta;
    return b.notification.id.localeCompare(a.notification.id);
  });
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

const GROUP_MIN = 3;

export type Group =
  | { kind: "single"; row: NotificationRow }
  | { kind: "group"; leader: NotificationRow; rest: NotificationRow[] };

/**
 * Collapse runs of the same (relatedPetId, notificationType) into one group
 * once there are at least GROUP_MIN of them. Adjacency-independent: rows are
 * bucketed by key wherever they appear, so a prior severity sort does not
 * fragment a group — the group leader is simply the first instance in the
 * incoming order (i.e. the highest-priority one after sortNotificationsForDisplay).
 */
export function groupNotifications(rows: NotificationRow[]): Group[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.notification.relatedPetId ?? "_"}|${row.notification.notificationType}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: Group[] = [];
  const seenBuckets = new Map<string, NotificationRow[]>();
  for (const row of rows) {
    const key = `${row.notification.relatedPetId ?? "_"}|${row.notification.notificationType}`;
    const total = counts.get(key) ?? 0;
    if (total < GROUP_MIN) {
      result.push({ kind: "single", row });
      continue;
    }
    const existing = seenBuckets.get(key);
    if (existing) {
      existing.push(row);
      continue;
    }
    const rest: NotificationRow[] = [];
    seenBuckets.set(key, rest);
    result.push({ kind: "group", leader: row, rest });
  }
  return result;
}
