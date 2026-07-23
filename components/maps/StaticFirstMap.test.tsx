// @vitest-environment jsdom
//
// StaticFirstMap — "static-first embed" pattern. Verifies:
//   1. renders a static, non-interactive placeholder by default (no maplibre
//      mount, no tile fetch) with the activation affordance.
//   2. clicking "Activar mapa interactivo" mounts the real MapLibre map with
//      cooperativeGestures/interactive true.
//   3. precision is always paired with TEXT, never color alone.
//
// maplibre-gl mocking mirrors components/charts/MapChoropleth.crossfilter.test.tsx's
// minimal FakeMap approach (no WebGL/canvas available in jsdom).

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mapOptionsSeen: Record<string, unknown>[] = [];
const markerCalls: Array<{ options: Record<string, unknown>; lngLat: unknown }> = [];

const controlsAdded: Array<{ control: unknown; position: unknown }> = [];

class FakeMap {
  options: Record<string, unknown>;
  constructor(options: Record<string, unknown>) {
    this.options = options;
    mapOptionsSeen.push(options);
  }
  remove() {}
  addControl(control: unknown, position: unknown) {
    controlsAdded.push({ control, position });
  }
}

// zoom-out fix (validacion-A 2026-07-23): the component now adds a
// NavigationControl so the fake maplibre-gl module needs one too.
class FakeNavigationControl {
  options: Record<string, unknown>;
  constructor(options: Record<string, unknown>) {
    this.options = options;
  }
}

class FakeMarker {
  options: Record<string, unknown>;
  lngLat: unknown;
  constructor(options: Record<string, unknown>) {
    this.options = options;
  }
  setLngLat(lngLat: unknown) {
    this.lngLat = lngLat;
    markerCalls.push({ options: this.options, lngLat });
    return this;
  }
  addTo() {
    return this;
  }
}

vi.mock("maplibre-gl", () => ({
  default: { Map: FakeMap, Marker: FakeMarker, NavigationControl: FakeNavigationControl },
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

import { StaticFirstMap } from "./StaticFirstMap";

beforeEach(() => {
  mapOptionsSeen.length = 0;
  markerCalls.length = 0;
  controlsAdded.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("<StaticFirstMap> — static-first embed", () => {
  it("renders a static, non-interactive placeholder by default (no map mounted)", () => {
    render(<StaticFirstMap lat={-34.6} lng={-58.4} label="Plaza Italia" />);

    expect(screen.getByText("Activar mapa interactivo")).toBeInTheDocument();
    expect(screen.getByText("Plaza Italia")).toBeInTheDocument();
    // Precision paired with TEXT, not color alone.
    expect(screen.getByText("Ubicación exacta")).toBeInTheDocument();
    expect(mapOptionsSeen).toHaveLength(0);
  });

  it("shows 'Ubicación aproximada' as text (not a bare color swatch) when precision=approx", () => {
    render(<StaticFirstMap lat={-34.6} lng={-58.4} precision="approx" />);
    expect(screen.getByText("Ubicación aproximada")).toBeInTheDocument();
  });

  it("clicking the activation button mounts the real interactive MapLibre map", async () => {
    render(<StaticFirstMap lat={-34.6} lng={-58.4} zoom={16} label="Plaza Italia" />);

    fireEvent.click(screen.getByText("Activar mapa interactivo"));

    await waitFor(() => expect(mapOptionsSeen).toHaveLength(1));

    expect(mapOptionsSeen[0]).toMatchObject({
      center: [-58.4, -34.6],
      zoom: 16,
      interactive: true,
      cooperativeGestures: true,
    });

    await waitFor(() => expect(markerCalls).toHaveLength(1));
    expect(markerCalls[0]?.lngLat).toStrictEqual([-58.4, -34.6]);

    // The static placeholder button is gone; an interactive map container is
    // rendered in its place.
    expect(screen.queryByText("Activar mapa interactivo")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Mapa interactivo de Plaza Italia/)).toBeInTheDocument();
  });

  it("adds a NavigationControl so the viewer has an explicit zoom-out affordance (PO fix, validacion-A 2026-07-23)", async () => {
    render(<StaticFirstMap lat={-34.6} lng={-58.4} />);

    fireEvent.click(screen.getByText("Activar mapa interactivo"));

    await waitFor(() => expect(controlsAdded).toHaveLength(1));
    expect(controlsAdded[0]?.control).toBeInstanceOf(FakeNavigationControl);
    expect((controlsAdded[0]?.control as FakeNavigationControl).options).toMatchObject({
      showCompass: false,
    });
    expect(controlsAdded[0]?.position).toBe("top-right");
  });

  it("removes the map on unmount after activation", async () => {
    const removeSpy = vi.spyOn(FakeMap.prototype, "remove");
    const { unmount } = render(<StaticFirstMap lat={-34.6} lng={-58.4} />);

    fireEvent.click(screen.getByText("Activar mapa interactivo"));
    await waitFor(() => expect(mapOptionsSeen).toHaveLength(1));

    unmount();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
