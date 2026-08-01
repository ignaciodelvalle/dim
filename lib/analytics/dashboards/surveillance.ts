// Read helpers for the /gob regional dashboards (Fase 11) — vigilancia /
// surveillance domain (outbreak signals, zoonosis trend, cases per
// locality/subregion/capita, outbreak history).
// Split out of lib/analytics/govt-dashboards.ts (engram refactor/govt-dashboards-split).
//
// All helpers accept the actor + jurisdictions tuple already produced by
// requireAdminOrGovtOrRedirect — admin sees universal scope (jurisdictions
// is empty by contract for admin), govt sees only rows matching one of their
// active assignments.

import { type SQL, and, count, desc, eq, gte, lt, sql } from "drizzle-orm";

import { cases, analyticsDb as db, jurisdictionsCensus, petEvents, pets } from "@/db";
import type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";
import { suppressSmallCells } from "@/lib/metrics";
import { provinceByCode } from "@/lib/reference/ar-provincias";
import { findDisease } from "@/lib/reference/diseases";
import { aggregateRowsByDepartment } from "../subregion-aggregate";
import type { SubregionCaseCount } from "../subregion-redaction";
import {
  DAY_MS,
  casesScopeClause,
  outbreakSignalScopeClause,
  petsCurrentJurisdictionClause,
  petsScopeClause,
} from "./_scope";

export type SurveillanceFilters = {
  /** Inclusive lower bound for occurredAt. */
  since: Date;
  /** Optional disease_code narrow filter. */
  diseaseCode?: string | null;
  /**
   * Admin province drill-down (Panorama). Only set when actor.role === "admin"
   * and a province was selected via the URL. Govt callers must NOT pass this —
   * their scope is already enforced by the jurisdiction pairs.
   */
  adminProvince?: string;
  adminLocality?: string;
};

export type SurveillanceSignal = {
  signalEventId: string;
  petId: string;
  petPublicToken: string;
  petName: string;
  petSpecies: string;
  diseaseCode: string;
  diseaseName: string;
  province: string | null;
  locality: string | null;
  detectedAt: Date;
  // Provenance for confidence tier computation (plan §A.5, 2026-05-22).
  // Stored here so consumers can call computeConfidence() without a second DB query.
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
  payload: Record<string, unknown>;
};

export type DiseaseSummary = {
  diseaseCode: string;
  diseaseName: string;
  count30d: number;
  count7d: number;
  count24h: number;
};

// outbreakSignalScopeClause (payload-snapshot scope on outbreak_signal events)
// now lives in ./_scope alongside every other dashboard scope helper (C3, ONE
// VIEWSCOPE) — this module kept a byte-identical private copy of it.

// Same guard as petsCurrentJurisdictionClause, wrapped in an EXISTS subquery
// for pet_events queries that do NOT already join the pets table.
function petsCurrentJurisdictionExists(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): SQL | null {
  const clause = petsCurrentJurisdictionClause(actor, jurisdictions, adminProvince, adminLocality);
  if (!clause) return null;
  return sql`EXISTS (SELECT 1 FROM ${pets} WHERE ${pets.id} = ${petEvents.petId} AND (${clause}))`;
}

