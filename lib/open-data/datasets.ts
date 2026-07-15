// Public open-data datasets (Epic B, items 2-3) — Ley 27.275 active transparency.
//
// Five province-level AGGREGATE datasets, each computed from the SAME canonical
// fetcher the authenticated government dashboards use (so the public figures can
// never diverge from the internal ones), then routed through province-tier
// k=5 suppression (lib/open-data/province-suppression.ts) BEFORE anything leaves
// this module. A suppressed cell emits SUPPRESSED_MARKER in every numeric column
// — never a value, never a 0.
//
// WHAT IS PUBLISHED (the re-identification surface — see docs/datos-abiertos):
//  - Province NAME + ISO 3166-2:AR code (public geography).
//  - A population BASE count per rate dataset (an aggregate ≥ k; census-like).
//  - A coverage/compliance PERCENTAGE, or a raw count for the density dataset.
// WHAT IS NEVER PUBLISHED: no PII, no DNI, no per-pet rows, no public tokens, no
// locality/exact location, no raw numerator (recoverable only to a safe ≥ k
// approximation from base × rate for the cells we DO publish).
//
// UNAUTHENTICATED-SAFE: the builders run the fetchers with a synthesized
// admin/national ProjectionContext purely to obtain NATIONAL scope. The fetchers
// read analyticsDb (service-role, BYPASSRLS) and emit only aggregates, so this
// bypasses no meaningful guard — the ONLY output is k-anonymized province data.
// The heavy per-request cost is bounded by caching this at the route boundary.

import "server-only";

import { resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import {
  fetchMicrochipPenetrationByProvince,
  fetchPppComplianceByProvince,
} from "@/lib/analytics/compliance-metrics";
import { PROVINCE_ISO_MAP } from "@/lib/analytics/govt-dashboards";
import { fetchRabiesCoverageByProvince } from "@/lib/analytics/govt-home-kpis";
import { buildProjectionContext } from "@/lib/metrics/context";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import {
  type DensityRow,
  OPEN_DATA_K,
  type RateRow,
  SUPPRESSED_MARKER,
  suppressDensityProvinces,
  suppressRateProvinces,
} from "@/lib/open-data/province-suppression";
import { loadMortalityByProvince } from "@/src/modules/panorama/infrastructure/repository";

/** The stable dataset slugs (the `[dataset]` route segment + download filenames). */
export const DATASET_IDS = [
  "cobertura-antirrabica",
  "cobertura-esterilizacion",
  "cobertura-microchip",
  "cumplimiento-ppp",
  "mortalidad",
] as const;

export type DatasetId = (typeof DATASET_IDS)[number];

export function isDatasetId(value: string): value is DatasetId {
  return (DATASET_IDS as readonly string[]).includes(value);
}

/** CC-BY 4.0 with the es-AR attribution string served alongside every dataset. */
export const OPEN_DATA_LICENSE = {
  id: "CC-BY-4.0",
  name: "Creative Commons Atribución 4.0 Internacional (CC BY 4.0)",
  url: "https://creativecommons.org/licenses/by/4.0/deed.es",
  attribution: "MiMAR — Sistema de credencial digital de mascotas (Argentina). datos.mimar.gob.ar",
} as const;

/** A published column: machine name (the CSV/JSON key) + a citizen description. */
export type DatasetColumn = { name: string; description: string };

/** Static, citizen-facing metadata for one dataset. Rendered on the transparency
 *  page card AND embedded in every download's metadata (headers + JSON `meta`). */
export type DatasetDescriptor = {
  id: DatasetId;
  title: string;
  summary: string;
  /** What a single ROW represents (the k-anon unit). */
  unit: string;
  /** How often the underlying figures change. */
  cadence: string;
  columns: DatasetColumn[];
  /** One-line human summary of the suppression rule for this dataset. */
  suppressionRule: string;
};

// Shared column definitions (kept verbatim so page + dictionary + headers agree).
const COL_PROVINCIA: DatasetColumn = {
  name: "provincia",
  description: "Nombre de la provincia (o CABA).",
};
const COL_CODIGO_ISO: DatasetColumn = {
  name: "codigo_iso",
  description: "Código ISO 3166-2:AR de la jurisdicción (por ejemplo AR-B, AR-C).",
};

const RATE_SUPPRESSION = `Se publica "${SUPPRESSED_MARKER}" en las columnas numéricas cuando la población base es menor a ${OPEN_DATA_K}, o cuando el grupo cubierto o el grupo no cubierto tiene entre 1 y ${OPEN_DATA_K - 1} individuos. Supresión complementaria a nivel nacional para evitar la reconstrucción por diferencia.`;
const DENSITY_SUPPRESSION = `Se publica "${SUPPRESSED_MARKER}" cuando el conteo de la provincia es menor a ${OPEN_DATA_K}. Supresión complementaria a nivel nacional para evitar la reconstrucción por diferencia.`;

export const DATASET_DESCRIPTORS: Record<DatasetId, DatasetDescriptor> = {
  "cobertura-antirrabica": {
    id: "cobertura-antirrabica",
    title: "Cobertura de vacunación antirrábica",
    summary:
      "Porcentaje de perros con vacuna antirrábica vigente por provincia (ventana móvil de 12 meses).",
    unit: "Una fila por provincia. El grupo protegido son los perros registrados de la provincia.",
    cadence: "Actualización diaria (instantánea). Ventana móvil de los últimos 12 meses.",
    columns: [
      COL_PROVINCIA,
      COL_CODIGO_ISO,
      {
        name: "perros_registrados",
        description:
          "Cantidad de perros registrados en la provincia (población base del indicador).",
      },
      {
        name: "cobertura_antirrabica_pct",
        description: "Porcentaje de esos perros con una vacuna antirrábica vigente (0-100).",
      },
    ],
    suppressionRule: RATE_SUPPRESSION,
  },
  "cobertura-esterilizacion": {
    id: "cobertura-esterilizacion",
    title: "Cobertura de esterilización",
    summary:
      "Porcentaje de mascotas activas con al menos una esterilización registrada, por provincia.",
    unit: "Una fila por provincia. El grupo protegido son las mascotas activas de la provincia.",
    cadence: "Actualización diaria (instantánea, acumulado histórico).",
    columns: [
      COL_PROVINCIA,
      COL_CODIGO_ISO,
      {
        name: "mascotas_activas",
        description: "Cantidad de mascotas activas en la provincia (población base del indicador).",
      },
      {
        name: "cobertura_esterilizacion_pct",
        description:
          "Porcentaje de esas mascotas con al menos una esterilización registrada (0-100).",
      },
    ],
    suppressionRule: RATE_SUPPRESSION,
  },
  "cobertura-microchip": {
    id: "cobertura-microchip",
    title: "Cobertura de microchip",
    summary: "Porcentaje de mascotas activas con microchip ISO activo, por provincia.",
    unit: "Una fila por provincia. El grupo protegido son las mascotas activas de la provincia.",
    cadence: "Actualización diaria (instantánea, acumulado histórico).",
    columns: [
      COL_PROVINCIA,
      COL_CODIGO_ISO,
      {
        name: "mascotas_activas",
        description: "Cantidad de mascotas activas en la provincia (población base del indicador).",
      },
      {
        name: "cobertura_microchip_pct",
        description: "Porcentaje de esas mascotas con un microchip ISO activo (0-100).",
      },
    ],
    suppressionRule: RATE_SUPPRESSION,
  },
  "cumplimiento-ppp": {
    id: "cumplimiento-ppp",
    title: "Cumplimiento de registro de perros potencialmente peligrosos (PPP)",
    summary:
      "Porcentaje de perros marcados como potencialmente peligrosos con la declaración de raza registrada, por provincia.",
    unit: "Una fila por provincia. El grupo protegido son los perros PPP de la provincia.",
    cadence: "Actualización diaria (instantánea, acumulado histórico).",
    columns: [
      COL_PROVINCIA,
      COL_CODIGO_ISO,
      {
        name: "perros_ppp",
        description:
          "Cantidad de perros marcados como potencialmente peligrosos en la provincia (población base del indicador).",
      },
      {
        name: "cumplimiento_ppp_pct",
        description: "Porcentaje de esos perros con la declaración de raza registrada (0-100).",
      },
    ],
    suppressionRule: RATE_SUPPRESSION,
  },
  mortalidad: {
    id: "mortalidad",
    title: "Fallecimientos registrados",
    summary: "Cantidad de mascotas registradas actualmente como fallecidas, por provincia.",
    unit: "Una fila por provincia. El grupo protegido son las mascotas fallecidas registradas de la provincia.",
    cadence: "Actualización diaria (instantánea, acumulado histórico).",
    columns: [
      COL_PROVINCIA,
      COL_CODIGO_ISO,
      {
        name: "fallecimientos_registrados",
        description:
          "Cantidad de mascotas de la provincia registradas actualmente como fallecidas.",
      },
    ],
    suppressionRule: DENSITY_SUPPRESSION,
  },
};

/** Absolute site base URL (production-safe; trims an empty env per the QR gotcha). */
function siteBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  return raw.replace(/\/+$/, "") || "https://www.mimar.gob.ar";
}

