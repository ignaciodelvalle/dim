#!/usr/bin/env tsx
/**
 * INDEC CPPDyL locality importer.
 *
 * Source: https://www.datos.gob.ar/dataset/jgm_8/archivo/jgm_8.12
 *   (Georef Service — Localidades Censales CSV)
 *
 * Direct CSV: https://infra.datos.gob.ar/georef/localidades_censales.csv
 *
 * Verified 2026-05-18:
 *   - HTTP 200, ~625 KB, ~4027 data rows
 *   - Encoding: UTF-8
 *   - Delimiter: comma
 *   - All values wrapped in double quotes
 *   - Column order: categoria, centroide_lat, centroide_lon, departamento_id,
 *     departamento_nombre, fuente, funcion, id, municipio_id, municipio_nombre,
 *     nombre, provincia_id, provincia_nombre
 *   - Only two `categoria` values observed:
 *       * "Localidad simple" → mapped to category='localidad'
 *       * "Componente de localidad compuesta" → mapped to category='componente'
 *         (CABA barrios, since CABA is one composite locality in INDEC's model)
 *
 * Data source resolution (checked in order):
 *   1. `INDEC_LOCALITIES_CSV` env var — absolute or repo-relative path to a
 *      local CSV file (vendored dataset). Fastest, no network dependency.
 *      Example: INDEC_LOCALITIES_CSV=scripts/__fixtures__/indec-localidades-sample.csv
 *   2. `--source-url=<url>` CLI flag — fetch from an explicit URL.
 *   3. Default live URL (datos.gob.ar). If the fetch fails, the script
 *      falls back to the bundled sample fixture with a warning so that
 *      `db:bootstrap` / CI never hard-fail due to a network hiccup.
 *
 * Run:
 *   pnpm tsx scripts/import-indec-localities.ts            # apply (writes to DB)
 *   pnpm tsx scripts/import-indec-localities.ts --dry-run  # parse + count only
 *   pnpm tsx scripts/import-indec-localities.ts --source-url=<override>
 *   INDEC_LOCALITIES_CSV=/path/to/full.csv pnpm tsx scripts/import-indec-localities.ts
 *
 * Idempotent: re-running a second time produces no changes when the CSV is
 * unchanged. Soft-deletes rows that disappear from the source between runs.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "csv-parse/sync";
import { eq, inArray } from "drizzle-orm";

import {
  type ArgentineLocalityCategory,
  type ArgentineLocalitySource,
  type NewArgentineLocality,
  arLocalities,
  arLocalitiesImportRuns,
  db,
} from "@/db";
import type { ProvinceCode } from "@/lib/reference/ar-provincias";
import { isWholeProvinceAggregate } from "@/lib/reference/locality-integrity";

const DEFAULT_SOURCE_URL = "https://infra.datos.gob.ar/georef/localidades_censales.csv";

// Bundled sample fixture used as a last-resort fallback when the live source is
// unreachable and no vendored CSV has been configured. Keeps bootstrap/CI green
// even when datos.gob.ar is down — at the cost of only loading a small subset.
const FALLBACK_FIXTURE_PATH = join(
  import.meta.dirname ?? __dirname,
  "__fixtures__",
  "indec-localidades-sample.csv",
);

// INDEC 2-digit provincia codes → ISO 3166-2:AR codes used by lib/ar-provincias.
// Verified against the live dataset (provincia_id + provincia_nombre pairs)
// on 2026-05-18.
const PROVINCE_BY_INDEC_CODE: Record<string, ProvinceCode> = {
  "02": "AR-C", // Ciudad Autónoma de Buenos Aires
  "06": "AR-B", // Buenos Aires
  "10": "AR-K", // Catamarca
  "14": "AR-X", // Córdoba
  "18": "AR-W", // Corrientes
  "22": "AR-H", // Chaco
  "26": "AR-U", // Chubut
  "30": "AR-E", // Entre Ríos
  "34": "AR-P", // Formosa
  "38": "AR-Y", // Jujuy
  "42": "AR-L", // La Pampa
  "46": "AR-F", // La Rioja
  "50": "AR-M", // Mendoza
  "54": "AR-N", // Misiones
  "58": "AR-Q", // Neuquén
  "62": "AR-R", // Río Negro
  "66": "AR-A", // Salta
  "70": "AR-J", // San Juan
  "74": "AR-D", // San Luis
  "78": "AR-Z", // Santa Cruz
  "82": "AR-S", // Santa Fe
  "86": "AR-G", // Santiago del Estero
  "90": "AR-T", // Tucumán
  "94": "AR-V", // Tierra del Fuego
};

function normalizeCategory(raw: string): ArgentineLocalityCategory | null {
  const n = raw.toLowerCase().trim();
  if (n.includes("componente")) return "componente";
  if (n.includes("ciudad")) return "ciudad";
  if (n.includes("pueblo")) return "pueblo";
  if (n.includes("comuna")) return "comuna";
  if (n.includes("barrio")) return "barrio";
  if (n.includes("localidad")) return "localidad";
  // Paraje, caserío, entidad — too granular for our catalog. Skipped.
  return null;
}

// Boundary guard: keep encoding filth out of the catalog at ingest time.
//
// The INDEC feed (and any vendored CSV that passed through a mis-encoded editor)
// can carry (a) a U+00AD SOFT HYPHEN colada mid-word - invisible, but it corrupts
// equality + search on the name ("Agustin Roca" with a hidden soft hyphen, cowork
// demo 2026-07-18); and (b) the classic UTF-8-read-as-CP1252 double-encoding
// artifacts (two-byte sequences that render as A-tilde + a symbol). We REPAIR the
// known double-encodings back to the real accented letter, STRIP the stray soft
// hyphen and any U+FFFD replacement char, then NFC-normalize - so the persisted
// name is what a Spanish reader expects and the encoding-fitness test never has to
// catch it downstream. Order matters: repair the two-byte sequences (some contain
// a U+00AD byte) BEFORE stripping soft hyphens. All non-ASCII targets are written
// as \u escapes so THIS file stays clean under the soft-hyphen scan (scripts/ is scanned).
const MOJIBAKE_REPAIRS: Array<[RegExp, string]> = [
  [/\u00C3\u00A1/g, "\u00E1"],
  [/\u00C3\u00A9/g, "\u00E9"],
  [/\u00C3\u00AD/g, "\u00ED"],
  [/\u00C3\u00B3/g, "\u00F3"],
  [/\u00C3\u00BA/g, "\u00FA"],
  [/\u00C3\u00B1/g, "\u00F1"],
  [/\u00C3\u00A0/g, "\u00E0"],
  [/\u00C3\u00BC/g, "\u00FC"],
  [/\u00C2\u00BF/g, "\u00BF"],
  [/\u00C2\u00B0/g, "\u00B0"],
];

export function sanitizeLocalityText(raw: string): string {
  let s = raw;
  for (const [bad, good] of MOJIBAKE_REPAIRS) s = s.replace(bad, good);
  // Strip stray U+00AD soft hyphens and any U+FFFD replacement chars.
  s = s.replace(/[\u00AD\uFFFD]/g, "");
  return s.normalize("NFC").trim();
}

function slugify(s: string): string {
  return sanitizeLocalityText(s)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Parse the lat/lng strings INDEC ships (signed decimals, ~14 digits). We keep
// them as strings — Drizzle's numeric column accepts string for precision.
function parseCoordinate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return null;
  // Clamp precision to our column scale (10, 7) — i.e. up to 7 decimal places.
  return n.toFixed(7);
}

export type ImportStats = {
  inserted: number;
  updated: number;
  noop: number;
  removed: number;
  skipped: number;
  errors: { row: number; reason: string }[];
  /** True when the live fetch failed and the bundled sample fixture was used instead. */
  usedFallback?: boolean;
};

