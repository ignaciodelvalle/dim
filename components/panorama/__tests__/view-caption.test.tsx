// @vitest-environment jsdom
//
// ViewCaption (Epic C1) — the persistent view-description strip above the legend.
//
// FIX GUARD (PO: "el box le queda chico a Brotes Activos"): the strip clamps to
// two lines but must ALWAYS expose the full text via an explicit "Ver más" toggle
// when the caption overflows — never silently clipped (the old `title`-only path
// was unreachable on touch). jsdom does not lay out text, so we drive the overflow
// signal (scrollHeight > clientHeight) the component measures.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ViewCaption } from "@/components/panorama/ViewCaption";

afterEach(cleanup);

/** Force the measured overflow state jsdom cannot compute (0×0 layout). */
function mockOverflow(overflowing: boolean) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(overflowing ? 100 : 20);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(20);
}

const LONG = "Brotes activos — Argentina (todas las provincias), últimos 90 días, capas: focos, señales de zoonosis, cobertura antirrábica.";

describe("ViewCaption", () => {
  it("always keeps the full text reachable via the title attribute", () => {
    mockOverflow(false);
    render(<ViewCaption text={LONG} />);
    expect(screen.getByTitle(LONG)).toBeInTheDocument();
  });

  it("clamps by default (line-clamp-2) so the map is not buried", () => {
    mockOverflow(true);
    render(<ViewCaption text={LONG} />);
    expect(screen.getByText(LONG)).toHaveClass("line-clamp-2");
  });

  it("exposes a 'Ver más' toggle when the caption overflows the clamp", () => {
    mockOverflow(true);
    render(<ViewCaption text={LONG} />);
    expect(screen.getByRole("button", { name: "Ver más" })).toBeInTheDocument();
  });

  it("expands to the full unclamped text on 'Ver más', and can collapse again", () => {
    mockOverflow(true);
    render(<ViewCaption text={LONG} />);
    const p = screen.getByText(LONG);
    expect(p).toHaveClass("line-clamp-2");

    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(p).not.toHaveClass("line-clamp-2");
    const collapse = screen.getByRole("button", { name: "Ver menos" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(collapse);
    expect(screen.getByText(LONG)).toHaveClass("line-clamp-2");
  });

  it("shows NO toggle when the caption fits within the clamp", () => {
    mockOverflow(false);
    render(<ViewCaption text="Nacional, últimos 90 días." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