/** The public methodology + dictionary URLs embedded in every dataset's metadata. */
export function methodologyUrl(): string {
  return `${siteBaseUrl()}/transparencia#metodologia`;
}
export function dictionaryUrl(): string {
  return `${siteBaseUrl()}/transparencia#diccionario`;
}

/** The metadata block that travels with every download (headers + JSON `meta`). */
export type DatasetMeta = {
  id: DatasetId;
  title: string;
  summary: string;
  unit: string;
  cadence: string;
  license: typeof OPEN_DATA_LICENSE;
  methodologyUrl: string;
  dictionaryUrl: string;
  /** ISO timestamp of when this snapshot was generated (frozen by the route cache). */
  generatedAt: string;
  suppression: { k: number; marker: string; rule: string };
  columns: DatasetColumn[];
  rowCount: number;
  suppressedCount: number;
};

export type BuiltDataset = {
  meta: DatasetMeta;
  rows: Record<string, unknown>[];
};

/** A national-scope admin context — the ONLY thing this synthesizes; it grants
 *  NATIONAL aggregate scope, not any authenticated capability. */
function nationalContext() {
  return buildProjectionContext({ role: "admin" }, [], resolveAnalyticsPeriod({}));
}

/** Compact per-dataset builder config: how to fetch the raw rows and which
 *  published column carries the base + value. */
type RateBuild = {
  kind: "rate";
  baseColumn: string;
  pctColumn: string;
  fetch: () => Promise<RateRow[]>;
};
type DensityBuild = {
  kind: "density";
  countColumn: string;
  fetch: () => Promise<DensityRow[]>;
};

function isoOf(provinceName: string): string | null {
  return PROVINCE_ISO_MAP[provinceName] ?? null;
}

