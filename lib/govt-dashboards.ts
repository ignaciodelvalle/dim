// Read helpers for the /gob regional dashboards (Fase 11).
//
// Two surfaces:
//   - Vigilancia: outbreak_signal events filtered to the govt's scope.
//   - Pérdidas:  pets in status='lost' filtered to the govt's scope.
//
// Both helpers accept the actor + jurisdictions tuple already produced by
// requireAdminOrGovtOrRedirect — admin sees universal scope (jurisdictions
// is empty by contract for admin), govt sees only rows matching one of their
// active assignments.

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { findDisease } from "@/lib/diseases";

export type DashboardActor = { role: "admin" | "govt" };

export type DashboardJurisdiction = { province: string; locality: string };

export type SurveillanceFilters = {
  /** Inclusive lower bound for occurredAt. */
  since: Date;
  /** Optional disease_code narrow filter. */
  diseaseCode?: string | null;
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
};

export type DiseaseSummary = {
  diseaseCode: string;
  diseaseName: string;
  count30d: number;
  count7d: number;
  count24h: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Build the scope-match SQL clause on outbreak_signal events. Admin gets no
// scope filter (returns `null` from this helper so the caller can omit the
// clause). Govt gets a disjunction of `(province=X AND locality=Y)` pairs.
function outbreakSignalScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  if (actor.role === "admin") return null;
  if (jurisdictions.length === 0) {
    // Govt with no active assignments — match nothing.
    return sql`false`;
  }
  const pairs = jurisdictions.map(
    (j) => sql`(
      (${petEvents.payload}->>'pet_jurisdiction_province') = ${j.province}
      AND (${petEvents.payload}->>'pet_jurisdiction_locality') = ${j.locality}
    )`,
  );
  return sql.join(pairs, sql` OR `);
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
  const scope = outbreakSignalScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);

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
  }));
}

// 30-day rollup grouped by disease_code, with sub-counts for the last 7 days
// and 24h. Pulls from the same scoped query as the detail feed so the totals
// match exactly.
export async function fetchDiseaseSummary(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<DiseaseSummary[]> {
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const signals = await fetchSurveillanceSignals(actor, jurisdictions, { since: since30 });

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

export type LostPetRow = {
  petId: string;
  petPublicToken: string;
  petName: string;
  species: string;
  province: string | null;
  locality: string | null;
  markedLostAt: Date | null;
  lastSeenLat: number | null;
  lastSeenLng: number | null;
  ownerDisplayName: string | null;
};

export async function fetchLostPets(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  filters: { since?: Date; species?: string } = {},
): Promise<LostPetRow[]> {
  const conditions = [eq(pets.status, "lost")];
  if (filters.species) conditions.push(eq(pets.species, filters.species));

  // Govt scope filters on the pet's own jurisdiction columns. Pets without a
  // declared jurisdiction are excluded from the govt view (no way to scope-match)
  // but visible to admin.
  if (actor.role === "govt") {
    if (jurisdictions.length === 0) return [];
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    conditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }

  const baseRows = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      species: pets.species,
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
    })
    .from(pets)
    .where(and(...conditions))
    .limit(500);

  if (baseRows.length === 0) return [];

  // Pull the latest status_changed → 'lost' event per pet to get markedLostAt
  // and last-seen coords (from the event row's location_point columns).
  const petIds = baseRows.map((r) => r.petId);
  const lostEvents = await db
    .select({
      petId: petEvents.petId,
      occurredAt: petEvents.occurredAt,
      locationLat: petEvents.locationLat,
      locationLng: petEvents.locationLng,
    })
    .from(petEvents)
    .where(
      and(
        inArray(petEvents.petId, petIds),
        eq(petEvents.eventType, "status_changed"),
        sql`(${petEvents.payload}->>'to_status') = 'lost'`,
      ),
    )
    .orderBy(desc(petEvents.occurredAt));

  const lostMetaByPet = new Map<
    string,
    { occurredAt: Date; locationLat: string | null; locationLng: string | null }
  >();
  for (const e of lostEvents) {
    if (!lostMetaByPet.has(e.petId)) {
      lostMetaByPet.set(e.petId, {
        occurredAt: e.occurredAt,
        locationLat: e.locationLat,
        locationLng: e.locationLng,
      });
    }
  }

  // Resolve the active owner's display name via ownerships → profiles.
  const ownerMap = new Map<string, string>();
  const activeOwnerRows = await db
    .select({
      petId: ownerships.petId,
      ownerUserId: ownerships.ownerUserId,
      displayName: profiles.displayName,
    })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(
        inArray(ownerships.petId, petIds),
        isNull(ownerships.endedAt),
        eq(ownerships.role, "owner"),
      ),
    );
  for (const r of activeOwnerRows) ownerMap.set(r.petId, r.displayName);

  const sinceFloor = filters.since?.getTime() ?? null;

  return baseRows
    .map((r): LostPetRow => {
      const meta = lostMetaByPet.get(r.petId);
      return {
        petId: r.petId,
        petPublicToken: r.petPublicToken,
        petName: r.petName,
        species: r.species,
        province: r.province,
        locality: r.locality,
        markedLostAt: meta?.occurredAt ?? null,
        lastSeenLat: meta?.locationLat ? Number(meta.locationLat) : null,
        lastSeenLng: meta?.locationLng ? Number(meta.locationLng) : null,
        ownerDisplayName: ownerMap.get(r.petId) ?? null,
      };
    })
    .filter((r) => (sinceFloor === null ? true : (r.markedLostAt?.getTime() ?? 0) >= sinceFloor))
    .sort((a, b) => (b.markedLostAt?.getTime() ?? 0) - (a.markedLostAt?.getTime() ?? 0));
}
