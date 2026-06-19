// Compliance & enforcement metrics (Item 4) — read-time projections over the
// existing event log. NO new tables / event types / migrations.
//
// Spec: docs/superpowers/specs/2026-06-18-compliance-enforcement-metrics-design.md
// Umbrella: docs/superpowers/specs/2026-06-18-metrics-ia-handoff-design.md §3/§5/§7
//
// These are the enforcement-grade metrics almost no national system can publish
// because their registries are fragmented — MiMAR's single event log can:
//   C1 Microchip penetration            (Ley Prov 14.107 — chip is a legal artifact)
//   C2 ISO-validity rate                (Res. SENASA 284/2024 — ISO 11784/11785)
//   C5 Chip-fraud signal                (Estonia anti-theft rationale — flags for review)
//   C7 Dangerous-breed registry compliance (Ley CABA 4078 / Prov 14.107 — graceful 0%)
//   D4 Reunification rate               (UK ~39% benchmark)
//   D5 Seizures / decomisos             (Ley 14.346 enforcement throughput)
//
// All fetchers accept a ProjectionContext (actor + scope + period) and respect
// the viewer's jurisdiction scope:
//   admin → universal (no jurisdiction WHERE)
//   govt  → their assigned jurisdiction pairs only
//
// Scope + denominator primitives are single-sourced from lib/metrics/ (Item 0).
// k-anonymity suppression on locality-grouped output is enforced by
// lib/metrics/anonymity.ts → suppressedMetric (the SAME helper; no duplicate).
//
// Pattern B (AGENTS.md → Aggregation & privacy policy + Dashboards & projections):
// population-level SQL aggregates that read pets.status / denormalized columns
// rather than replaying events per pet. Audience: Sanitary authority (C1/C2/C5/C7)
// + Animal-welfare officer (D4/D5).

import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db, petEvents, petIdentifications, pets } from "@/db";
import {
  type Cell,
  type MetricResult,
  type ProjectionContext,
  type SuppressedCells,
  activePetsCondition,
  petsScopeClause,
  suppressedMetric,
} from "@/lib/metrics";

// Re-export so callers that import from this module don't need to change.
export type { ProjectionContext } from "@/lib/metrics";

/** True when a govt actor has zero assigned jurisdictions → return zero shapes, no DB hit. */
function govtWithoutScope(ctx: ProjectionContext): boolean {
  return ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0;
}

