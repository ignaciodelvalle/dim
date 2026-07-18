// lib/analytics/policy-outcome.ts — Policy→outcome loop (Task #44.2).
//
// Rule changes are auditable facts: every govt_business_rules mutation writes
// an audit_log row (govt_business_rule_created / _updated / _deleted) whose
// payload carries the rule type and the affected jurisdiction (see
// src/modules/organizations/application/business-rules/*.ts). This module
// correlates each rule change with the movement of ONE mapped aggregate event
// metric in the SAME jurisdiction over symmetric windows before/after the
// change:
//
//   "rule R changed in J on date X → metric M moved from B to A (Δ%)"
//
// TERRITORIAL / TEMPORAL ONLY — RED LINE (Ley 25.326 / habeas data)
// -----------------------------------------------------------------
// Inputs and outputs are aggregate event COUNTS per jurisdiction+window.
// No per-citizen series exists here, and none may ever be added. This is a
// correlation display, not causal attribution — the UI must label it so.
//
// SCOPING
// -------
// Rules are stored with the canonical province display name (same canonical
// set as pets.jurisdiction_province — migration 0055/0116 check constraints),
// so a scoped count joins pet_events → pets on the pet's CURRENT jurisdiction.
// This mirrors the scope-security review 2026-07-04 (Part A2) convention in
// lib/analytics/govt-dashboards.ts: current-jurisdiction EXISTS, not the
// payload snapshot (most event types don't carry a payload snapshot).
// National rules (province NULL) count platform-wide.
//
// K-ANONYMITY
// -----------
// A before/after pair where BOTH windows count < 5 events is flagged
// `suppressed` — the UI masks the raw numbers ("<5") and skips the delta.
// This matches the k=5 policy in lib/metrics/anonymity.ts.

import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

// POOL: analyticsDb (session pooler), NOT the OLTP transaction pooler — these are
// read-only multi-statement dashboard aggregates. supavisor transaction mode (6543)
// has a measured >100x pathology for this fan-out shape (db/index.ts); session mode
// serves it normally. Locally analyticsDb falls back to DATABASE_URL (identical dev/test).
import { type GovtBusinessRuleType, auditLog, analyticsDb as db, petEvents } from "@/db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Symmetric observation window on each side of the rule change. */
export const POLICY_OUTCOME_WINDOW_DAYS = 60;

/** k=5 small-cell policy (AGENTS.md "Aggregation & privacy policy"). */
export const POLICY_OUTCOME_K_ANON = 5;

/** Max rule changes analyzed per page load (2 COUNT queries each). */
export const POLICY_OUTCOME_MAX_CHANGES = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

const RULE_CHANGE_ACTIONS = [
  "govt_business_rule_created",
  "govt_business_rule_updated",
  "govt_business_rule_deleted",
] as const;

