// Sparkline — inline SVG trend line for the Panorama unit-history panel (F4).
//
// Renders a <polyline> over a number series with no external dependencies.
// The pure path-math helper (sparklinePath) is exported separately so it can
// be unit-tested without React or a DOM.
//
// Accessibility: role="img" + aria-label provided by the caller
// (e.g. "Tendencia de {metric}: {n} puntos").

/**
 * Convert a numeric series to an SVG `<polyline>` points attribute string.
 *
 * Contract:
 *   - Empty series → "" (caller hides the element).
 *   - Single point → horizontal mid-line (one point at center).
 *   - Flat series (all equal) → horizontal line at height/2.
 *   - Normal series → min maps to bottom (y=height), max maps to top (y=0).
 *
 * Returns a space-separated "x,y" string suitable for <polyline points="...">.
 *
 * @pure — no side effects, no DOM, no React. Safe to call in Node/Vitest.
 */
export function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const xStep = values.length === 1 ? 0 : width / (values.length - 1);

  return values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : i * xStep;
      // When all values are equal (range === 0) render at vertical center.
      const y = range === 0 ? height / 2 : height - ((v - min) / range) * height;
      // Round to 2 decimal places to keep SVG output tidy.
      return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
    })
    .join(" ");
}

type SparklineProps = {
  /** The numeric series to plot — one value per time bucket. */
  points: number[];
  /** SVG canvas width in px (default 120). */
  width?: number;
  /** SVG canvas height in px (default 32). */
  height?: number;
  /** Accessible label, e.g. "Tendencia de mordeduras: 12 puntos". */
  ariaLabel: string;
};

/**
 * Inline SVG sparkline. Renders a single <polyline> with no external deps.
 * Empty or single-point series are handled gracefully (no render / mid-point).
 */
export function Sparkline({ points, width = 120, height = 32, ariaLabel }: SparklineProps) {
  const pts = sparklinePath(points, width, height);

  if (!pts) {
    // Empty series — render a muted placeholder line at mid height.
    return (
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="overflow-visible"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 3"
          className="text-ln-op-line"
        />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel}
      className="overflow-visible"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-ln-op-azul"
      />
    </svg>
  );
}