/** Round a fraction (0..1) to a whole-number percentage. */
function pct(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

// ---------------------------------------------------------------------------
// C1 — Microchip penetration
// ---------------------------------------------------------------------------
// chipped active pets / active pets, by jurisdiction (Ley Prov 14.107).
// Denominator is activePetsCondition(ctx) — the SAME shared definition rabies
// coverage + sterilization consume, so compliance rates can't drift apart.
// Numerator: active pets that have an ACTIVE microchip_iso identification row.

export type MicrochipPenetrationKpi = {
  /** % of active pets in scope with an active ISO microchip. */
  ratePct: number;
  /** Distinct active pets in scope with an active microchip_iso row. */
  chipped: number;
  /** Active pets in scope (denominator). */
  active: number;
  /**
   * Per-locality penetration, k-anonymity suppressed (cells < k=5 active pets
   * hidden). Cell extras carry `chipped` and `active` for the row.
   */
  byLocality: MetricResult<SuppressedCells>;
};

export async function fetchMicrochipPenetration(
  ctx: ProjectionContext,
): Promise<MicrochipPenetrationKpi> {
  const empty: MicrochipPenetrationKpi = {
    ratePct: 0,
    chipped: 0,
    active: 0,
    byLocality: { value: [] as unknown as SuppressedCells, suppressedCount: 0 },
  };
  if (govtWithoutScope(ctx)) return empty;

  const activeCond = activePetsCondition(ctx);

  // An active pet is "chipped" if it has ≥1 active microchip_iso identification.
  // EXISTS keeps the denominator/numerator on the SAME pet base (no fan-out).
  const chippedExists = sql`EXISTS (
    SELECT 1 FROM pet_identifications pi
    WHERE pi.pet_id = ${pets.id}
      AND pi.kind = 'microchip_iso'
      AND pi.status = 'active'
  )`;

  const [activeRows, chippedRows, localityRows] = await Promise.all([
    db.select({ n: count() }).from(pets).where(activeCond),
    db.select({ n: count() }).from(pets).where(and(activeCond, chippedExists)),
    db
      .select({
        locality: pets.jurisdictionLocality,
        active: count(),
        chipped: sql<number>`count(*) FILTER (WHERE ${chippedExists})::int`,
      })
      .from(pets)
      .where(activeCond)
      .groupBy(pets.jurisdictionLocality),
  ]);

  const active = activeRows[0]?.n ?? 0;
  const chipped = chippedRows[0]?.n ?? 0;

  // Locality breakdown → route through the SHARED k-anon helper. `count` is the
  // active-pet population of the cell (the k-anonymity denominator).
  const cells = localityRows.map((r) => ({
    key: r.locality ?? "—",
    count: r.active,
    chipped: Number(r.chipped),
    active: r.active,
    ratePct: pct(Number(r.chipped), r.active),
  }));
  const byLocality = suppressedMetric(cells as Cell[], {
    count: (c) => c.count,
    key: (c) => c.key,
  });

  return { ratePct: pct(chipped, active), chipped, active, byLocality };
}

// ---------------------------------------------------------------------------
// C2 — ISO-validity rate
// ---------------------------------------------------------------------------
// Of chipped pets, the fraction whose pet_identifications row has well-formed
// decomposed ISO fields (Res. SENASA 284/2024 — ISO 11784/11785).
// pet_identifications has no jurisdiction column → scope via JOIN to pets.

export type IsoValidityKpi = {
  /** % of chipped pets whose decomposed ISO fields are present + well-formed. */
  ratePct: number;
  /** Chipped pets with valid ISO decomposition. */
  valid: number;
  /** All chipped pets in scope (active microchip_iso rows). */
  chipped: number;
};

export async function fetchIsoValidity(ctx: ProjectionContext): Promise<IsoValidityKpi> {
  if (govtWithoutScope(ctx)) return { ratePct: 0, valid: 0, chipped: 0 };

  const scope = petsScopeClause(ctx);

  // A valid ISO decomposition requires all three subfields populated with the
  // correct char widths (3 / 4 / 8). char() columns are blank-padded, so trim.
  const validIso = sql`(
    pi.iso_country_code IS NOT NULL AND length(btrim(pi.iso_country_code)) = 3
    AND pi.iso_manufacturer_code IS NOT NULL AND length(btrim(pi.iso_manufacturer_code)) = 4
    AND pi.iso_national_id IS NOT NULL AND length(btrim(pi.iso_national_id)) = 8
  )`;

  const conditions = [sql`pi.kind = 'microchip_iso'`, sql`pi.status = 'active'`];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      chipped: sql<number>`count(*)::int`,
      valid: sql<number>`count(*) FILTER (WHERE ${validIso})::int`,
    })
    .from(sql`pet_identifications pi`)
    .innerJoin(pets, sql`${pets.id} = pi.pet_id`)
    .where(and(...conditions));

  const chipped = Number(rows[0]?.chipped ?? 0);
  const valid = Number(rows[0]?.valid ?? 0);
  return { ratePct: pct(valid, chipped), valid, chipped };
}

// ---------------------------------------------------------------------------
// C5 — Chip-fraud signal
// ---------------------------------------------------------------------------
// microchip_replaced events grouped by payload `reason`, highlighting
// fraud_detected + duplicate_detected. A COUNT, not a judgment: it flags for
// human review; it does not auto-classify fraud. Period-aware; scope via pet JOIN
// (replacement events don't carry jurisdiction in their payload).

/** Reasons surfaced for human review (the fraud/theft signal). */
const REVIEW_REASONS = ["fraud_detected", "duplicate_detected"] as const;

export type ChipReplacementSignal = {
  /** Total microchip_replaced events in scope + period. */
  total: number;
  /** Count per `reason` bucket. */
  byReason: Record<string, number>;
  /** fraud_detected + duplicate_detected — the human-review highlight. */
  flaggedForReview: number;
};

