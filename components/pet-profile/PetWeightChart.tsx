// PetWeightChart — minimal SVG sparkline of weight over time.
//
// No client JS. Renders an SVG polyline from a list of {date, kg} pairs.
// Designed to sit at the bottom of the Salud card or inline as its own
// card on a wider layout.
//
// Source data: `petEvents` rows where event_type = 'weight_recorded'.
// The page should filter the last N months (default 12) and pass the
// pairs sorted ascending by date.
//
// Annotation: shows current weight + trend % vs the first sample.

export type WeightSample = {
  /** UTC midnight is fine — only relative position matters. */
  date: Date;
  /** Kilograms. Decimal allowed. */
  kg: number;
};

interface Props {
  samples: WeightSample[];
  /** Optional caption above the chart. Default "Peso · últimos 12 meses". */
  title?: string;
  /** Pixel height; width is 100%. */
  height?: number;
}

export function PetWeightChart({
  samples,
  title = "Peso · últimos 12 meses",
  height = 70,
}: Props) {
  if (samples.length < 2) {
    return (
      <section className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Cargá al menos dos pesos para ver la curva.
      </section>
    );
  }

  const sorted = [...samples].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const min = Math.min(...sorted.map((s) => s.kg));
  const max = Math.max(...sorted.map((s) => s.kg));
  const padY = Math.max((max - min) * 0.15, 0.05);
  const yMin = Math.max(0, min - padY);
  const yMax = max + padY;
  const dx = 300 / (sorted.length - 1);
  const points = sorted
    .map((s, i) => {
      const x = i * dx;
      const y = ((yMax - s.kg) / (yMax - yMin)) * (height - 20) + 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const trendPct = ((last.kg - first.kg) / first.kg) * 100;
  const trendLabel =
    Math.abs(trendPct) < 0.5
      ? "estable"
      : `${trendPct > 0 ? "↑" : "↓"} ${Math.abs(trendPct).toFixed(0)}%`;
  const trendColor =
    Math.abs(trendPct) < 0.5
      ? "text-neutral-500 dark:text-neutral-400"
      : trendPct > 0
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-amber-700 dark:text-amber-300";

  return (
    <section
      aria-label={title}
      className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900"
    >
      <header className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">{title}</span>
        <span className="font-semibold text-neutral-900 dark:text-neutral-50">
          {last.kg.toLocaleString("es-AR", { maximumFractionDigits: 2 })} kg{" "}
          <span className={`ml-1 font-medium ${trendColor}`}>{trendLabel}</span>
        </span>
      </header>
      <svg
        viewBox={`0 0 300 ${height}`}
        width="100%"
        height={height}
        aria-hidden
        className="block"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke="#0F6E56"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={(sorted.length - 1) * dx}
          cy={((yMax - last.kg) / (yMax - yMin)) * (height - 20) + 10}
          r="3.5"
          fill="#0F6E56"
        />
      </svg>
      <footer className="mt-1 flex items-baseline justify-between text-[10px] text-neutral-400 dark:text-neutral-500">
        <span>{first.date.toLocaleDateString("es-AR", { month: "short", year: "2-digit" })}</span>
        <span>{last.date.toLocaleDateString("es-AR", { month: "short", year: "2-digit" })}</span>
      </footer>
    </section>
  );
}