export async function fetchSurveillanceSignals(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  filters: SurveillanceFilters,
): Promise<SurveillanceSignal[]> {
  const conditions = [
    eq(petEvents.eventType, "outbreak_signal"),
    gte(petEvents.occurredAt, filters.since),
  ];
  if (filters.diseaseCode) {
    conditions.push(sql`(${petEvents.payload}->>'disease_code') = ${filters.diseaseCode}`);
  }
  const scope = outbreakSignalScopeClause(
    actor,
    jurisdictions,
    filters.adminProvince,
    filters.adminLocality,
  );
  if (scope) conditions.push(sql`(${scope})`);
  // Rows return pet identifiers (name + public token) — require the pet's
  // CURRENT jurisdiction to be in scope too (pets is inner-joined below).
  const petsScope = petsCurrentJurisdictionClause(
    actor,
    jurisdictions,
    filters.adminProvince,
    filters.adminLocality,
  );
  if (petsScope) conditions.push(sql`(${petsScope})`);

  const rows = await db
    .select({
      signalEventId: petEvents.id,
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      petSpecies: pets.species,
      diseaseCode: sql<string>`(${petEvents.payload}->>'disease_code')`,
      diseaseLabel: sql<string | null>`(${petEvents.payload}->>'disease_label')`,
      province: sql<string | null>`(${petEvents.payload}->>'pet_jurisdiction_province')`,
      locality: sql<string | null>`(${petEvents.payload}->>'pet_jurisdiction_locality')`,
      detectedAt: petEvents.occurredAt,
      // Provenance for confidence tier computation (plan §A.5).
      authorRole: petEvents.authorRole,
      authorVerified: petEvents.authorVerified,
      authorOrganizationId: petEvents.authorOrganizationId,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...conditions))
    .orderBy(desc(petEvents.occurredAt))
    .limit(500);

  return rows.map((r) => ({
    signalEventId: r.signalEventId,
    petId: r.petId,
    petPublicToken: r.petPublicToken,
    petName: r.petName,
    petSpecies: r.petSpecies,
    diseaseCode: r.diseaseCode,
    diseaseName: findDisease(r.diseaseCode)?.label ?? r.diseaseLabel ?? r.diseaseCode,
    province: r.province,
    locality: r.locality,
    detectedAt: r.detectedAt,
    authorRole: r.authorRole,
    authorVerified: r.authorVerified,
    authorOrganizationId: r.authorOrganizationId,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}

// Pure rollup: groups already-fetched signals by disease_code and computes
// sub-window counts (7d, 24h) in JS. No DB call. The caller is responsible
// for fetching signals with a window >= 30 days so count30d is correct.
export function computeDiseaseSummary(signals: SurveillanceSignal[]): DiseaseSummary[] {
  const now = Date.now();
  const byCode = new Map<string, DiseaseSummary>();
  for (const s of signals) {
    const entry = byCode.get(s.diseaseCode) ?? {
      diseaseCode: s.diseaseCode,
      diseaseName: s.diseaseName,
      count30d: 0,
      count7d: 0,
      count24h: 0,
    };
    const age = now - s.detectedAt.getTime();
    entry.count30d += 1;
    if (age <= 7 * DAY_MS) entry.count7d += 1;
    if (age <= DAY_MS) entry.count24h += 1;
    byCode.set(s.diseaseCode, entry);
  }
  return [...byCode.values()].sort((a, b) => b.count30d - a.count30d);
}

// Period rollup grouped by disease_code (default last 30 days), with
// sub-counts for the last 7 days and 24h. Pulls from the same scoped query
// as the detail feed so the totals match exactly. `count30d` holds the
// window total (named for the default; callers may pass a custom `since`).
//
// When the caller already has a 30-day SurveillanceSignal[] in hand, prefer
// calling computeDiseaseSummary(signals) directly to avoid a second DB round-trip.
export async function fetchDiseaseSummary(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  opts: { since?: Date; adminProvince?: string; adminLocality?: string } = {},
): Promise<DiseaseSummary[]> {
  const since = opts.since ?? new Date(Date.now() - 30 * DAY_MS);
  const signals = await fetchSurveillanceSignals(actor, jurisdictions, {
    since,
    adminProvince: opts.adminProvince,
    adminLocality: opts.adminLocality,
  });
  return computeDiseaseSummary(signals);
}

// ============================================================================
// Vigilancia metrics — E2
// ============================================================================

export type VigilanciaMetrics = {
  /** outbreak_signal events in scope with status='open', last 30 days. */
  outbreakActiveCount: number;
  /** cases where caseKind='rabies_observation' AND status='open'. */
  rabiesActiveCount: number;
  /** pets in scope created today (since midnight local time). */
  petsRegisteredToday: number;
  /** pet_events where event_type='vaccination_administered' in scope, last 7 days. */
  vaccinationsThisWeek: number;
  /**
   * cases where caseKind='outbreak_investigation' AND status IN ('open','escalated').
   * Mirrors the active-status filter listOutbreakInvestigationsForGovt uses
   * (lib/infra/case-queries.ts) minus its 90-day recently-closed extension —
   * this is a live stock (cases still under active investigation right now),
   * not a period-bounded flow.
   */
  investigationActiveCount: number;
};

// Canonical list of Argentine provinces for /gob/* dashboard pages.
// Admin pages use all 24; govt pages derive a subset from their jurisdictions.
// Keep code/name aligned with PROVINCE_ISO_MAP and ar-provincias.ts.
export const GOB_ALL_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AR-C", name: "CABA" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Córdoba" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-T", name: "Tucumán" },
  { code: "AR-E", name: "Entre Ríos" },
  { code: "AR-A", name: "Salta" },
  { code: "AR-N", name: "Misiones" },
  { code: "AR-H", name: "Chaco" },
  { code: "AR-W", name: "Corrientes" },
  { code: "AR-K", name: "Catamarca" },
  { code: "AR-U", name: "Chubut" },
  { code: "AR-P", name: "Formosa" },
  { code: "AR-Y", name: "Jujuy" },
  { code: "AR-L", name: "La Pampa" },
  { code: "AR-F", name: "La Rioja" },
  { code: "AR-Q", name: "Neuquén" },
  { code: "AR-R", name: "Río Negro" },
  { code: "AR-J", name: "San Juan" },
  { code: "AR-D", name: "San Luis" },
  { code: "AR-Z", name: "Santa Cruz" },
  { code: "AR-G", name: "Santiago del Estero" },
  { code: "AR-V", name: "Tierra del Fuego" },
];

// Hardcoded province-name → ISO 3166-2:AR code map.
// The cases table stores the canonical display name (migration 0055 + check
// constraint enforcing the 24-enum). The GeoJSON uses ISO codes. Unknown
// provinces return code: "" — should be impossible after migration 0055.
export const PROVINCE_ISO_MAP: Record<string, string> = {
  "Buenos Aires": "AR-B",
  CABA: "AR-C",
  Catamarca: "AR-K",
  Chaco: "AR-H",
  Chubut: "AR-U",
  Córdoba: "AR-X",
  Corrientes: "AR-W",
  "Entre Ríos": "AR-E",
  Formosa: "AR-P",
  Jujuy: "AR-Y",
  "La Pampa": "AR-L",
  "La Rioja": "AR-F",
  Mendoza: "AR-M",
  Misiones: "AR-N",
  Neuquén: "AR-Q",
  "Río Negro": "AR-R",
  Salta: "AR-A",
  "San Juan": "AR-J",
  "San Luis": "AR-D",
  "Santa Cruz": "AR-Z",
  "Santa Fe": "AR-S",
  "Santiago del Estero": "AR-G",
  "Tierra del Fuego": "AR-V",
  Tucumán: "AR-T",
};

export async function fetchVigilanciaMetrics(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  opts: { adminProvince?: string; adminLocality?: string } = {},
): Promise<VigilanciaMetrics> {
  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS);
  const since7d = new Date(now - 7 * DAY_MS);
  // "Today" starts at midnight UTC to match server-side time. If the project
  // later moves to AR timezone, change this to use startOf('day', 'America/Argentina/Buenos_Aires').
  const todayStart = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  // 1. Count open outbreak_signal events from the last 30 days scoped to user.
  const outbreakConditions = [
    eq(petEvents.eventType, "outbreak_signal"),
    gte(petEvents.occurredAt, since30d),
  ];
  const outbreakScope = outbreakSignalScopeClause(
    actor,
    jurisdictions,
    opts.adminProvince,
    opts.adminLocality,
  );
  if (outbreakScope) outbreakConditions.push(sql`(${outbreakScope})`);

  // 2. Count open cases with caseKind='rabies_observation'.
  const casesScope = casesScopeClause(actor, jurisdictions, opts.adminProvince, opts.adminLocality);

  // 3. Count pets created today.
  const petsConditions = [gte(pets.createdAt, todayStart)];
  const petsScope = petsScopeClause(actor, jurisdictions, opts.adminProvince, opts.adminLocality);
  if (petsScope) petsConditions.push(sql`(${petsScope})`);

  // 4. Count vaccination_administered events in the last 7 days.
  const vaccConditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    gte(petEvents.occurredAt, since7d),
  ];
  // vaccination_administered does NOT carry a payload jurisdiction snapshot (only
  // outbreak_signal does) — scope by the pet's HOME jurisdiction (petsScope, reused
  // from arm 3) against the pets INNER JOIN added below. The previous
  // petEventsScopeClause here was the ghost-payload bug (zeroed this count for
  // every scoped-govt viewer). The outbreak arm above keeps its payload scope.
  if (petsScope) vaccConditions.push(sql`(${petsScope})`);

  // PF1 consolidation (2026-07-22, query-fan-out audit): arms 2 (rabies open
  // cases) and 5 (outbreak-investigation open|escalated cases) are the SAME
  // table (`cases`) scoped by the IDENTICAL `casesScope` predicate — neither
  // carries a time window, so they only differ in the counted condition. That
  // is exactly the "same table, same scope, same window" shape the fan-out
  // audit calls out — merged into ONE query with two `count(*) FILTER` arms
  // instead of two round-trips. Parity pinned in
  // __tests__/pf1-consolidation-parity.test.ts against independently-written
  // reference queries over seeded fixtures (multiple scopes).
  const [outbreakRows, casesRows, petsRows, vaccRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...outbreakConditions)),
    db
      .select({
        // The rabies expediente is a `bite_incident` case, NOT the
        // 'rabies_observation' string this used to count. That string is not a
        // member of CASE_KINDS: nothing in the app opens it and — the part that
        // broke — nothing closes it, so every row that ever carried it stayed
        // open forever. Measured on staging 2026-08-01: 12 such rows against 1
        // pet actually under observation, zero overlap, each already carrying
        // its cron-written `rabies_observation_ended`. The tile was reporting a
        // pile of immortal fixtures next to a live counter that said 1.
        //
        // `bite_incident` is the real thing on every axis: reportBite opens it
        // and emits `rabies_observation_started` in the SAME transaction (so
        // the two populations coincide by construction), its lifecycle declares
        // `terminalEvents: ['rabies_observation_ended']`, and all three closers
        // resolve it via findOpenBiteCase.
        //
        // 'escalated' counts alongside 'open' — same as the investigation arm
        // below. bite-incident.ts declares escalated as a valid status (a
        // rabies-compatible symptom during observation); counting only 'open'
        // would drop the single highest-risk expediente out of a RABIES
        // counter. No writer escalates a bite case today (escalateCase is wired
        // only for outbreaks), so this is free now and correct if that declared
        // path is ever implemented.
        rabies:
          sql<number>`count(*) filter (where ${cases.caseKind} = 'bite_incident' and ${cases.status} in ('open', 'escalated'))`.mapWith(
            Number,
          ),
        investigation:
          sql<number>`count(*) filter (where ${cases.caseKind} = 'outbreak_investigation' and ${cases.status} in ('open', 'escalated'))`.mapWith(
            Number,
          ),
      })
      .from(cases)
      .where(casesScope ?? sql`true`),
    db
      .select({ n: count() })
      .from(pets)
      .where(and(...petsConditions)),
    db
      .select({ n: count() })
      .from(petEvents)
      .innerJoin(pets, eq(pets.id, petEvents.petId))
      .where(and(...vaccConditions)),
  ]);

  return {
    outbreakActiveCount: outbreakRows[0]?.n ?? 0,
    rabiesActiveCount: casesRows[0]?.rabies ?? 0,
    petsRegisteredToday: petsRows[0]?.n ?? 0,
    vaccinationsThisWeek: vaccRows[0]?.n ?? 0,
    investigationActiveCount: casesRows[0]?.investigation ?? 0,
  };
}