export async function fetchChipReplacementSignal(
  ctx: ProjectionContext,
): Promise<ChipReplacementSignal> {
  if (govtWithoutScope(ctx)) return { total: 0, byReason: {}, flaggedForReview: 0 };

  const scope = petsScopeClause(ctx);

  const conditions = [
    eq(petEvents.eventType, "microchip_replaced"),
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      reason: sql<string>`(${petEvents.payload}->>'reason')`,
      n: count(),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...conditions))
    .groupBy(sql`(${petEvents.payload}->>'reason')`);

  const byReason: Record<string, number> = {};
  let total = 0;
  let flaggedForReview = 0;
  for (const r of rows) {
    const reason = r.reason ?? "other";
    byReason[reason] = (byReason[reason] ?? 0) + r.n;
    total += r.n;
    if ((REVIEW_REASONS as readonly string[]).includes(reason)) flaggedForReview += r.n;
  }

  return { total, byReason, flaggedForReview };
}

// ---------------------------------------------------------------------------
// C7 — Dangerous-breed registry compliance (graceful 0%)
// ---------------------------------------------------------------------------
// PPP-flagged pets attested / all PPP-flagged pets (Ley CABA 4078 / Prov 14.107).
//
// GRACEFUL DEGRADATION (umbrella §7, closed decision): the dangerous_breed_attested
// writer-form may not exist yet. Until it ships, the attested numerator is 0, so
// C7 reads "0 attested / N flagged" = 0% — a TRUE and USEFUL compliance number
// ("registry adoption is 0%"), NOT a bug. When N=0 (no PPP pets in scope) the rate
// is 0% with flaggedCount=0; the UI labels that "sin PPP".

export type DangerousBreedComplianceKpi = {
  /** % of PPP-flagged pets in scope with a dangerous_breed_attested event. */
  ratePct: number;
  /** Distinct PPP-flagged pets in scope with ≥1 attestation event. */
  attested: number;
  /** PPP-flagged active pets in scope (denominator). 0 → "sin PPP" in the UI. */
  flaggedCount: number;
};

export async function fetchDangerousBreedCompliance(
  ctx: ProjectionContext,
): Promise<DangerousBreedComplianceKpi> {
  if (govtWithoutScope(ctx)) return { ratePct: 0, attested: 0, flaggedCount: 0 };

  // PPP-flagged pets in scope. Built on activePetsCondition so PPP compliance
  // and the other compliance rates share the same active-population base.
  const pppCond = and(activePetsCondition(ctx), eq(pets.potentiallyDangerousBreed, true));

  // Numerator: distinct PPP pets that have an attestation event. Until the
  // writer-form exists this is 0 — the honest registry-adoption signal.
  const attestedExists = sql`EXISTS (
    SELECT 1 FROM pet_events pe
    WHERE pe.pet_id = ${pets.id}
      AND pe.event_type = 'dangerous_breed_attested'
  )`;

  const [flaggedRows, attestedRows] = await Promise.all([
    db.select({ n: count() }).from(pets).where(pppCond),
    db.select({ n: count() }).from(pets).where(and(pppCond, attestedExists)),
  ]);

  const flaggedCount = flaggedRows[0]?.n ?? 0;
  const attested = attestedRows[0]?.n ?? 0;
  return { ratePct: pct(attested, flaggedCount), attested, flaggedCount };
}

// ---------------------------------------------------------------------------
// D4 — Reunification rate
// ---------------------------------------------------------------------------
// Lost episodes returned to active / all lost episodes; median days-to-recovery
// (UK ~39% benchmark). A lost EPISODE = a `status_changed → to_status='lost'`
// event in scope + period. Recovered = that pet's first post-lost transition is
// to_status='active'. Deceased excluded from the numerator. Scope via pet JOIN
// (status_changed payloads don't carry jurisdiction).

