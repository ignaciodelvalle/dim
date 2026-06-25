/**
 * StackedTimeSeriesChart contract tests (PR-1 — RSC serializable labels).
 *
 * Pattern: renderToStaticMarkup (repo convention — no jsdom). recharts'
 * ResponsiveContainer renders no SVG children in static SSR, so we assert on the
 * accessibility data-table the component always renders: one <th> per series key
 * carrying its resolved es-AR label.
 *
 * Why this exists: the chart is a Client Component. Its label contract MUST be
 * serializable data (a key -> label map), never a function — passing a function
 * across the server -> client boundary crashes the route (Next RSC:
 * "Functions cannot be passed directly to Client Components"). The prop is
 * `seriesLabels: Record<string, string>`, resolved server-side at the call-site.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  type StackedSeriesPoint,
  StackedTimeSeriesChart,
} from "@/components/charts/StackedTimeSeriesChart";

const POINTS: StackedSeriesPoint[] = [
  { x: "2026-W01", values: { disease: 3, accident: 1 } },
  { x: "2026-W02", values: { disease: 5, accident: 2 } },
];

describe("StackedTimeSeriesChart — serializable label contract", () => {
  it("renders resolved es-AR labels from the seriesLabels data map", () => {
    const html = renderToStaticMarkup(
      <StackedTimeSeriesChart
        seriesKeys={["disease", "accident"]}
        points={POINTS}
        seriesLabels={{ disease: "Enfermedad", accident: "Accidente" }}
        fallbackTableLabel="Fallecimientos por semana y causa"
      />,
    );
    expect(html).toContain("Enfermedad");
    expect(html).toContain("Accidente");
    expect(html).toContain("Fallecimientos por semana y causa");
  });

  it("falls back to the raw key when a label is missing from the map", () => {
    const html = renderToStaticMarkup(
      <StackedTimeSeriesChart
        seriesKeys={["disease", "mystery_cause"]}
        points={POINTS}
        seriesLabels={{ disease: "Enfermedad" }}
      />,
    );
    expect(html).toContain("Enfermedad");
    expect(html).toContain("mystery_cause");
  });
});