/**
 * Prior-week vaccination_administered count, for the /gob/vigilancia deltaV2
 * chip on "Vacunaciones (7d)".
 *
 * Mirrors fetchVigilanciaMetrics' vaccination arm EXACTLY (same event type,
 * same petsScope — vaccination_administered carries no payload jurisdiction
 * snapshot, so scope is by the pet's HOME jurisdiction) but the 7-day window
 * shifted one full week back: [since7d − 7d, since7d) instead of [since7d, now).
 * Consumed via formatDelta (lib/analytics/campaign-metrics.ts) for an honest
 * "vs semana anterior" comparison.
 *
 * outbreakActiveCount / rabiesActiveCount are NOT given a matching prev-period
 * fetcher here: both are current OPEN-status snapshots (a stock, not a period
 * flow — reopening/closing shifts the count independent of "when" a signal
 * fired), so a period-over-period delta on them would misrepresent a status
 * change as an activity trend. petsRegisteredToday is a genuine flow but only
 * covers a PARTIAL day-in-progress — comparing it to a full prior day (or a
 * same-hour-yesterday slice) is an inconsistent denominator that reads as a
 * false swing early in the day, so it is skipped too (see the deltaV2-extend
 * writeup, engram topic filtros/deltav2-extend).
 *
 * @param actor - The DashboardActor (role) making the request.
 * @param jurisdictions - The actor's scoped jurisdictions (empty for admin).
 * @param opts - Optional admin province/locality drill-down.
 */