export type RuleChangeAction = (typeof RULE_CHANGE_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Rule type → observed outcome metric mapping
// ---------------------------------------------------------------------------

export type RuleOutcomeMetric = {
  /** pet_events.event_type whose jurisdiction-scoped count is observed. */
  eventType: string;
  /** es-AR label shown in the UI ("Métrica observada" column). */
  metricLabel: string;
  /** Why this metric is the observable for this rule type (docs/tests). */
  rationale: string;
};

/**
 * One observed metric per rule type. Every entry reuses an EXISTING event
 * type from db/schema.ts EVENT_TYPES — no new event semantics are invented.
 * The mapping is intentionally coarse: it answers "did the activity this rule
 * governs move after the change?", nothing finer.
 */
export const RULE_OUTCOME_METRICS: Record<GovtBusinessRuleType, RuleOutcomeMetric> = {
  ppp_breed_list: {
    eventType: "dangerous_breed_attested",
    metricLabel: "Certificaciones PPP",
    rationale: "The breed list defines who must attest — attestation volume is its direct output.",
  },
  ppp_weight_threshold: {
    eventType: "dangerous_breed_attested",
    metricLabel: "Certificaciones PPP",
    rationale: "The weight threshold widens/narrows the PPP-attestation population.",
  },
  ppp_attestation_required_registries: {
    eventType: "dangerous_breed_attested",
    metricLabel: "Certificaciones PPP",
    rationale: "Registry requirements change the attestation burden.",
  },
  physical_credential_channels: {
    eventType: "credential_scanned",
    metricLabel: "Escaneos de credencial",
    rationale:
      "Channel availability drives physical credential usage; scans are its observable trace.",
  },
  rabies_observation_window: {
    eventType: "rabies_observation_started",
    metricLabel: "Observaciones antirrábicas iniciadas",
    rationale: "The window length governs when observations open after a bite.",
  },
  due_soon_window: {
    eventType: "vaccination_administered",
    metricLabel: "Vacunaciones registradas",
    rationale: "Due-soon windows exist to prompt timely vaccination.",
  },
  reminder_windows: {
    eventType: "vaccination_administered",
    metricLabel: "Vacunaciones registradas",
    rationale: "Reminder cadence exists to prompt timely vaccination.",
  },
  long_stay_days: {
    eventType: "adoption_application_resolved",
    metricLabel: "Solicitudes de adopción resueltas",
    rationale: "Long-stay thresholds exist to accelerate placement decisions.",
  },
};

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested, DB-free)
// ---------------------------------------------------------------------------

export type OutcomeWindows = {
  /** [changedAt - windowDays, changedAt) */
  before: { since: Date; until: Date };
  /** [changedAt, min(changedAt + windowDays, now)) */
  after: { since: Date; until: Date };
  /** Days actually covered by the after-window (< windowDays when recent). */
  afterDaysCovered: number;
  /** True when the after-window is shorter than windowDays (change too recent). */
  partialAfter: boolean;
};

/**
 * Symmetric observation windows around a rule change. The after-window is
 * clamped to `now` and disclosed as partial so a fresh change never fakes a
 * full-window comparison.
 */
export function windowsAround(
  changedAt: Date,
  now: Date,
  windowDays: number = POLICY_OUTCOME_WINDOW_DAYS,
): OutcomeWindows {
  const windowMs = windowDays * DAY_MS;
  const afterUntil = new Date(Math.min(changedAt.getTime() + windowMs, now.getTime()));
  const afterDaysCovered = Math.max(
    0,
    Math.round((afterUntil.getTime() - changedAt.getTime()) / DAY_MS),
  );
  return {
    before: { since: new Date(changedAt.getTime() - windowMs), until: changedAt },
    after: { since: changedAt, until: afterUntil },
    afterDaysCovered,
    partialAfter: afterDaysCovered < windowDays,
  };
}

/**
 * Percent movement of the after-count vs the before-count, one decimal.
 * Returns null when the before-window is 0 — no meaningful baseline
 * (same zero-baseline convention as lib/metrics/targets.ts computeDeltaPct,
 * except the "no baseline" case is surfaced as null instead of 0 so the UI
 * can show "sin línea de base" honestly).
 */
export function outcomeDelta(before: number, after: number): number | null {
  if (before === 0) return null;
  return Math.round(((after - before) / before) * 1000) / 10;
}

/** k-anon mask: both windows under k → the pair must not be displayed raw. */
export function isSuppressedPair(
  before: number,
  after: number,
  k: number = POLICY_OUTCOME_K_ANON,
): boolean {
  return before < k && after < k;
}

// ---------------------------------------------------------------------------
// DB fetchers (admin-only surface — the page guards with requireAdminOrRedirect)
// ---------------------------------------------------------------------------

export type RuleChangeRow = {
  auditId: string;
  action: RuleChangeAction;
  ruleType: GovtBusinessRuleType;
  /** Canonical province display name, or null for national rules. */
  province: string | null;
  locality: string | null;
  changedAt: Date;
};

/**
 * Recent govt_business_rules mutations from the audit log, newest first.
 * Payload fields were written by the business-rules writers
 * (create/update/delete-business-rule.ts) — ruleType + jurisdiction.
 */
