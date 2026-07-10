// Panorama IA v2 §3.3 — "Peores N" ranking (pure domain helper).
//
// Collapses a layer's FeatureCollection into an ordered list of the worst
// administrative units — the same projection the map draws, re-expressed as a
// ranked list (and, via PanoramaDataTable, an accessible <table>). Framework-
// free: no React, no DB, no maplibre.
//
// PRIVACY INVARIANT (§5.1): a ranked row is NEVER derived from a k-anon
// suppressed cell. Suppressed cells carry value/count = null and are dropped
// before any ordering — no rate or count ever leaks from a < k=5 cell.

import type { FeatureCollection } from "./types";

/** How a layer is ranked: rate → gap vs meta; density → raw count. */
export type RankingKind = "rate" | "density";

/** One ranked administrative unit (row in RankedUnitsPanel / PanoramaDataTable). */
export type RankedUnit = {
  /** Stable identity for map↔row hover sync (province code or place label). */
  key: string;
  /** es-AR display label for the unit. */
  label: string;
  /** The metric value: the rate percentage (rate) or the event count (density). */
  value: number;
  /** target − value for rate layers (how far below meta); null for density. */
  gap: number | null;
};

type RankOptions = {
  kind: RankingKind;
  /** Compliance target (required for rate ranking; ignored for density). */
  target?: number;
  /** Worst-N cap (PO decision #2 = 10). */
  limit?: number;
};

const DEFAULT_LIMIT = 10;

type UnitProps = {
  provinceCode?: unknown;
  label?: unknown;
  place?: unknown;
  name?: unknown;
  /** Province display name carried by the choropleth features (build-features). */
  province?: unknown;
  /** Locality display name carried by the locality-choropleth features. */
  locality?: unknown;
  value?: unknown;
  count?: unknown;
  suppressed?: unknown;
};

/**
 * Pick the stable key + display label from any panorama feature-props shape.
 *
 * Bug fix (2026-07-10): the province/locality CHOROPLETH features
 * (build-features.ts ProvinceChoroplethProps / ChoroplethProps) carry their
 * display name in `province`/`locality`, NOT `label`/`place`/`name` — so this
 * used to return null for EVERY cobertura (rate) cell, leaving rankWorstUnits
 * empty and the panel falsely reporting "Sin jurisdicciones bajo meta" even when
 * every jurisdiction was under meta. `locality` is preferred over `province` so
 * a locality-level cell labels as its locality, not its (repeated) province.
 */
function identify(p: UnitProps): { key: string; label: string } | null {
  const label =
    (typeof p.label === "string" && p.label) ||
    (typeof p.place === "string" && p.place) ||
    (typeof p.name === "string" && p.name) ||
    (typeof p.locality === "string" && p.locality) ||
    (typeof p.province === "string" && p.province) ||
    null;
  const key =
    (typeof p.provinceCode === "string" && p.provinceCode) ||
    (typeof p.place === "string" && p.place) ||
    (typeof p.name === "string" && p.name) ||
    (typeof p.locality === "string" && p.locality) ||
    (typeof p.province === "string" && p.province) ||
    label;
  if (!label || !key) return null;
  return { key, label };
}

/**
 * Rank the worst administrative units for a layer.
 *
 *  - `rate`: units strictly BELOW `target`, ordered by the largest gap first.
 *    An empty result means "no jurisdiction below meta in this scope".
 *  - `density`: units ordered by the highest event count first (gap = null).
 *
 * Suppressed / non-numeric cells are excluded (privacy invariant). Returns at
 * most `limit` rows (default 10).
 */
export function rankWorstUnits(features: FeatureCollection, opts: RankOptions): RankedUnit[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const rows: RankedUnit[] = [];

  for (const f of features.features) {
    const p = f.properties as UnitProps;
    // Never derive a value from a suppressed cell.
    if (p.suppressed === true) continue;

    const id = identify(p);
    if (id === null) continue;

    if (opts.kind === "rate") {
      if (typeof p.value !== "number") continue;
      const target = opts.target ?? 0;
      const gap = target - p.value;
      if (gap <= 0) continue; // at/above meta — not a "worst" unit
      rows.push({ key: id.key, label: id.label, value: p.value, gap });
    } else {
      if (typeof p.count !== "number") continue;
      rows.push({ key: id.key, label: id.label, value: p.count, gap: null });
    }
  }

  rows.sort((a, b) => (opts.kind === "rate" ? (b.gap ?? 0) - (a.gap ?? 0) : b.value - a.value));
  return rows.slice(0, limit);
}
