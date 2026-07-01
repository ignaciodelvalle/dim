// PetWeightChart — card wrapper (title + trend header + sparkline + footer)
// around the weight trend over time.
//
// The sparkline itself was extracted to WeightSparkline.tsx (two-face
// redesign, 2026-07-01, design ADR-8) so Face 2's Libreta can render it
// inline inside a weight-event row <details>, without this card's chrome.
// This component is kept for legacy callers.
//
// Source data: `petEvents` rows where event_type = 'weight_recorded'.
// The page should filter the last N months (default 12) and pass the
// pairs sorted ascending by date.
//
// Annotation: shows current weight + trend % vs the first sample.

import { type WeightSample, WeightSparkline } from "./WeightSparkline";

export type { WeightSample };

interface Props {
  samples: WeightSample[];
  /** Optional caption above the chart. Default "Peso · últimos 12 meses". */
  title?: string;
  /** Pixel height; width is 100%. */
  height?: number;
}

export function PetWeightChart({ samples, title = "Peso · últimos 12 meses", height = 70 }: Props) {
  if (samples.length < 2) {
    return (
      <section className="rounded-xl border border-dashed border-ln-line-strong p-4 text-center text-sm text-ln-mute ">
        Cargá al menos dos pesos para ver la curva.
      </section>
    );
  }

  const sorted = [...samples].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const trendPct = ((last.kg - first.kg) / first.kg) * 100;
  const trendLabel =
    Math.abs(trendPct) < 0.5
      ? "estable"
      : `${trendPct > 0 ? "↑" : "↓"} ${Math.abs(trendPct).toFixed(0)}%`;
  const trendColor =
    Math.abs(trendPct) < 0.5 ? "text-ln-mute " : trendPct > 0 ? "text-ln-ok " : "text-ln-warn ";

  return (
    <section aria-label={title} className="rounded-xl bg-ln-stripe p-3 ">
      <header className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-ln-mute ">{title}</span>
        <span className="font-semibold text-ln-ink ">
          {last.kg.toLocaleString("es-AR", { maximumFractionDigits: 2 })} kg{" "}
          <span className={`ml-1 font-medium ${trendColor}`}>{trendLabel}</span>
        </span>
      </header>
      <WeightSparkline samples={sorted} height={height} />
      <footer className="mt-1 flex items-baseline justify-between text-xs text-ln-mute ">
        <span>{first.date.toLocaleDateString("es-AR", { month: "short", year: "2-digit" })}</span>
        <span>{last.date.toLocaleDateString("es-AR", { month: "short", year: "2-digit" })}</span>
      </footer>
    </section>
  );
}
