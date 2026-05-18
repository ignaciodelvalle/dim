// Helpers for reading the canonical INDEC locality catalog (ar_localities).
//
// Pairs with lib/ar-provincias.ts (the static provincia catalog). The split
// between the two is intentional: provincias are 24 entries and fit in code;
// localidades are ~4500 and live in the DB.
//
// Every read filters by removed_at IS NULL so soft-deleted rows from past
// import runs never bleed into UI or validation paths.

import { and, eq, isNull, sql } from "drizzle-orm";

import { type ArgentineLocality, arLocalities, db } from "@/db";
import { type ProvinceCode, provinceByCode, provinceByName } from "@/lib/ar-provincias";

export type Locality = {
  indecId: string | null;
  provinceCode: ProvinceCode;
  departmentName: string | null;
  localityName: string;
  localitySlug: string;
  category: ArgentineLocality["category"];
};

export type LocalitySearchResult = Locality & {
  provinceName: string;
  matchKind: "exact" | "prefix" | "contains";
};

const MIN_QUERY_LENGTH = 2;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rowToLocality(row: ArgentineLocality): Locality {
  return {
    indecId: row.indecId,
    provinceCode: row.provinceCode as ProvinceCode,
    departmentName: row.departmentName,
    localityName: row.localityName,
    localitySlug: row.localitySlug,
    category: row.category as ArgentineLocality["category"],
  };
}

export async function localityByIndecId(indecId: string): Promise<Locality | null> {
  const [row] = await db
    .select()
    .from(arLocalities)
    .where(and(eq(arLocalities.indecId, indecId), isNull(arLocalities.removedAt)));
  return row ? rowToLocality(row) : null;
}

// Find a single locality by free-text name within a province. INDEC ships
// ambiguous (province, name) pairs in 68 cases — when this happens we return
// the first row deterministically (ordered by department to keep test
// stability). Callers that need to disambiguate should use searchLocalities
// and present alternatives.
export async function localityByName(
  provinceCode: ProvinceCode,
  name: string | null | undefined,
): Promise<Locality | null> {
  if (!name) return null;
  const normalized = normalize(name);
  const slugCandidate = normalized.replace(/\s+/g, "-");

  const [bySlug] = await db
    .select()
    .from(arLocalities)
    .where(
      and(
        eq(arLocalities.provinceCode, provinceCode),
        eq(arLocalities.localitySlug, slugCandidate),
        isNull(arLocalities.removedAt),
      ),
    )
    .orderBy(arLocalities.departmentName)
    .limit(1);
  if (bySlug) return rowToLocality(bySlug);

  // Fallback: case-insensitive name comparison. Cheaper than a full table scan
  // because the province filter narrows to ~150 rows max for any province.
  const [byNameCi] = await db
    .select()
    .from(arLocalities)
    .where(
      and(
        eq(arLocalities.provinceCode, provinceCode),
        sql`lower(${arLocalities.localityName}) = lower(${name})`,
        isNull(arLocalities.removedAt),
      ),
    )
    .orderBy(arLocalities.departmentName)
    .limit(1);
  return byNameCi ? rowToLocality(byNameCi) : null;
}

export async function isCanonicalLocality(
  provinceCodeOrName: string,
  localityName: string,
): Promise<boolean> {
  const province = provinceByCode(provinceCodeOrName) ?? provinceByName(provinceCodeOrName);
  if (!province) return false;
  return (await localityByName(province.code as ProvinceCode, localityName)) !== null;
}

export async function searchLocalities(input: {
  provinceCode?: ProvinceCode;
  query: string;
  limit?: number;
}): Promise<LocalitySearchResult[]> {
  const limit = Math.min(input.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
  const q = normalize(input.query);
  if (q.length < MIN_QUERY_LENGTH) return [];
  const qSlug = q.replace(/\s+/g, "-");
  const qContains = `%${input.query}%`;
  const qPrefix = `${qSlug}%`;

  const scoreExpr = sql<number>`(
    case
      when ${arLocalities.localitySlug} = ${qSlug} then 1000
      when ${arLocalities.localitySlug} like ${qPrefix} then 100
      when ${arLocalities.localityName} ilike ${qContains} then 10
      else 0
    end
  )`;

  // Category priority: ciudad > localidad > pueblo > barrio > comuna > componente.
  // Within the same score bucket, prefer larger / more recognizable categories.
  const categoryPriorityExpr = sql<number>`(
    case ${arLocalities.category}
      when 'ciudad' then 6
      when 'localidad' then 5
      when 'pueblo' then 4
      when 'barrio' then 3
      when 'comuna' then 2
      when 'componente' then 1
      else 0
    end
  )`;

  const conditions = [isNull(arLocalities.removedAt), sql`${scoreExpr} > 0`];
  if (input.provinceCode) conditions.push(eq(arLocalities.provinceCode, input.provinceCode));

  const rows = await db
    .select({
      indecId: arLocalities.indecId,
      provinceCode: arLocalities.provinceCode,
      departmentName: arLocalities.departmentName,
      localityName: arLocalities.localityName,
      localitySlug: arLocalities.localitySlug,
      category: arLocalities.category,
      score: scoreExpr,
    })
    .from(arLocalities)
    .where(and(...conditions))
    .orderBy(sql`${scoreExpr} desc, ${categoryPriorityExpr} desc, ${arLocalities.localityName} asc`)
    .limit(limit);

  return rows.map(
    (r): LocalitySearchResult => ({
      indecId: r.indecId,
      provinceCode: r.provinceCode as ProvinceCode,
      provinceName: provinceByCode(r.provinceCode)?.name ?? r.provinceCode,
      departmentName: r.departmentName,
      localityName: r.localityName,
      localitySlug: r.localitySlug,
      category: r.category as Locality["category"],
      matchKind: r.score >= 1000 ? "exact" : r.score >= 100 ? "prefix" : "contains",
    }),
  );
}