export async function fetchPrevVaccinationsWeek(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  opts: { adminProvince?: string; adminLocality?: string } = {},
): Promise<number> {
  const now = Date.now();
  const since7d = new Date(now - 7 * DAY_MS);
  const prevSince7d = new Date(now - 14 * DAY_MS);

  const petsScope = petsScopeClause(actor, jurisdictions, opts.adminProvince, opts.adminLocality);

  const conditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    gte(petEvents.occurredAt, prevSince7d),
    lt(petEvents.occurredAt, since7d),
  ];
  if (petsScope) conditions.push(sql`(${petsScope})`);

  const [row] = await db
    .select({ n: count() })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...conditions));

  return row?.n ?? 0;
}

// ============================================================================

export type LocalityCaseCount = {
  province: string;
  locality: string;
  /**
   * ISO 3166-2:AR code matching the GeoJSON `code` property if known.
   * Empty string if the province is not in PROVINCE_ISO_MAP.
   */
  code: string;
  count: number;
};

/**
 * Counts of open cases grouped by (province, locality). Used for the
 * <MapChoropleth metric="cases_open"> on /gob/vigilancia.
 *
 * Province code mapping: uses PROVINCE_ISO_MAP (hardcoded). The cases table
 * stores jurisdictionProvince as free-text; the GeoJSON uses ISO 3166-2:AR codes.
 * Cases in provinces not present in the map return code: "".
 */
export async function fetchCasesPerLocality(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  opts: { adminProvince?: string; adminLocality?: string } = {},
): Promise<LocalityCaseCount[]> {
  const conditions = [eq(cases.status, "open")];
  const scope = casesScopeClause(actor, jurisdictions, opts.adminProvince, opts.adminLocality);
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      province: cases.jurisdictionProvince,
      locality: cases.jurisdictionLocality,
      n: count(),
    })
    .from(cases)
    .where(and(...conditions))
    .groupBy(cases.jurisdictionProvince, cases.jurisdictionLocality);

  return rows
    .filter((r) => r.province !== null)
    .map((r) => ({
      province: r.province as string,
      locality: r.locality ?? "",
      code: PROVINCE_ISO_MAP[r.province as string] ?? "",
      count: r.n,
    }));
}

