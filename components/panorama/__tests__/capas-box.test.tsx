// @vitest-environment jsdom
//
// CapasBox — panorama-vista-redesign Phase 2.
//
// Simple mode is a presentational surface ONLY — every toggle delegates to
// the parent's onToggle, which is where checkCompatibility actually runs
// (F2). These tests exercise the pass-through: Simple's click-to-remove never
// runs its own compatibility check, and Detalle mode (LayerPanel verbatim)
// still surfaces the real blocked-state hints.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CapasBox } from "@/components/panorama/CapasBox";
import type { LayerPanelState } from "@/components/panorama/LayerPanel";
import { PANORAMA_LAYERS } from "@/src/modules/panorama/domain/layers";
import type { LayerId } from "@/src/modules/panorama/domain/types";

afterEach(cleanup);

function baseStates(): Record<LayerId, LayerPanelState> {
  const out = {} as Record<LayerId, LayerPanelState>;
  for (const l of PANORAMA_LAYERS) {
    out[l.id] = {
      active: false,
      loading: false,
      count: 0,
      suppressedCount: 0,
      noLocalityCount: 0,
      truncated: false,
    };
  }
  return out;
}

describe("CapasBox — Simple mode", () => {
  it("removing an active overlay calls onToggle directly, no compatibility check", () => {
    const states = baseStates();
    states.cobertura = { ...states.cobertura, active: true };
    states.zoonosis = { ...states.zoonosis, active: true };
    const onToggle = vi.fn();

    render(
      <CapasBox
        states={states}
        onToggle={onToggle}
        capasDetail={false}
        onCapasDetailChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Quitar la capa Zoonosis/ }));
    expect(onToggle).toHaveBeenCalledWith("zoonosis");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows the base chip as a non-toggle (no button role)", () => {
    const states = baseStates();
    states.cobertura = { ...states.cobertura, active: true };

    render(
      <CapasBox
        states={states}
        onToggle={vi.fn()}
        capasDetail={false}
        onCapasDetailChange={vi.fn()}
      />,
    );

    const baseChip = screen.getByTitle(/Cobertura antirrábica.*base · choropleth/);
    expect(baseChip.tagName).toBe("SPAN");
  });

  it("the '+N capas' expander flips capasDetail to true", () => {
    const states = baseStates();
    const onCapasDetailChange = vi.fn();

    render(
      <CapasBox
        states={states}
        onToggle={vi.fn()}
        capasDetail={false}
        onCapasDetailChange={onCapasDetailChange}
      />,
    );

    fireEvent.click(screen.getByText(/＋\d+ capas/));
    expect(onCapasDetailChange).toHaveBeenCalledWith(true);
  });
});

describe("CapasBox — Detalle mode (composes LayerPanel verbatim)", () => {
  it("blocked toggle — base conflict shows the disabled checkbox + hint", () => {
    const states = baseStates();
    states.cobertura = { ...states.cobertura, active: true };
    states.denuncias = {
      ...states.denuncias,
      compatibilityHint: "Ya hay una capa base activa (Cobertura antirrábica (perros, 12m)).",
    };

    render(
      <CapasBox
        states={states}
        onToggle={vi.fn()}
        capasDetail={true}
        onCapasDetailChange={vi.fn()}
      />,
    );

    const checkbox = screen.getAllByRole("checkbox").find((el) => {
      const label = el.closest("label");
      return label?.textContent?.includes("Denuncias de bienestar");
    });
    expect(checkbox).toBeDisabled();
    expect(screen.getByText(/Ya hay una capa base activa/)).toBeInTheDocument();
  });

  it("blocked toggle — signal conflict shows the disabled checkbox + hint", () => {
    const states = baseStates();
    states.zoonosis = { ...states.zoonosis, active: true };
    states.reunificacion = {
      ...states.reunificacion,
      compatibilityHint: "Ya hay una señal activa (Zoonosis / señales).",
    };

    render(
      <CapasBox
        states={states}
        onToggle={vi.fn()}
        capasDetail={true}
        onCapasDetailChange={vi.fn()}
      />,
    );

    const checkbox = screen.getAllByRole("checkbox").find((el) => {
      const label = el.closest("label");
      return label?.textContent?.includes("Reunificación");
    });
    expect(checkbox).toBeDisabled();
    expect(screen.getByText(/Ya hay una señal activa/)).toBeInTheDocument();
  });

  it("reference layers always toggle freely (no hint, not disabled)", () => {
    const states = baseStates();
    states.cobertura = { ...states.cobertura, active: true };
    states.zoonosis = { ...states.zoonosis, active: true };
    const onToggle = vi.fn();

    render(
      <CapasBox
        states={states}
        onToggle={onToggle}
        capasDetail={true}
        onCapasDetailChange={vi.fn()}
      />,
    );

    const checkbox = screen.getAllByRole("checkbox").find((el) => {
      const label = el.closest("label");
      return label?.textContent?.includes("Refugios");
    });
    expect(checkbox).not.toBeDisabled();
    fireEvent.click(checkbox!);
    expect(onToggle).toHaveBeenCalledWith("refugios");
  });
});
