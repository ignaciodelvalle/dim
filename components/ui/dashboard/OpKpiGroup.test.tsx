// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OpKpi } from "./OpKpi";
import { OpKpiGroup } from "./OpKpiGroup";

// Ola 4 / decision-density audit (2026-07-21): /gob/vigilancia rendered 8 KPI
// tiles across two grids distinguished only by an aria-label — a sighted user
// saw one undifferentiated wall. OpKpiGroup replaces that with a REAL visual
// hierarchy: one primary tile + a supporting grid, with a visible (not
// sr-only) caption when provided.
describe("OpKpiGroup", () => {
  afterEach(cleanup);

  it("renders the primary tile and every secondary tile", () => {
    render(
      <OpKpiGroup
        ariaLabel="Indicadores de vigilancia"
        primary={<OpKpi variant="primary" label="Brotes activos" value="3" />}
        secondary={[
          <OpKpi key="a" label="Rábicas activas" value="1" />,
          <OpKpi key="b" label="Altas registradas hoy" value="5" />,
        ]}
      />,
    );

    expect(screen.getByText("Brotes activos")).toBeTruthy();
    expect(screen.getByText("Rábicas activas")).toBeTruthy();
    expect(screen.getByText("Altas registradas hoy")).toBeTruthy();
  });

  it("wraps the group in a <section> carrying the aria-label", () => {
    render(
      <OpKpiGroup
        ariaLabel="Indicadores de vigilancia"
        primary={<OpKpi label="Brotes activos" value="3" />}
        secondary={[<OpKpi key="a" label="Rábicas activas" value="1" />]}
      />,
    );

    expect(screen.getByRole("region", { name: "Indicadores de vigilancia" })).toBeTruthy();
  });

  it("renders secondaryLabel as VISIBLE text, not sr-only — the whole point of the primitive", () => {
    const { container } = render(
      <OpKpiGroup
        primary={<OpKpi label="Brotes activos" value="3" />}
        secondary={[<OpKpi key="a" label="Rábicas activas" value="1" />]}
        secondaryLabel="Indicadores complementarios"
      />,
    );

    const caption = screen.getByText("Indicadores complementarios");
    expect(caption).toBeTruthy();
    // Must not be inside an sr-only wrapper (that would recreate the exact
    // aria-label-only split the audit flagged).
    expect(caption.className).not.toMatch(/sr-only/);
    expect(container.querySelector(".sr-only")).toBeNull();
  });

  it("omits the caption paragraph entirely when secondaryLabel is not given", () => {
    render(
      <OpKpiGroup
        primary={<OpKpi label="Brotes activos" value="3" />}
        secondary={[<OpKpi key="a" label="Rábicas activas" value="1" />]}
      />,
    );

    expect(screen.queryByText("Indicadores complementarios")).toBeNull();
  });
});

describe("OpKpi — variant prop", () => {
  afterEach(cleanup);

  it("variant='primary' renders a larger value than the default (unstyled) tile", () => {
    render(<OpKpi label="Brotes activos" value="3" variant="primary" />);
    const value = screen.getByText("3");
    expect(value.className).toMatch(/text-4xl/);
  });

  it("omitting variant keeps the original tile styling (backward compatible)", () => {
    render(<OpKpi label="Brotes activos" value="3" />);
    const value = screen.getByText("3");
    expect(value.className).toMatch(/text-\[30px\]/);
    expect(value.className).not.toMatch(/text-4xl/);
  });
});
