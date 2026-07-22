// OpKpiGroup — KPI hierarchy primitive (Ola 4 / decision-density audit,
// 2026-07-21).
//
// The audit's systemic finding: KPI rows across /gob and /admin dashboards
// render N equal-weight tiles with no primary/secondary distinction — a
// "wall of numbers" the operator has to scan in full before finding the one
// that matters. On /gob/vigilancia the only separation between two such
// grids was an aria-label (sighted users saw nothing).
//
// OpKpiGroup expresses hierarchy visually: ONE headline metric (rendered via
// <OpKpi variant="primary">, larger value/tile) anchors the group; the rest
// render as a denser supporting grid beside/below it. This is additive — it
// does not touch how bare <OpKpi> rows render on the ~10 dashboards that
// don't use it.
//
// Usage:
//   <OpKpiGroup
//     ariaLabel="Indicadores de vigilancia"
//     primary={<OpKpi variant="primary" label="Brotes activos" value={8} href="/gob/vigilancia/brotes" />}
//     secondary={[
//       <OpKpi key="rabies" label="Rábicas activas" value={2} />,
//       <OpKpi key="altas" label="Altas registradas hoy" value={14} />,
//     ]}
//     secondaryLabel="Indicadores complementarios"
//   />
//
// Layout: primary sits in a fixed-width column (200–340px) on desktop with
// the secondary grid filling the rest; both stack full-width on mobile —
// primary card first, supporting grid below it. No JS, no client component.

import type { ReactNode } from "react";

type OpKpiGroupCols = 2 | 3 | 4 | 5 | 6;

const SECONDARY_DESKTOP_COLS: Record<OpKpiGroupCols, string> = {
  2: "sm:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
};

export type OpKpiGroupProps = {
  /** The single headline tile — pass an `<OpKpi variant="primary" ...>`. */
  primary: ReactNode;
  /** Supporting tiles — plain `<OpKpi>` elements (each needs its own `key`). */
  secondary: ReactNode[];
  /** Desktop column count for the secondary grid. Mobile is always 2-up. Default: 4. */
  secondaryCols?: OpKpiGroupCols;
  /**
   * Optional VISIBLE caption above the secondary grid (e.g. "Indicadores
   * complementarios"). Deliberately NOT sr-only — an aria-label-only split
   * is exactly the anti-pattern this primitive replaces (see file header).
   */
  secondaryLabel?: string;
  /** aria-label for the whole group (wraps both the primary and secondary tiles in one <section>). */
  ariaLabel?: string;
  className?: string;
};

export function OpKpiGroup({
  primary,
  secondary,
  secondaryCols = 4,
  secondaryLabel,
  ariaLabel,
  className,
}: OpKpiGroupProps) {
  const gridCols = SECONDARY_DESKTOP_COLS[secondaryCols];
  return (
    <section aria-label={ariaLabel} className={["space-y-3", className].filter(Boolean).join(" ")}>
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(200px,340px)_1fr]">
        <div>{primary}</div>
        <div className="space-y-2">
          {secondaryLabel && (
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
              {secondaryLabel}
            </p>
          )}
          <div className={["grid grid-cols-2", gridCols, "gap-3"].join(" ")}>{secondary}</div>
        </div>
      </div>
    </section>
  );
}
