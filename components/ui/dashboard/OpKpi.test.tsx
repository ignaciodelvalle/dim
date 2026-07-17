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
});