export async function runImport(options?: {
  dryRun?: boolean;
  /** Explicit URL to fetch the CSV from. Takes precedence over INDEC_LOCALITIES_CSV. */
  sourceUrl?: string;
  /**
   * Absolute or repo-relative path to a local CSV file. When set, no network
   * request is made. Defaults to the INDEC_LOCALITIES_CSV env var if present.
   */
  localCsvPath?: string;
}): Promise<ImportStats> {
  const dryRun = options?.dryRun ?? false;
  const localCsvPath = options?.localCsvPath ?? process.env.INDEC_LOCALITIES_CSV;
  const sourceUrl = localCsvPath
    ? `file://${localCsvPath}`
    : (options?.sourceUrl ?? DEFAULT_SOURCE_URL);
  const source: ArgentineLocalitySource = "indec_cppdyl";

  // 1. Open the import run row first so partial / failed runs are still traced.
  const [run] = await db
    .insert(arLocalitiesImportRuns)
    .values({ source, sourceUrl, status: "running" })
    .returning();

  console.log(`Started import run ${run.id} (dryRun=${dryRun})`);

  const stats: ImportStats = {
    inserted: 0,
    updated: 0,
    noop: 0,
    removed: 0,
    skipped: 0,
    errors: [],
    usedFallback: false,
  };

  // Track whether we fell back to the bundled fixture so the caller (and logs)
  // can distinguish a degraded-mode run from a full-catalog run.
  let usedFallback = false;

  try {
    // 2. Load the CSV — from a local file, a URL, or the fallback fixture.
    let csvText: string;
    let sourceVersion: string;

    if (localCsvPath) {
      // Vendored local file: no network dependency.
      console.log(`Loading CSV from local file: ${localCsvPath}`);
      csvText = readFileSync(localCsvPath, "utf-8");
      sourceVersion = new Date().toISOString().slice(0, 10);
    } else {
      // Remote fetch — attempt live source, fall back to fixture on failure.
      let fetchOk = false;
      try {
        const res = await fetch(sourceUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        csvText = await res.text();
        sourceVersion = res.headers.get("last-modified") ?? new Date().toISOString().slice(0, 10);
        fetchOk = true;
      } catch (fetchErr) {
        console.warn(
          `[import-indec-localities] WARNING: live fetch failed (${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}).`,
        );
        console.warn(
          `[import-indec-localities] Falling back to bundled sample fixture (${FALLBACK_FIXTURE_PATH}).`,
        );
        console.warn(
          "[import-indec-localities] The catalog will be INCOMPLETE. Run the import again once the source is reachable,",
        );
        console.warn(
          "[import-indec-localities] or set INDEC_LOCALITIES_CSV to a vendored full CSV before bootstrapping.",
        );
        csvText = readFileSync(FALLBACK_FIXTURE_PATH, "utf-8");
        sourceVersion = "fallback-fixture";
        usedFallback = true;
      }
      if (!fetchOk && !usedFallback) {
        // Should not reach here, but keeps TS happy.
        throw new Error("CSV loading failed unexpectedly.");
      }
    }

    // 3. Parse.
    const records: Record<string, string>[] = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
    console.log(`Parsed ${records.length} CSV rows`);

    // 4. Categorize + upsert.
    //
    // Remote latency makes per-row round-trips brutally slow (INDEC ships ~4027
    // localities → ~4k SELECTs + ~4k INSERTs when seeding a fresh DB, which took
    // minutes over the pooler and got killed mid-run). Instead we:
    //   (a) pre-fetch the whole catalog ONCE and index it by indec_id, so the
    //       existence check is an in-memory Map lookup (no per-row SELECT);
    //   (b) collect fresh rows and flush them in chunked multi-row INSERTs.
    // Updates stay per-row: on a fresh seed there are none (all inserts), and on
    // a re-run against an unchanged CSV every row is a no-op, so the hot paths
    // never issue a per-row write. Only a genuinely changed CSV drives updates,
    // and those are few.
    const existingCatalog = await db.select().from(arLocalities);
    const existingByIndecId = new Map<string, (typeof existingCatalog)[number]>();
    for (const r of existingCatalog) {
      if (r.indecId) existingByIndecId.set(r.indecId, r);
    }

    // Rows to insert this run, plus the indec_ids already queued — guards against
    // a (pathological) duplicate id in the CSV double-counting / double-inserting.
    const toInsert: NewArgentineLocality[] = [];
    const queuedInsertIds = new Set<string>();

    // Whole-province aggregate rows we deliberately drop (see the skip below).
    // Their indec_ids are excluded from `importedIndecIds` further down so that
    // an aggregate row left over from an older import gets soft-deleted on the
    // next run — the importer self-heals the province-as-locality overlap.
    const skippedAggregateIds = new Set<string>();

    for (const [idx, row] of records.entries()) {
      const indecId = row.id;
      // Sanitize the human-readable names at the ingest boundary: repair mojibake
      // + strip stray soft hyphens (U+00AD) so no encoding filth is ever persisted.
      const localityName = row.nombre ? sanitizeLocalityText(row.nombre) : row.nombre;
      const codProv = row.provincia_id;
      const rawDepartamentoNombre = row.departamento_nombre || null;
      const departamentoNombre = rawDepartamentoNombre
        ? sanitizeLocalityText(rawDepartamentoNombre)
        : null;
      const departamentoCode = row.departamento_id || null;
      const rawCategory = row.categoria ?? "Localidad simple";

      if (!indecId || !localityName || !codProv) {
        stats.errors.push({
          row: idx + 2,
          reason: "missing required field (id/nombre/provincia_id)",
        });
        continue;
      }

      const provinceCode = PROVINCE_BY_INDEC_CODE[codProv.padStart(2, "0")];
      if (!provinceCode) {
        stats.errors.push({ row: idx + 2, reason: `unknown provincia_id ${codProv}` });
        continue;
      }

      const category = normalizeCategory(rawCategory);
      if (!category) {
        stats.skipped += 1;
        continue;
      }

      // Drop the whole-province aggregate (INDEC ships CABA as a single
      // city-wide 'componente', indec_id 02000010, that double-counts the 48
      // barrios tiling it). isWholeProvinceAggregate isolates exactly that row:
      // name resolves to its own province AND no departamento. Real capital
      // cities that share their province name always carry a departamento, so
      // they are imported normally. Excluding it here (and from
      // importedIndecIds below) keeps a re-import from reintroducing the row.
      if (
        isWholeProvinceAggregate({ provinceCode, localityName, departmentCode: departamentoCode })
      ) {
        skippedAggregateIds.add(indecId);
        stats.skipped += 1;
        continue;
      }

      const slug = slugify(localityName);
      const latitude = parseCoordinate(row.centroide_lat);
      const longitude = parseCoordinate(row.centroide_lon);

      const existing = existingByIndecId.get(indecId);

      if (existing) {
        const isDifferent =
          existing.localityName !== localityName ||
          existing.departmentName !== departamentoNombre ||
          existing.departmentCode !== departamentoCode ||
          existing.category !== category ||
          existing.localitySlug !== slug ||
          existing.latitude !== latitude ||
          existing.longitude !== longitude ||
          existing.removedAt !== null;

        if (isDifferent) {
          if (!dryRun) {
            await db
              .update(arLocalities)
              .set({
                provinceCode,
                localityName,
                localitySlug: slug,
                departmentName: departamentoNombre,
                departmentCode: departamentoCode,
                category,
                latitude,
                longitude,
                sourceVersion,
                lastImportedAt: new Date(),
                removedAt: null,
              })
              .where(eq(arLocalities.id, existing.id));
          }
          stats.updated += 1;
        } else {
          stats.noop += 1;
        }
      } else if (queuedInsertIds.has(indecId)) {
        // Same indec_id appeared twice in this CSV — the first occurrence is
        // already queued; treat the repeat as a no-op rather than double-insert.
        stats.noop += 1;
      } else {
        queuedInsertIds.add(indecId);
        toInsert.push({
          provinceCode,
          departmentName: departamentoNombre,
          departmentCode: departamentoCode,
          localityName,
          localitySlug: slug,
          indecId,
          category,
          latitude,
          longitude,
          source,
          sourceVersion,
        });
        stats.inserted += 1;
      }
    }

    // 4b. Flush inserts in chunked multi-row INSERTs. onConflictDoNothing on the
    // unique indec_id keeps this idempotent even under a concurrent re-run.
    if (!dryRun && toInsert.length > 0) {
      const INSERT_CHUNK = 500;
      for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
        const chunk = toInsert.slice(i, i + INSERT_CHUNK);
        await db.insert(arLocalities).values(chunk).onConflictDoNothing({
          target: arLocalities.indecId,
        });
      }
    }

    // 5. Soft-delete rows tagged with THIS run's source that no longer appear
    // in the CSV. Scoping by source keeps tests with a custom source from
    // mutating the live indec_cppdyl catalog, and manually-curated rows
    // (source='manual') are never touched. We reuse the pre-fetched catalog
    // snapshot (rows inserted this run are all present in the CSV, so they are
    // never removal candidates) and flush the removals in one chunked UPDATE.
    const importedIndecIds = new Set(records.map((r) => r.id).filter(Boolean));
    // A whole-province aggregate row present in the CSV is intentionally NOT
    // imported; drop its id from the "seen" set so an aggregate left over from
    // an older import is treated as gone and soft-deleted below (self-healing).
    for (const id of skippedAggregateIds) importedIndecIds.delete(id);
    const toRemoveIds: string[] = [];
    for (const e of existingCatalog) {
      if (
        e.source === source &&
        e.indecId &&
        !importedIndecIds.has(e.indecId) &&
        e.removedAt === null
      ) {
        toRemoveIds.push(e.id);
      }
    }
    stats.removed = toRemoveIds.length;
    if (!dryRun && toRemoveIds.length > 0) {
      const REMOVE_CHUNK = 500;
      const removedAt = new Date();
      for (let i = 0; i < toRemoveIds.length; i += REMOVE_CHUNK) {
        const chunk = toRemoveIds.slice(i, i + REMOVE_CHUNK);
        await db.update(arLocalities).set({ removedAt }).where(inArray(arLocalities.id, chunk));
      }
    }

    // Propagate fallback flag to stats before finalizing.
    stats.usedFallback = usedFallback;

    // 6. Finalize the import run row.
    if (!dryRun) {
      await db
        .update(arLocalitiesImportRuns)
        .set({
          status: "ok",
          finishedAt: new Date(),
          sourceVersion,
          insertedCount: stats.inserted,
          updatedCount: stats.updated,
          noopCount: stats.noop,
          removedCount: stats.removed,
          details: {
            errors: stats.errors.slice(0, 50),
            skippedNonRelevant: stats.skipped,
            ...(usedFallback ? { usedFallback: true } : {}),
          },
        })
        .where(eq(arLocalitiesImportRuns.id, run.id));
    }

    const fallbackSuffix = usedFallback
      ? " [DEGRADED — used sample fixture, catalog incomplete]"
      : "";
    console.log(
      `Done. inserted=${stats.inserted} updated=${stats.updated} noop=${stats.noop} removed=${stats.removed} skipped=${stats.skipped} errors=${stats.errors.length}${fallbackSuffix}`,
    );
    if (stats.errors.length > 0) {
      console.warn("First few errors:", stats.errors.slice(0, 5));
    }
  } catch (err) {
    if (!dryRun) {
      await db
        .update(arLocalitiesImportRuns)
        .set({
          status: "failed",
          finishedAt: new Date(),
          details: { error: err instanceof Error ? err.message : String(err) },
        })
        .where(eq(arLocalitiesImportRuns.id, run.id));
    }
    throw err;
  }

  return stats;
}

async function cli(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const urlOverride = process.argv.find((a) => a.startsWith("--source-url="))?.split("=")[1];
  // INDEC_LOCALITIES_CSV env var is read inside runImport automatically.
  try {
    const stats = await runImport({ dryRun, sourceUrl: urlOverride });
    if (stats.usedFallback) {
      console.warn(
        "[import-indec-localities] DEGRADED MODE: catalog has only the sample fixture rows.",
        "Re-run when datos.gob.ar is reachable, or set INDEC_LOCALITIES_CSV to a vendored full CSV.",
      );
    }
    process.exit(0);
  } catch (err) {
    console.error("Import failed:", err);
    process.exit(1);
  }
}

// Allow the file to be imported by tests without auto-running the CLI.
const isMain =
  typeof process !== "undefined" && process.argv[1]?.endsWith("import-indec-localities.ts");
if (isMain) {
  cli();
}
