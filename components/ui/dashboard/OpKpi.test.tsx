// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OpKpi } from "./OpKpi";

// Regression — Cowork B6: on /gob/programa the KPI tiles wrap the whole card in
// an <a href>. The ⓘ info button is a DESCENDANT of that anchor, so a click on
// it used to trigger the anchor's native navigation instead of opening the
// tooltip. The fix calls e.preventDefault() (not just stopPropagation) in the
// button handler so the ancestor <a>'s default navigation is cancelled.
describe("OpKpi — ⓘ inside an href-wrapped tile", () => {
  const info = {
    definition: "Qué mide este indicador.",
    formula: "a / b × 100",
    caveat: "Se suprimen celdas con menos de 5 casos.",
  };

  afterEach(cleanup);

  it("clicking ⓘ opens the tooltip and does NOT navigate the tile link", () => {
    render(<OpKpi label="Cobertura" value="64,3%" href="/gob/poblacion" info={info} />);

    const infoBtn = screen.getByRole("button", { name: /Información sobre este indicador/i });

    // fireEvent returns false when the handler called preventDefault — i.e.
    // the ancestor <a>'s native navigation was cancelled.
    expect(fireEvent.click(infoBtn)).toBe(false);

    // …and the tooltip content is now visible.
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(screen.getByText("Qué mide este indicador.")).toBeTruthy();
  });

  it("the backdrop dismiss click also cancels navigation", () => {
    render(<OpKpi label="Cobertura" value="64,3%" href="/gob/poblacion" info={info} />);

    fireEvent.click(screen.getByRole("button", { name: /Información sobre este indicador/i }));
    const backdrop = screen.getByRole("button", { name: /Cerrar información/i });

    expect(fireEvent.click(backdrop)).toBe(false);
  });

  // PO directive (no loose glyphs/emojis): the ⓘ literal is retired in favour of
  // the app's Icon registry. The trigger must render the registry `info` glyph,
  // not a bare unicode character.
  it("renders the ⓘ trigger through the Icon registry, not a literal glyph", () => {
    const { container } = render(<OpKpi label="Cobertura" value="64,3%" info={info} />);
    const trigger = screen.getByRole("button", { name: /Información sobre este indicador/i });
    expect(trigger.querySelector('[data-icon-name="info"]')).toBeTruthy();
    expect(container.textContent ?? "").not.toContain("ⓘ");
  });
});

// Track B (dashboards milestone) — legibility / honesty.
describe("OpKpi — stock-vs-flow framing is DERIVED from the contract", () => {
  afterEach(cleanup);

  const NOTE = /no varía con el período/i;

  it("tags a point-in-time stock without the caller remembering to", () => {
    // open_welfare_reports is basis:"stock", window:"now" in the catalog. A
    // stock under a period picker "lies by proximity" — the control implies it
    // moves the number and it does not. 181 call sites cannot be trusted to
    // remember that; the contract already knows it.
    render(<OpKpi label="Denuncias abiertas" value="42" descriptorId="open_welfare_reports" />);
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it("leaves a flow metric alone — the period control DOES move it", () => {
    render(<OpKpi label="Esterilizaciones" value="120" descriptorId="sterilizations_per_month" />);
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it("does not tag a tile with no descriptor (the grandfathered majority)", () => {
    render(<OpKpi label="Algo" value="7" />);
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it("an explicit periodInvariant={false} still wins over the derivation", () => {
    render(
      <OpKpi
        label="Denuncias abiertas"
        value="42"
        descriptorId="open_welfare_reports"
        periodInvariant={false}
      />,
    );
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});

describe("OpKpi — the delta names its base, and 'Normal' stays quiet", () => {
  afterEach(cleanup);

  it("shows the prior-period base so a percentage is checkable", () => {
    render(
      <OpKpi
        label="Casos"
        value="3.021"
        deltaV2={{ value: 139, period: "vs mes anterior" }}
        guardInput={{ priorBase: 1263 }}
      />,
    );
    // A bare "+139%" is a press figure; naming the base makes it auditable.
    expect(screen.getByText(/desde 1\.263/)).toBeTruthy();
  });

  it("omits the base when the caller has no prior count to show", () => {
    render(
      <OpKpi label="Casos" value="3.021" deltaV2={{ value: 139, period: "vs mes anterior" }} />,
    );
    expect(screen.queryByText(/desde/)).toBeNull();
  });

  it("announces exception states but NOT the default one", () => {
    const { container: danger } = render(<OpKpi label="Vencidos" value="9" tone="danger" />);
    expect(danger.textContent).toContain("Peligro:");
    cleanup();
    // "Normal:" asserted a verdict the data often does not support, and buried
    // the real label behind it on every healthy tile.
    const { container: ok } = render(<OpKpi label="Al día" value="9" tone="ok" />);
    expect(ok.textContent).not.toContain("Normal");
  });
});
