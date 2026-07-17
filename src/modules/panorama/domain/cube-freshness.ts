// Panorama cube-freshness stamp (staging QA 2026-07-17, Cursor I2).
//
// The choropleth layers can be served from the precomputed panorama_cube, which
// refreshes on a schedule (once daily on staging). When a view IS cube-served,
// the operator must be able to tell a genuinely empty dataset from one that is
// simply lagging behind — so we declare the cube's build time, honestly and
// unobtrusively.
//
// Pure domain helper: it turns a build timestamp into the es-AR footer line, or
// returns null when there is nothing honest to say (no meta row, never refreshed,
// or an unparseable timestamp). The CALLER decides WHEN to pass a builtAt — the
// cube-vs-live decision lives in the application layer (load-layer-features-cube.ts);
// this only formats what it's given. No DB, no React, no Next.

import { formatDateTimeNumericAr } from "@/lib/utils/format";

/**
 * The es-AR aggregate-freshness footer line for a cube-served view, e.g.
 * "Datos agregados actualizados: 17/07/2026 04:30".
 *
 * Returns `null` (omit the stamp entirely) when `builtAt` is null/undefined —
 * the meta row is missing or the cube was never refreshed — or when the value
 * cannot be parsed into a real date. Omitting is the honest fallback: never show
 * a freshness the cube can't actually back.
 */
export function cubeFreshnessStamp(builtAt: Date | string | null | undefined): string | null {
  if (!builtAt) return null;
  const date = builtAt instanceof Date ? builtAt : new Date(builtAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Datos agregados actualizados: ${formatDateTimeNumericAr(date)}`;
}