export type ReunificationKpi = {
  /** % of lost episodes that returned to active. */
  ratePct: number;
  /** Lost episodes that returned to active. */
  recovered: number;
  /** All lost episodes in scope + period (denominator). */
  lostEpisodes: number;
  /** Median days from lost → recovery across recovered episodes (0 if none). */
  medianDaysToRecovery: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function fetchReunificationRate(ctx: ProjectionContext): Promise<ReunificationKpi> {
  if (govtWithoutScope(ctx)) {
    return { ratePct: 0, recovered: 0, lostEpisodes: 0, medianDaysToRecovery: 0 };
  }

  const scope = petsScopeClause(ctx);

  // All lost episodes in scope + period: status_changed events to_status='lost'.
  const lostConditions = [
    eq(petEvents.eventType, "status_changed"),
    sql`(${petEvents.payload}->>'to_status') = 'lost'`,
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) lostConditions.push(sql`(${scope})`);

  const lostEvents = await db
    .select({ petId: petEvents.petId, lostAt: petEvents.occurredAt })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...lostConditions))
    .orderBy(petEvents.occurredAt);

  const lostEpisodes = lostEvents.length;
  if (lostEpisodes === 0) {
    return { ratePct: 0, recovered: 0, lostEpisodes: 0, medianDaysToRecovery: 0 };
  }

  // For each lost episode, find the FIRST status transition strictly after the
  // lost event for that pet. Recovered = that next transition is to 'active'.
  const petIds = [...new Set(lostEvents.map((e) => e.petId))];
  const transitions = await db
    .select({
      petId: petEvents.petId,
      toStatus: sql<string>`(${petEvents.payload}->>'to_status')`,
      at: petEvents.occurredAt,
    })
    .from(petEvents)
    .where(and(eq(petEvents.eventType, "status_changed"), inArray(petEvents.petId, petIds)))
    .orderBy(petEvents.occurredAt);

  const transitionsByPet = new Map<string, Array<{ toStatus: string; at: Date }>>();
  for (const t of transitions) {
    const arr = transitionsByPet.get(t.petId) ?? [];
    arr.push({ toStatus: t.toStatus, at: t.at });
    transitionsByPet.set(t.petId, arr);
  }

  let recovered = 0;
  const recoveryDays: number[] = [];
  for (const episode of lostEvents) {
    const after = (transitionsByPet.get(episode.petId) ?? []).filter(
      (t) => t.at.getTime() > episode.lostAt.getTime(),
    );
    const next = after[0];
    if (next && next.toStatus === "active") {
      recovered += 1;
      recoveryDays.push((next.at.getTime() - episode.lostAt.getTime()) / DAY_MS);
    }
  }

  return {
    ratePct: pct(recovered, lostEpisodes),
    recovered,
    lostEpisodes,
    medianDaysToRecovery: median(recoveryDays),
  };
}

/** Median of a numeric array, rounded to whole days. 0 for an empty array. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(m);
}

// ---------------------------------------------------------------------------
// D5 — Seizures (decomisos)
// ---------------------------------------------------------------------------
// shelter_intake_recorded events with payload intake_reason='seizure', grouped
// by seizure_motive, period-aware (Ley 14.346 enforcement throughput). Scope via
// pet JOIN (intake events don't carry jurisdiction in their payload).

export type SeizuresKpi = {
  /** Total seizure intakes in scope + period. */
  total: number;
  /** Count per seizure_motive. */
  byMotive: Array<{ motive: string; count: number }>;
};

export async function fetchSeizures(ctx: ProjectionContext): Promise<SeizuresKpi> {
  if (govtWithoutScope(ctx)) return { total: 0, byMotive: [] };

  const scope = petsScopeClause(ctx);

  const conditions = [
    eq(petEvents.eventType, "shelter_intake_recorded"),
    sql`(${petEvents.payload}->>'intake_reason') = 'seizure'`,
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      motive: sql<string>`COALESCE(${petEvents.payload}->>'seizure_motive', 'otro')`,
      n: count(),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...conditions))
    .groupBy(sql`COALESCE(${petEvents.payload}->>'seizure_motive', 'otro')`);

  const byMotive = rows
    .map((r) => ({ motive: r.motive, count: r.n }))
    .sort((a, b) => b.count - a.count);
  const total = byMotive.reduce((sum, m) => sum + m.count, 0);

  return { total, byMotive };
}