export async function fetchRuleChanges(
  limit: number = POLICY_OUTCOME_MAX_CHANGES,
): Promise<RuleChangeRow[]> {
  const rows = await db
    .select({
      auditId: auditLog.id,
      action: auditLog.action,
      ruleType: sql<string | null>`${auditLog.payload}->>'ruleType'`,
      province: sql<string | null>`${auditLog.payload}->'jurisdiction'->>'province'`,
      locality: sql<string | null>`${auditLog.payload}->'jurisdiction'->>'locality'`,
      changedAt: auditLog.performedAt,
    })
    .from(auditLog)
    .where(inArray(auditLog.action, [...RULE_CHANGE_ACTIONS]))
    .orderBy(desc(auditLog.performedAt))
    .limit(limit);

  return rows
    .filter((r): r is typeof r & { ruleType: string } => r.ruleType !== null)
    .filter((r) => r.ruleType in RULE_OUTCOME_METRICS)
    .map((r) => ({
      auditId: r.auditId,
      action: r.action as RuleChangeAction,
      ruleType: r.ruleType as GovtBusinessRuleType,
      province: r.province,
      locality: r.locality,
      changedAt: r.changedAt,
    }));
}

/**
 * Count pet_events of `eventType` in [since, until), scoped to the rule's
 * jurisdiction via the pet's CURRENT jurisdiction (scope-security review
 * 2026-07-04 A2 convention). National rules (province null) count everything.
 */
async function countEventsInWindow(
  eventType: string,
  window: { since: Date; until: Date },
  province: string | null,
  locality: string | null,
): Promise<number> {
  const conditions = [
    eq(petEvents.eventType, eventType),
    gte(petEvents.occurredAt, window.since),
    lt(petEvents.occurredAt, window.until),
  ];
  if (province) {
    const localityClause = locality ? sql` AND p.jurisdiction_locality = ${locality}` : sql``;
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM pets p
        WHERE p.id = ${petEvents.petId}
          AND p.jurisdiction_province = ${province}${localityClause}
      )`,
    );
  }
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(petEvents)
    .where(and(...conditions));
  return Number(row?.n ?? 0);
}

export type PolicyOutcomeRow = RuleChangeRow & {
  metricLabel: string;
  eventType: string;
  /** Event count in the before-window. Mask when `suppressed`. */
  before: number;
  /** Event count in the after-window. Mask when `suppressed`. */
  after: number;
  /** Percent movement, or null when before === 0 (no baseline). */
  deltaPct: number | null;
  afterDaysCovered: number;
  partialAfter: boolean;
  /** k-anon: both windows < 5 — the UI must not show the raw pair. */
  suppressed: boolean;
};

/**
 * The policy→outcome table: recent rule changes each paired with the movement
 * of their mapped metric in the affected jurisdiction.
 */
export async function fetchPolicyOutcomes(
  opts: { limit?: number; windowDays?: number; now?: Date } = {},
): Promise<PolicyOutcomeRow[]> {
  const windowDays = opts.windowDays ?? POLICY_OUTCOME_WINDOW_DAYS;
  const now = opts.now ?? new Date();
  const changes = await fetchRuleChanges(opts.limit);

  return Promise.all(
    changes.map(async (change) => {
      const metric = RULE_OUTCOME_METRICS[change.ruleType];
      const windows = windowsAround(change.changedAt, now, windowDays);
      const [before, after] = await Promise.all([
        countEventsInWindow(metric.eventType, windows.before, change.province, change.locality),
        countEventsInWindow(metric.eventType, windows.after, change.province, change.locality),
      ]);
      return {
        ...change,
        metricLabel: metric.metricLabel,
        eventType: metric.eventType,
        before,
        after,
        deltaPct: outcomeDelta(before, after),
        afterDaysCovered: windows.afterDaysCovered,
        partialAfter: windows.partialAfter,
        suppressed: isSuppressedPair(before, after),
      };
    }),
  );
}
