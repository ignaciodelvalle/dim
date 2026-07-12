// @vitest-environment jsdom
//
// CabaInset — Round-3 QA fix 3: the CABA mini-map becomes a real drill target.
// Reuses the maplibre-gl mock pattern from components/maps/StaticFirstMap.test.tsx
// (no WebGL/canvas available in jsdom) since CabaInset mounts a real map on the
// synchronous render path via a dynamic `import("maplibre-gl")`.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeMap {
  on() {}
  hasImage() {
    return false;
  }
  addImage() {}
  addSource() {}
  addLayer() {}
  addControl() {}
  getLayer() {
    return null;
  }
  setPaintProperty() {}
  setFilter() {}
  fitBounds() {}
  remove() {}
}

vi.mock("maplibre-gl", () => ({
  default: { Map: FakeMap },
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

// The barrios GeoJSON fetch is irrelevant to the drill-button wiring under
// test and would otherwise hit a real network call in jsdom.
vi.mock("@/components/panorama/geojson-cache", () => ({
  fetchGeojsonCached: vi.fn().mockResolvedValue({ features: [] }),
}));

import { CabaInset } from "./CabaInset";

afterEach(cleanup);

describe("<CabaInset> — Round-3 QA fix 3 (click-to-drill)", () => {
  it("stays a plain, non-interactive panel when no drill target is provided", () => {
    render(<CabaInset layer={null} visible />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("becomes a real <button> with an es-AR accessible label when onDrill is provided", () => {
    const onDrill = vi.fn();
    render(<CabaInset layer={null} visible onDrill={onDrill} />);

    const button = screen.getByRole("button", { name: "Ver CABA en detalle" });
    // A native <button> (not a div+role hack) — Enter/Space activation is free,
    // no bespoke onKeyDown wiring needed.
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("calls onDrill when clicked — the SAME drill seam a main-map province click uses", () => {
    const onDrill = vi.fn();
    render(<CabaInset layer={null} visible onDrill={onDrill} />);

    fireEvent.click(screen.getByRole("button", { name: "Ver CABA en detalle" }));
    expect(onDrill).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when not visible, regardless of onDrill", () => {
    const { container } = render(<CabaInset layer={null} visible={false} onDrill={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
