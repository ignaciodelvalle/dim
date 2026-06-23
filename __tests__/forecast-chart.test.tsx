/**
 * ForecastChart contract tests (Paquete J, Fase J1).
 *
 * Pattern: renderToStaticMarkup (repo convention — no jsdom). recharts'
 * ResponsiveContainer renders no SVG children in static SSR (zero dimensions),
 * so we assert on the plain-DOM contract the component owns OUTSIDE the chart:
 *   - the figure[role="img"] wrapper + descriptive aria-label,
 *   - data-forecast-* markers that pin the dashed-segment/band/refline decisions,
 *   - the honesty footnote (n + method),
 *   - the crossing callout,
 *   - the insufficient state (message, no band),
 *   - the accessible data table (observed vs proyección rows).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ForecastChart } from "@/components/charts/ForecastChart";
import { projectSeries, targetCrossing } from "@/lib/metrics/forecast";

const RISING = [
  { x: "2026-W01", y: 10 },
  { x: "2026-W02", y: 15 },
  { x: "2026-W03", y: 20 },
  { x: "2026-W04", y: 25 },
  { x: "2026-W05", y: 30 },
  { x: "2026-W06", y: 35 },
];

const SHORT = [
  { x: "2026-W01", y: 5 },
  { x: "2026-W02", y: 8 },
  { x: "2026-W03", y: 11 },
];

describe("ForecastChart — forecast present", () => {
  const result = projectSeries(RISING, { horizon: 3 });

  it("renders a figure[role='img'] with a descriptive aria-label", () => {
    const html = renderToStaticMarkup(
      <ForecastChart result={result} seriesLabel="Esterilizaciones" />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain("Proyección de Esterilizaciones");
    expect(html).toContain("tendencia en aumento");
  });

  it("marks that a confidence band is present (dashed-segment + band exist)", () => {
    const html = renderToStaticMarkup(
      <ForecastChart result={result} seriesLabel="Esterilizaciones" />,
    );
    expect(html).toContain('data-forecast-has-band="true"');
    expect(html).toContain('data-forecast-insufficient="false"');
  });

  it("renders the honesty footnote with n and method", () => {
    const html = renderToStaticMarkup(
      <ForecastChart result={result} seriesLabel="Esterilizaciones" />,
    );
    expect(html).toContain("Proyección de tendencia — no es una garantía");
    expect(html).toContain("n=6");
    expect(html).toContain("método=linear");
  });

  it("renders the accessible data table with observed and proyección rows", () => {
    const html = renderToStaticMarkup(
      <ForecastChart result={result} seriesLabel="Esterilizaciones" />,
    );
    expect(html).toContain("Ver datos");
    expect(html).toContain("observado");
    expect(html).toContain("proyección");
    // The forecast tail renders its band as "y (lo–hi)".
    expect(html).toContain("–");
  });
});

describe("ForecastChart — target reference", () => {
  const result = projectSeries(RISING, { horizon: 3 });

  it("marks that a target reference line is present when a same-unit target is passed", () => {
    const html = renderToStaticMarkup(
      <ForecastChart
        result={result}
        seriesLabel="Esterilizaciones"
        target={{ value: 40, label: "Meta de volumen" }}
      />,
    );
    expect(html).toContain('data-forecast-has-target="true"');
  });

  it("does NOT mark a target when none is provided (J-D3: no %-meta on counts axis)", () => {
    const html = renderToStaticMarkup(
      <ForecastChart result={result} seriesLabel="Esterilizaciones" />,
    );
    expect(html).toContain('data-forecast-has-target="false"');
  });
});

describe("ForecastChart — crossing callout", () => {
  it("renders the reach-target callout when crossing is non-null", () => {
    const result = projectSeries(RISING, { horizon: 3 });
    const crossing = targetCrossing(result, 50, "above"); // 3
    expect(crossing).toBe(3);
    const html = renderToStaticMarkup(
      <ForecastChart
        result={result}
        seriesLabel="Esterilizaciones"
        target={{ value: 50, label: "Meta" }}
        crossing={crossing}
      />,
    );
    expect(html).toContain("Alcanza la meta en aproximadamente 3 períodos");
  });

  it("renders the not-reached callout when crossing is null but a target exists", () => {
    const result = projectSeries(RISING, { horizon: 3 });
    const crossing = targetCrossing(result, 100, "above"); // null
    expect(crossing).toBeNull();
    const html = renderToStaticMarkup(
      <ForecastChart
        result={result}
        seriesLabel="Esterilizaciones"
        target={{ value: 100, label: "Meta" }}
        crossing={crossing}
      />,
    );
    expect(html).toContain("A este ritmo no alcanza la meta");
  });
});

describe("ForecastChart — insufficient data", () => {
  const result = projectSeries(SHORT, { horizon: 3 });

  it("shows the insufficient message and NO band", () => {
    const html = renderToStaticMarkup(
      <ForecastChart result={result} seriesLabel="Esterilizaciones" />,
    );
    expect(html).toContain("Datos insuficientes para proyectar");
    expect(html).toContain('data-forecast-insufficient="true"');
    expect(html).toContain('data-forecast-has-band="false"');
  });

  it("still renders the actuals in the accessible data table", () => {
    const html = renderToStaticMarkup(
      <ForecastChart result={result} seriesLabel="Esterilizaciones" />,
    );
    expect(html).toContain("observado");
    // No forecast rows when insufficient: the type cell ">proyección<" only
    // appears for forecast rows (the word also occurs in the figcaption prose,
    // so we assert on the table-cell form specifically).
    expect(html).not.toContain(">proyección<");
  });

  it("does not throw when rendering the insufficient state", () => {
    expect(() =>
      renderToStaticMarkup(<ForecastChart result={result} seriesLabel="Esterilizaciones" />),
    ).not.toThrow();
  });
});