// ============================================================================

export type { SubregionCaseCount } from "../subregion-redaction";

/**
 * Open cases per sub-region within a selected province — the FULL sub-region set.
 *
 * Returns EVERY sub-region of the province (not only those with cases), each with
 * its open-case count (0 when there are none). This lets the caller frame and
 * render the whole province: sub-regions with 0 cases render grey via the
 * choropleth's missing-color branch.
 *
 * Thin wrapper (reusable-drill extraction, design/scoped-choropleth-drill,
 * engram #1481): fetches this screen's own open-cases-per-locality rows, then
 * folds them to department/barrio grain via the shared
 * aggregateRowsByDepartment (lib/analytics/subregion-aggregate.ts), which also
 * enforces the k=5 k-anonymity floor. Signature unchanged for existing callers.
 *
 * Scope is enforced by casesScopeClause (same as all other cases fetchers).
 * Admin always sees all cases; govt sees only their assigned localities.
 */
export async function fetchCasesPerSubregion(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  provinceIso: string,
  opts: { adminProvince?: string; adminLocality?: string } = {},
): Promise<SubregionCaseCount[]> {
  const scope = casesScopeClause(actor, jurisdictions, opts.adminProvince, opts.adminLocality);
  // Govt with no assignments can never see any case. NOTE: this must key off
  // actor.role, not `scope !== null` — an admin+adminProvince drill-down now
  // also produces a non-null scope, and admin's jurisdictions is always []
  // by contract, so a `scope !== null && jurisdictions.length === 0` check
  // would have wrongly zeroed the admin drill-down result.
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  // Cases store the canonical province display name (migration 0055's
  // 24-enum check constraint); CABA is stored literally as "CABA" (not
  // "Ciudad Autónoma de Buenos Aires", which is ar_localities' province row name).
  const provinceDisplayName = provinceIso === "AR-C" ? "CABA" : provinceByCode(provinceIso)?.name;
  if (!provinceDisplayName) return [];

  const conditions = [
    eq(cases.status, "open"),
    eq(cases.jurisdictionProvince, provinceDisplayName),
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const caseRows = await db
    .select({ locality: cases.jurisdictionLocality, n: count() })
    .from(cases)
    .where(and(...conditions))
    .groupBy(cases.jurisdictionLocality);

  return aggregateRowsByDepartment(
    provinceIso,
    caseRows.map((r) => ({ locality: r.locality, value: r.n })),
  );
}

// ============================================================================

export type ProvinceCasesPerCapita = {
  province: string;
  /**
   * ISO 3166-2:AR code matching the GeoJSON `code` property if known.
   * Empty string if the province is not in PROVINCE_ISO_MAP.
   */
  code: string;
  /**
   * Count of open cases in this province, or `null` when the cell is WITHHELD
   * by k-anonymity (RA-3 C4). NEVER 0 for a withheld cell: a false zero is
   * itself a disclosure (it says "sub-k" just as loudly as the real number,
   * and reads as real data) — see SUPPRESSED_MARKER's own note in
   * lib/open-data/province-suppression.ts.
   */
  count: number | null;
  /**
   * Cases per 10,000 inhabitants (count / population * 10_000), rounded to
   * one decimal. `null` when there is no census row for the province (avoids
   * divide-by-zero; the UI falls back to showing the raw count in that case)
   * — OR when the cell is k-anon suppressed. Branch on `suppressed` FIRST:
   * the two nulls mean different things and must render differently ("sin
   * censo, conteo bruto N" vs "protegido por privacidad").
   */
  ratePer10k: number | null;
  /**
   * k-anonymity (k = ANONYMITY_K = 5, AGENTS.md "Aggregation & privacy
   * policy"): true when this province has 1..k-1 open cases. A rate is not
   * exempt — it publishes its own numerator once the denominator (INDEC 2022
   * population, public) is known, so the rate is suppressed with the count.
   */
  suppressed: boolean;
};

/**
 * Open cases per province with INDEC 2022 per-capita rate.
 *
 * Aggregates open cases by jurisdictionProvince, then LEFT JOINs the
 * jurisdictions_census table (province_name = jurisdiction_province) to
 * compute rate = count / population * 10_000.
 *
 * Join key: cases.jurisdictionProvince (canonical display name, same format
 * as jurisdictionsCensus.provinceName — both enforced by migration 0055
 * canonical check constraint). Match is exact text equality.
 *
 * Fallback: provinces with no census row get ratePer10k = null so callers
 * can display the raw count as a safe fallback.
 *
 * k-ANONYMITY (RA-3 C4, 2026-07-31). Every returned province is routed through
 * `suppressSmallCells` at the shared ANONYMITY_K before it leaves this module.
 * A province with 1..4 open cases publishes `count: null, ratePer10k: null,
 * suppressed: true` — the row survives (a row that VANISHES at k makes absence
 * the disclosure channel, the same trap `toChoroplethData` documents) but
 * carries no number on either side.
 *
 * Why the RATE is suppressed too and not just the count: the denominator is
 * INDEC 2022, a published national census. `count = rate × population / 10_000`
 * is a one-line inversion, so publishing the rate publishes the count. This is
 * the same "a rate reveals its denominator" finding that made #40c non-exempt.
 *
 * Suppressed rows are NOT dropped from the return value on purpose: the render
 * has to be able to say HOW MANY provinces it is withholding (the disclosure
 * half of the rule), and it can only count what it receives.
 *
 * PRIMARY suppression only — no complementary (differencing) pass. The
 * complementary rule exists to protect a lone suppressed cell against
 * subtraction from a coarser PUBLISHED total over the same partition
 * (`complementarySuppress` jsdoc); /gob/analytics publishes no national
 * open-case total, so there is nothing to subtract from. This matches the
 * proven standard already on that same page — `fetchVetAccessByLocality` is
 * primary-only for the same reason. If a national open-case KPI is ever added
 * to this screen, this fetcher MUST gain the complementary pass with it.
 *
 * NOT scoped by `case_kind` — deliberate, see the note in `fetchCasesPerLocality`'s
 * sibling render (`CasesPerCapitaTable`): "casos abiertos" means every open case
 * kind on BOTH this table and /gob/vigilancia's choropleth, and narrowing one of
 * the two would put two different numbers under one name across two screens.
 * Narrowing would also SHRINK every cell, which raises re-identifiability rather
 * than lowering it. The honesty gap (a maltrato case and a custody dispute in one
 * bucket) is closed on the render side, by naming what is counted.
 */
export async function fetchCasesPerCapita(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<ProvinceCasesPerCapita[]> {
  const conditions = [eq(cases.status, "open")];
  const scope = casesScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);

  // Aggregate by province only (no locality grouping — per-capita is a
  // province-level figure because the census table is province-level).
  // The LEFT JOIN is 1:1 (province_name is the PK of jurisdictions_census),
  // so grouping by province alone and using MAX(population) is safe.
  const rows = await db
    .select({
      province: cases.jurisdictionProvince,
      n: count(),
      population: sql<string | null>`MAX(${jurisdictionsCensus.population})`,
    })
    .from(cases)
    .leftJoin(
      jurisdictionsCensus,
      and(
        eq(jurisdictionsCensus.provinceName, cases.jurisdictionProvince),
        eq(jurisdictionsCensus.censusYear, 2022),
      ),
    )
    .where(and(...conditions))
    .groupBy(cases.jurisdictionProvince);

  const raw = rows
    .filter((r) => r.province !== null)
    .map((r) => {
      const pop = r.population !== null ? Number(r.population) : null;
      const ratePer10k =
        pop !== null && pop > 0 ? Math.round((r.n / pop) * 10_000 * 10) / 10 : null;
      return {
        province: r.province as string,
        code: PROVINCE_ISO_MAP[r.province as string] ?? "",
        count: r.n,
        ratePer10k,
      };
    });

  // k-anon at the shared ANONYMITY_K — the SAME primitive the locality,
  // department and open-data tiers use. No second k is defined here.
  const { suppressed } = suppressSmallCells(raw, {
    count: (r) => r.count,
    key: (r) => r.province,
  });
  const suppressedProvinces = new Set(suppressed.map((r) => r.province));

  return raw.map((r) =>
    suppressedProvinces.has(r.province)
      ? { province: r.province, code: r.code, count: null, ratePer10k: null, suppressed: true }
      : { ...r, suppressed: false },
  );
}

// ============================================================================

export type ZoonosisTrendPoint = {
  /** Pre-formatted x-axis label, e.g. "ene.", "feb.". Month abbreviation in es-AR locale. */
  x: string;
  /** Count of outbreak_signal events in that month. */
  y: number;
  /** ISO date of the period start (month start), for upstream sorting. */
  periodStart: string;
};

/**
 * Outbreak signal counts grouped by month, last 12 months, within the user's
 * scope. Used for <TimeSeriesChart> on /gob/vigilancia.
 *
 * We use date_trunc('month', occurred_at) to group by calendar month. The
 * pet_events table lacks a dedicated "event_category" column — we match on
 * eventType LIKE 'outbreak_%' by listing all known outbreak_* event types.
 * Currently only 'outbreak_signal' exists; this pattern extends naturally.
 */
export async function fetchZoonosisTrend(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  opts: { since?: Date; adminProvince?: string; adminLocality?: string } = {},
): Promise<ZoonosisTrendPoint[]> {
  const since12m = opts.since ?? new Date(Date.now() - 365 * DAY_MS);

  const conditions = [
    sql`${petEvents.eventType} LIKE ${"outbreak_%"}`,
    gte(petEvents.occurredAt, since12m),
  ];
  const scope = outbreakSignalScopeClause(
    actor,
    jurisdictions,
    opts.adminProvince,
    opts.adminLocality,
  );
  if (scope) conditions.push(sql`(${scope})`);
  // Payload jurisdiction is an event-time snapshot — also require the pet's
  // CURRENT jurisdiction in scope (scope-security review 2026-07-04 A2).
  const petsGuard = petsCurrentJurisdictionExists(
    actor,
    jurisdictions,
    opts.adminProvince,
    opts.adminLocality,
  );
  if (petsGuard) conditions.push(petsGuard);

  const rows = await db
    .select({
      month: sql<string>`date_trunc('month', ${petEvents.occurredAt})`,
      n: count(),
    })
    .from(petEvents)
    .where(and(...conditions))
    .groupBy(sql`date_trunc('month', ${petEvents.occurredAt})`)
    .orderBy(sql`date_trunc('month', ${petEvents.occurredAt})`);

  return rows.map((r) => {
    const d = new Date(r.month);
    return {
      // r.month is a date_trunc('month') UTC boundary — pin UTC so the label
      // names the bucket month (an ambient/AR render shifts midnight-UTC
      // boundaries into the PREVIOUS month).
      x: d.toLocaleString("es-AR", { month: "short", timeZone: "UTC" }),
      y: r.n,
      periodStart: d.toISOString(),
    };
  });
}

// ============================================================================

export type OutbreakHistoryRow = {
  diseaseCode: string;
  diseaseName: string;
  locality: string;
  province: string;
  /**
   * ISO date (YYYY-MM-DD) of the calendar day with the highest number of
   * outbreak_signal events for this (disease_code, locality, province) group.
   * Tie-break: highest signal count first, then most-recent day.
   */
  peakDate: string;
  /**
   * Most recent signal in the cluster (MAX(occurred_at)) — the field the query
   * actually ORDERs BY. It was computed and used for ordering but never
   * returned, so the promised ordering was unverifiable from outside; the test
   * that tried ended up asserting `peakDate` instead, a DIFFERENT quantity that
   * only agreed by luck (measured: 1 violating pair in 100). Surfacing it makes
   * "most recently active first" checkable, and answers the surveillance
   * question the ordering exists for: where is something still happening?
   */
  lastSeen: string;
  /** Total outbreak_signal events from this disease in this locality, full history. */
  totalSignals: number;
};

/**
 * The k-anonymised outbreak history: the rows that may be published, plus the
 * count of the ones that may not.
 *
 * `suppressedCount` is NOT decoration — it is the disclosure half of the rule.
 * Without it the table cannot tell "nobody ever reported an outbreak here" from
 * "every outbreak here is a group of fewer than k", and it renders the former,
 * which is a lie in the direction that matters (an all-clear that was never
 * measured).
 */
export type OutbreakHistoryResult = {
  rows: OutbreakHistoryRow[];
  /** (disease, locality, province) groups withheld by k-anon — counted, never listed. */
  suppressedCount: number;
};

/**
 * Historical outbreaks grouped by (disease_code, disease_label, locality, province),
 * ordered by most-recent signal descending.
 *
 * peakDate = the calendar day (date_trunc('day', occurred_at)::date) that
 * had the most outbreak_signal events within the group. Ties broken by most-
 * recent day. Group-level totalSignals counts all signals across all days.
 *
 * Implemented as a three-CTE query (daily → peak → totals) joined together so
 * that per-day counts, busiest-day selection (DISTINCT ON), and group totals
 * are each computed in a single pass.
 *
 * Scope via outbreak_signal payload fields pet_jurisdiction_province/locality
 * (same as fetchSurveillanceSignals). No time restriction — full history.
 *
 * k-ANONYMITY (RA-3 C3, 2026-07-31 — the highest-re-identifiability finding in
 * that report). A row here is a (disease, LOCALITY, province, peak DAY) tuple.
 * At `totalSignals = 1` the row reads "Rabia · Ushuaia · Tierra del Fuego ·
 * 12 mar 2026 · 1": one animal, one locality, one date, a reportable disease.
 * Every attribute of the row is a quasi-identifier of the same small group, so
 * blanking only the number is not enough — the ROW is the disclosure. Sub-k
 * groups are therefore DROPPED and COUNTED, not blanked.
 *
 * This is the standard already proven on the very page that renders this table:
 * `fetchVetAccessByLocality` (lib/metrics/vet-access.ts) drops sub-k localities
 * and hands back `suppressedCount`, and /gob/analytics announces it in the
 * card header. Same primitive (`suppressSmallCells`), same k (ANONYMITY_K),
 * same disclosure shape — no second mechanism.
 *
 * PRIMARY suppression only, deliberately: complementary (differencing)
 * suppression defends a lone hidden cell against subtraction from a coarser
 * PUBLISHED total over the SAME partition. Nothing on this page publishes a
 * per-disease or per-province lifetime signal total (the trend card is
 * period-bounded, all-disease, and separately suppressed), so there is no
 * subtraction to defend against. Add the pass together with any future
 * lifetime total, not before — see `complementarySuppress`'s jsdoc.
 */
export async function fetchOutbreakHistory(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  opts: { adminProvince?: string; adminLocality?: string } = {},
): Promise<OutbreakHistoryResult> {
  if (actor.role === "govt" && jurisdictions.length === 0) return { rows: [], suppressedCount: 0 };

  // Build the jurisdiction scope clause once; reused in both CTEs. The pets
  // guard (EXISTS on the pet's CURRENT jurisdiction) closes the payload-drift
  // hole for govt viewers (scope-security review 2026-07-04 A2).
  const scope = outbreakSignalScopeClause(
    actor,
    jurisdictions,
    opts.adminProvince,
    opts.adminLocality,
  );
  const petsGuard = petsCurrentJurisdictionExists(
    actor,
    jurisdictions,
    opts.adminProvince,
    opts.adminLocality,
  );
  const scopeFragment = sql.join(
    [scope ? sql` AND (${scope})` : sql``, petsGuard ? sql` AND ${petsGuard}` : sql``],
    sql``,
  );

  type RawRow = {
    disease_code: string;
    disease_label: string | null;
    province: string;
    locality: string;
    peak_day: string;
    total_signals: number;
    last_seen: string;
  };

  const rows = (await db.execute(sql`
    WITH daily AS (
      -- Per-(group, day) signal counts. Groups share the same 4-tuple key.
      SELECT
        (${petEvents.payload}->>'disease_code')                                AS disease_code,
        COALESCE((${petEvents.payload}->>'disease_label'), '')                 AS disease_label,
        COALESCE((${petEvents.payload}->>'pet_jurisdiction_province'), '')      AS province,
        COALESCE((${petEvents.payload}->>'pet_jurisdiction_locality'), '')      AS locality,
        date_trunc('day', ${petEvents.occurredAt})::date                        AS day,
        COUNT(*)::int                                                           AS day_count
      FROM ${petEvents}
      WHERE ${petEvents.eventType} = 'outbreak_signal'${scopeFragment}
      GROUP BY disease_code, disease_label, province, locality, day
    ),
    peak AS (
      -- Pick the single busiest day per group.
      -- Tie-break: most signals first, then most-recent day.
      SELECT DISTINCT ON (disease_code, disease_label, province, locality)
        disease_code,
        disease_label,
        province,
        locality,
        day AS peak_day
      FROM daily
      ORDER BY disease_code, disease_label, province, locality,
               day_count DESC, day DESC
    ),
    totals AS (
      -- Group-level aggregates: total signal count + last-seen timestamp
      -- (used for ordering the final result).
      SELECT
        (${petEvents.payload}->>'disease_code')                                AS disease_code,
        COALESCE((${petEvents.payload}->>'disease_label'), '')                 AS disease_label,
        COALESCE((${petEvents.payload}->>'pet_jurisdiction_province'), '')      AS province,
        COALESCE((${petEvents.payload}->>'pet_jurisdiction_locality'), '')      AS locality,
        COUNT(*)::int                                                           AS total_signals,
        MAX(${petEvents.occurredAt})                                            AS last_seen
      FROM ${petEvents}
      WHERE ${petEvents.eventType} = 'outbreak_signal'${scopeFragment}
      GROUP BY disease_code, disease_label, province, locality
    )
    SELECT
      t.disease_code,
      t.disease_label,
      t.province,
      t.locality,
      p.peak_day,
      t.total_signals,
      t.last_seen
    FROM totals t
    JOIN peak p USING (disease_code, disease_label, province, locality)
    ORDER BY t.last_seen DESC
    LIMIT 100
  `)) as RawRow[];

  const mapped: OutbreakHistoryRow[] = rows.map((r) => ({
    diseaseCode: r.disease_code,
    diseaseName: findDisease(r.disease_code)?.label ?? (r.disease_label || null) ?? r.disease_code,
    locality: r.locality,
    province: r.province,
    // peak_day arrives as a Postgres ::date string (YYYY-MM-DD); wrap in Date
    // only to normalise, then emit as ISO date string.
    peakDate: new Date(r.peak_day).toISOString(),
    totalSignals: r.total_signals,
    lastSeen: new Date(r.last_seen).toISOString(),
  }));

  // k-anon at the shared ANONYMITY_K (no `k` override — the policy number has
  // exactly one home, lib/metrics/anonymity.ts). No rollup: folding sub-k
  // groups into a coarser bucket would have to name a disease or a province to
  // be useful, and either one re-opens the leak this suppression closes.
  const { visible, suppressedCount } = suppressSmallCells(mapped, {
    count: (r) => r.totalSignals,
    key: (r) => `${r.diseaseCode}::${r.province}::${r.locality}`,
  });

  return { rows: visible as unknown as OutbreakHistoryRow[], suppressedCount };
}