const BUILDERS: Record<DatasetId, RateBuild | DensityBuild> = {
  "cobertura-antirrabica": {
    kind: "rate",
    baseColumn: "perros_registrados",
    pctColumn: "cobertura_antirrabica_pct",
    fetch: async () => {
      const rows = await fetchRabiesCoverageByProvince(nationalContext());
      return rows.flatMap((r) => {
        const code = isoOf(r.province);
        return code
          ? [
              {
                provinceCode: code,
                provinceName: r.province,
                numerator: r.vaccinated,
                denominator: r.total,
                ratePct: r.ratePct,
              },
            ]
          : [];
      });
    },
  },
  "cobertura-esterilizacion": {
    kind: "rate",
    baseColumn: "mascotas_activas",
    pctColumn: "cobertura_esterilizacion_pct",
    fetch: async () => {
      const { byProvince } = await fetchSterilizationCoverage(nationalContext());
      return byProvince.flatMap((r) => {
        const code = isoOf(r.province);
        return code
          ? [
              {
                provinceCode: code,
                provinceName: r.province,
                numerator: r.sterilized,
                denominator: r.total,
                ratePct: r.ratePct,
              },
            ]
          : [];
      });
    },
  },
  "cobertura-microchip": {
    kind: "rate",
    baseColumn: "mascotas_activas",
    pctColumn: "cobertura_microchip_pct",
    fetch: async () => {
      const rows = await fetchMicrochipPenetrationByProvince(nationalContext());
      return rows.flatMap((r) => {
        const code = isoOf(r.province);
        return code
          ? [
              {
                provinceCode: code,
                provinceName: r.province,
                numerator: r.chipped,
                denominator: r.active,
                ratePct: r.ratePct,
              },
            ]
          : [];
      });
    },
  },
  "cumplimiento-ppp": {
    kind: "rate",
    baseColumn: "perros_ppp",
    pctColumn: "cumplimiento_ppp_pct",
    fetch: async () => {
      const rows = await fetchPppComplianceByProvince(nationalContext());
      return rows.flatMap((r) => {
        const code = isoOf(r.province);
        return code
          ? [
              {
                provinceCode: code,
                provinceName: r.province,
                numerator: r.attested,
                denominator: r.flaggedCount,
                ratePct: r.ratePct,
              },
            ]
          : [];
      });
    },
  },
  mortalidad: {
    kind: "density",
    countColumn: "fallecimientos_registrados",
    fetch: async () => {
      const { cells } = await loadMortalityByProvince({ role: "admin" }, []);
      return cells.map((c) => ({
        provinceCode: c.provinceCode,
        provinceName: c.label,
        count: c.value,
      }));
    },
  },
};

/**
 * Build one dataset: fetch canonical national rows, suppress at the province
 * tier, and shape the published rows (suppressed cells → SUPPRESSED_MARKER).
 * Rows are sorted by province name for a stable, diff-friendly download.
 *
 * NOTE: this reads the DB. It is meant to be called through a cache boundary
 * (the route wraps it in unstable_cache) so per-request DB load stays bounded.
 */
export async function buildDataset(id: DatasetId, now: Date = new Date()): Promise<BuiltDataset> {
  const descriptor = DATASET_DESCRIPTORS[id];
  const builder = BUILDERS[id];

  let rows: Record<string, unknown>[];
  let suppressedCount = 0;

  if (builder.kind === "rate") {
    const raw = await builder.fetch();
    const tagged = suppressRateProvinces(raw);
    rows = tagged.map(({ row, suppressed }) => {
      if (suppressed) suppressedCount += 1;
      return {
        provincia: row.provinceName,
        codigo_iso: row.provinceCode,
        [builder.baseColumn]: suppressed ? SUPPRESSED_MARKER : row.denominator,
        [builder.pctColumn]: suppressed ? SUPPRESSED_MARKER : row.ratePct,
      };
    });
  } else {
    const raw = await builder.fetch();
    const tagged = suppressDensityProvinces(raw);
    rows = tagged.map(({ row, suppressed }) => {
      if (suppressed) suppressedCount += 1;
      return {
        provincia: row.provinceName,
        codigo_iso: row.provinceCode,
        [builder.countColumn]: suppressed ? SUPPRESSED_MARKER : row.count,
      };
    });
  }

  rows.sort((a, b) => String(a.provincia).localeCompare(String(b.provincia), "es"));

  const meta: DatasetMeta = {
    id,
    title: descriptor.title,
    summary: descriptor.summary,
    unit: descriptor.unit,
    cadence: descriptor.cadence,
    license: OPEN_DATA_LICENSE,
    methodologyUrl: methodologyUrl(),
    dictionaryUrl: dictionaryUrl(),
    generatedAt: now.toISOString(),
    suppression: { k: OPEN_DATA_K, marker: SUPPRESSED_MARKER, rule: descriptor.suppressionRule },
    columns: descriptor.columns,
    rowCount: rows.length,
    suppressedCount,
  };

  return { meta, rows };
}
