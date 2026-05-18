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
 * Run:
 *   pnpm tsx scripts/import-indec-localities.ts            # apply (writes to DB)
 *   pnpm tsx scripts/import-indec-localities.ts --dry-run  # parse + count only
 *   pnpm tsx scripts/import-indec-localities.ts --source-url=<override>
 *
 * Idempotent: re-running a second time produces no changes when the CSV is
 * unchanged. Soft-deletes rows that disappear from the source between runs.
 */

import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";

import { type ArgentineLocalityCategory, arLocalities, arLocalitiesImportRuns, db } from "@/db";
import type { ProvinceCode } from "@/lib/ar-provincias";

const DEFAULT_SOURCE_URL = "https://infra.datos.gob.ar/georef/localidades_censales.csv";

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

function slugify(s: string): string {
  return s
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
};

export async function runImport(options?: {
  dryRun?: boolean;
  sourceUrl?: string;
}): Promise<ImportStats> {
  const dryRun = options?.dryRun ?? false;
  const sourceUrl = options?.sourceUrl ?? DEFAULT_SOURCE_URL;

  // 1. Open the import run row first so partial / failed runs are still traced.
  const [run] = await db
    .insert(arLocalitiesImportRuns)
    .values({ source: "indec_cppdyl", sourceUrl, status: "running" })
    .returning();

  console.log(`Started import run ${run.id} (dryRun=${dryRun})`);

  const stats: ImportStats = {
    inserted: 0,
    updated: 0,
    noop: 0,
    removed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // 2. Download the CSV.
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch CSV: ${res.status} ${res.statusText}`);
    }
    const csvText = await res.text();
    const sourceVersion = res.headers.get("last-modified") ?? new Date().toISOString().slice(0, 10);

    // 3. Parse.
    const records: Record<string, string>[] = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
    console.log(`Parsed ${records.length} CSV rows`);

    // 4. Upsert each row.
    for (const [idx, row] of records.entries()) {
      const indecId = row.id;
      const localityName = row.nombre;
      const codProv = row.provincia_id;
      const departamentoNombre = row.departamento_nombre || null;
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

      const slug = slugify(localityName);
      const latitude = parseCoordinate(row.centroide_lat);
      const longitude = parseCoordinate(row.centroide_lon);

      const existingRows = await db
        .select()
        .from(arLocalities)
        .where(eq(arLocalities.indecId, indecId));
      const existing = existingRows[0];

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
      } else {
        if (!dryRun) {
          await db.insert(arLocalities).values({
            provinceCode,
            departmentName: departamentoNombre,
            departmentCode: departamentoCode,
            localityName,
            localitySlug: slug,
            indecId,
            category,
            latitude,
            longitude,
            source: "indec_cppdyl",
            sourceVersion,
          });
        }
        stats.inserted += 1;
      }
    }

    // 5. Soft-delete INDEC rows that no longer appear in the CSV. Only touch
    // rows whose `source='indec_cppdyl'` so manually-curated rows are spared.
    const importedIndecIds = new Set(records.map((r) => r.id).filter(Boolean));
    const fromIndec = await db
      .select({
        id: arLocalities.id,
        indecId: arLocalities.indecId,
        removedAt: arLocalities.removedAt,
      })
      .from(arLocalities)
      .where(eq(arLocalities.source, "indec_cppdyl"));
    for (const e of fromIndec) {
      if (e.indecId && !importedIndecIds.has(e.indecId) && e.removedAt === null) {
        if (!dryRun) {
          await db
            .update(arLocalities)
            .set({ removedAt: new Date() })
            .where(eq(arLocalities.id, e.id));
        }
        stats.removed += 1;
      }
    }

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
          details: { errors: stats.errors.slice(0, 50), skippedNonRelevant: stats.skipped },
        })
        .where(eq(arLocalitiesImportRuns.id, run.id));
    }

    console.log(
      `Done. inserted=${stats.inserted} updated=${stats.updated} noop=${stats.noop} removed=${stats.removed} skipped=${stats.skipped} errors=${stats.errors.length}`,
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
  try {
    await runImport({ dryRun, sourceUrl: urlOverride });
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
