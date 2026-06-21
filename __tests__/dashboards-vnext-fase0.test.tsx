/**
 * Dashboards vNext — Fase 0 contract tests.
 *
 * These pin the rendering contract of `OpKpi` when the full set of Fase 0
 * props is used together: deltaV2, sparkline, bar, tone, info, drillHref.
 *
 * The component already supports these props (they were added in a prior PR).
 * This test file ensures the combination renders without error and that the
 * Fase 0 caller-side contract is stable — i.e. a future refactor cannot
 * silently drop deltaV2 text, the drill link, or the info ⓘ button.
 *
 * Pattern: renderToStaticMarkup (repo convention — no jsdom required).
 * Matches the approach used in __tests__/ux-2.3-dataviz.test.tsx.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OpKpi } from "@/components/ui/dashboard/OpKpi";

// ---------------------------------------------------------------------------
// Shared fixture — a fully-populated Fase 0 KPI tile.
// ---------------------------------------------------------------------------

const FASE0_KPI = (
  <OpKpi
    label="Cobertura antirrábica"
    value="72%"
    tone="warn"
    bar={72}
    deltaV2={{ value: 5.3, period: "vs mes anterior" }}
    sparkline={[60, 65, 68, 70, 72]}
    info={{
      definition: "Porcentaje de perros con vacunación antirrábica vigente en el ámbito.",
      formula: "dogs_vaccinated / dogs_active * 100",
      caveat: "Meta legal: 80 %. Valores por debajo activan alerta.",
    }}
    drillHref="/gob/vacunacion"
  />
);

// ---------------------------------------------------------------------------
// Rendering contract
// ---------------------------------------------------------------------------

describe("OpKpi — Fase 0 full-prop contract", () => {
  it("renders without throwing when all Fase 0 props are combined", () => {
    // If any prop causes a runtime error, renderToStaticMarkup throws.
    expect(() => renderToStaticMarkup(FASE0_KPI)).not.toThrow();
  });

  it("renders the KPI label", () => {
    const html = renderToStaticMarkup(FASE0_KPI);
    expect(html).toContain("Cobertura antirrábica");
  });

  it("renders the KPI value", () => {
    const html = renderToStaticMarkup(FASE0_KPI);
    expect(html).toContain("72%");
  });

  it("renders the deltaV2 value with sign and period label", () => {
    const html = renderToStaticMarkup(FASE0_KPI);
    // Positive delta: rendered as "+5.3%"
    expect(html).toContain("+5.3%");
    expect(html).toContain("vs mes anterior");
  });

  it("renders the deltaV2 arrow glyph for a positive change", () => {
    const html = renderToStaticMarkup(FASE0_KPI);
    // Up arrow (↑) for positive deltaV2.value.
    expect(html).toContain("↑");
  });

  it("renders a negative deltaV2 correctly", () => {
    const html = renderToStaticMarkup(
      <OpKpi
        label="Tasa de adopción"
        value="18%"
        tone="danger"
        deltaV2={{ value: -3.0, period: "vs mes anterior" }}
      />,
    );
    // Negative delta: rendered as "-3%" (no plus sign).
    expect(html).toContain("-3%");
    expect(html).toContain("↓");
  });

  it("renders the drill link with the correct href", () => {
    const html = renderToStaticMarkup(FASE0_KPI);
    expect(html).toContain('href="/gob/vacunacion"');
    // The link text should be the "Ver detalle" pattern.
    expect(html).toContain("Ver detalle");
  });

  it("renders the ⓘ info button when info prop is provided", () => {
    const html = renderToStaticMarkup(FASE0_KPI);
    expect(html).toContain("ⓘ");
    expect(html).toContain("Información sobre este indicador");
  });

  it("renders the info ⓘ button (tooltip body is closed in SSR — aria-expanded='false')", () => {
    // InfoButton uses useState(false): the tooltip panel is NOT emitted in
    // renderToStaticMarkup.  The contract for this test is therefore that:
    //   (a) the ⓘ button itself renders (verified in the test above), and
    //   (b) aria-expanded is 'false' — meaning the closed state is announced
    //       correctly to assistive technology even in the static render.
    const html = renderToStaticMarkup(FASE0_KPI);
    expect(html).toContain('aria-expanded="false"');
  });

  it("does NOT render drill link when drillHref is omitted", () => {
    const html = renderToStaticMarkup(<OpKpi label="Total" value={42} tone="neutral" />);
    expect(html).not.toContain("Ver detalle");
  });

  it("does NOT render ⓘ button when info prop is omitted", () => {
    const html = renderToStaticMarkup(<OpKpi label="Total" value={42} tone="neutral" />);
    expect(html).not.toContain("ⓘ");
  });

  it("renders warn-tone card class when tone='warn'", () => {
    const html = renderToStaticMarkup(FASE0_KPI);
    // warn tone maps to bg-ln-op-warn-bg token.
    expect(html).toContain("ln-op-warn");
  });

  it("renders ok-tone card class when tone='ok'", () => {
    const html = renderToStaticMarkup(<OpKpi label="Microchip" value="83%" tone="ok" />);
    expect(html).toContain("ln-op-ok");
  });

  it("renders danger-tone card class when tone='danger'", () => {
    const html = renderToStaticMarkup(<OpKpi label="Adopciones" value="10%" tone="danger" />);
    expect(html).toContain("ln-op-danger");
  });
});
