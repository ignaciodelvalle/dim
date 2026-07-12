// @vitest-environment jsdom
//
// KpiChips — Round-2 review #4 (H8 + a11y). Pins the fix: the base-selecting
// cards are promoted from `aria-pressed` to a true `role="radiogroup"` /
// `role="radio"` + `aria-checked` (matching PresetPanel.tsx's pattern), with
// roving-tabindex arrow-key navigation that skips read-only cards. Read-only
// KPIs (no base map layer, e.g. zoonosis / reunificación — signal-role
// layers) carry no radio semantics and are excluded from the group.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PanoramaKpi,
  PanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { KpiChips } from "./KpiChips";

/** Minimal PanoramaKpi fixture — only the fields KpiChips reads matter. */
function kpi(id: string, label: string, value: string): PanoramaKpi {
  return {
    id: id as PanoramaKpi["id"],
    label,
    value,
    tone: "neutral",
    info: { definition: `Definición de ${label}.` },
    href: "/gob/mock",
    source: "mock",
  };
}

// Interleaved selectable/read-only order, mirroring a real preset's `metrics`
// array (e.g. presets.ts:111 `["cobertura", "zoonosis", "mordeduras"]`):
//   cobertura (base → selectable), zoonosis (signal → read-only),
//   esterilizacion (base → selectable), reunificacion (signal → read-only).
const KPIS: PanoramaKpis = {
  kpis: [
    kpi("cobertura", "Cobertura antirrábica", "64%"),
    kpi("zoonosis", "Señales de zoonosis", "3"),
    kpi("esterilizacion", "Cobertura de esterilización", "38%"),
    kpi("reunificacion", "Reunificación", "71%"),
  ],
  recalculatedFor: "Argentina · 90 días",
  dataAsOf: null,
};

afterEach(cleanup);

describe("KpiChips — radiogroup semantics (Round-2 review #4)", () => {
  it("exposes role=radiogroup with exactly the selectable (base-layer) cards as radios", () => {
    render(
      <KpiChips
        kpis={KPIS}
        metricIds={null}
        presetId={null}
        activeBaseLayerId="cobertura"
        onRebase={vi.fn()}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Indicadores de esta vista" });
    const radios = within(group).getAllByRole("radio");
    // Only cobertura + esterilizacion are base-role layers — zoonosis and
    // reunificación (signal-role) are read-only and must NOT appear as radios.
    expect(radios).toHaveLength(2);
    expect(within(group).queryByRole("radio", { name: /zoonosis/i })).not.toBeInTheDocument();
    expect(within(group).queryByRole("radio", { name: /reunificaci/i })).not.toBeInTheDocument();
  });

  it("read-only cards carry no radio semantics and are aria-disabled", () => {
    render(
      <KpiChips
        kpis={KPIS}
        metricIds={null}
        presetId={null}
        activeBaseLayerId="cobertura"
        onRebase={vi.fn()}
      />,
    );

    const zoonosisCard = screen.getByText("Señales de zoonosis").closest('[aria-disabled="true"]');
    expect(zoonosisCard).not.toBeNull();
    expect(zoonosisCard).not.toHaveAttribute("role", "radio");
    expect(zoonosisCard).not.toHaveAttribute("aria-checked");
  });

  it("aria-checked toggles with the active base layer", () => {
    const { rerender } = render(
      <KpiChips
        kpis={KPIS}
        metricIds={null}
        presetId={null}
        activeBaseLayerId="cobertura"
        onRebase={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: /Cobertura antirrábica/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: /Cobertura de esterilización/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    rerender(
      <KpiChips
        kpis={KPIS}
        metricIds={null}
        presetId={null}
        activeBaseLayerId="esterilizacion"
        onRebase={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: /Cobertura antirrábica/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: /Cobertura de esterilización/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("a click on an inactive selectable card calls onRebase with its layer id", () => {
    const onRebase = vi.fn();
    render(
      <KpiChips
        kpis={KPIS}
        metricIds={null}
        presetId={null}
        activeBaseLayerId="cobertura"
        onRebase={onRebase}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Cobertura de esterilización/ }));
    expect(onRebase).toHaveBeenCalledWith("esterilizacion");
  });

  it("arrow keys move focus between radios only, skipping the interleaved read-only card", () => {
    render(
      <KpiChips
        kpis={KPIS}
        metricIds={null}
        presetId={null}
        activeBaseLayerId="cobertura"
        onRebase={vi.fn()}
      />,
    );

    const first = screen.getByRole("radio", { name: /Cobertura antirrábica/ });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });

    // zoonosis sits between the two radios in display order but is not part
    // of the radiogroup — focus must land on the next RADIO, not on it.
    expect(screen.getByRole("radio", { name: /Cobertura de esterilización/ })).toHaveFocus();
  });

  it("Enter commits the focused radio without a click", () => {
    const onRebase = vi.fn();
    render(
      <KpiChips
        kpis={KPIS}
        metricIds={null}
        presetId={null}
        activeBaseLayerId="cobertura"
        onRebase={onRebase}
      />,
    );

    const first = screen.getByRole("radio", { name: /Cobertura antirrábica/ });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    const second = screen.getByRole("radio", { name: /Cobertura de esterilización/ });
    fireEvent.keyDown(second, { key: "Enter" });

    expect(onRebase).toHaveBeenCalledWith("esterilizacion");
  });
});
