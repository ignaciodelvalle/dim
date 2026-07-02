// @vitest-environment jsdom
//
// PanoramaConsole — router-drop defect fix, scoped to `onPreset` (QA sweep,
// fix/qa-findings-20260702). Committing a preset's period used to write the
// URL via `router.replace`, which Next 15.5.18's App Router can silently drop
// in production (same defect class documented in lib/ui/sheet-nav.ts and
// cured in components/gob/JurisdictionSwitcher.tsx). This console's page
// (app/gob/panorama, app/admin/panorama) server-renders the initial layer +
// KPIs from `?period=` on every request, so a shallow client-router
// transition alone would leave stale content on screen. The fix bypasses the
// client router entirely via a full document navigation
// (`window.location.assign`) — this test asserts that mechanism directly and
// that no router method is ever invoked.
//
// Scope: this file covers ONLY the onPreset period-commit path, not the rest
// of the console's surface (layer toggles, scrubber, aggregation axis). The
// map and the other panels are mocked out — they pull in maplibre-gl and are
// irrelevant to this fix.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.fn();
const routerReplace = vi.fn();
const routerRefresh = vi.fn();

// Unlike the other router-drop tests in this suite, PanoramaConsole has an
// effect keyed on the raw `searchParams` OBJECT reference (not its string
// value) — it relies on Next.js's real guarantee that `useSearchParams()`
// returns a stable reference across re-renders until the URL actually
// changes. A naive `() => new URLSearchParams(...)` mock (fresh instance
// every call) breaks that invariant: every re-render looks like a param
// change, the effect fires, sets state, triggers another re-render, and so
// on — an infinite loop that OOMs the test worker. Memoize by the search
// string so identity only changes when the params actually do.
let cachedSearchKey: string | null = null;
let cachedSearchParams: URLSearchParams | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, refresh: routerRefresh }),
  useSearchParams: () => {
    const key = window.location.search;
    if (cachedSearchParams === null || cachedSearchKey !== key) {
      cachedSearchKey = key;
      cachedSearchParams = new URLSearchParams(key);
    }
    return cachedSearchParams;
  },
}));

// The map + surrounding panels are irrelevant to the onPreset navigation fix
// and pull in maplibre-gl (heavy, browser-only) — stub them out. PresetPanel
// is left real: it's the actual UI surface `onPreset` is wired to.
vi.mock("@/components/panorama/SituationalMapDynamic", () => ({
  SituationalMapDynamic: () => null,
}));
vi.mock("@/components/panorama/DetailDrawer", () => ({
  DetailDrawer: () => null,
}));
vi.mock("@/components/panorama/LayerPanel", () => ({
  LayerPanel: () => null,
}));
vi.mock("@/components/panorama/PanoramaKpiStrip", () => ({
  PanoramaKpiStrip: () => null,
}));
vi.mock("@/components/panorama/AggregationToggle", () => ({
  AggregationToggle: () => null,
}));
vi.mock("@/components/panorama/TimeScrubber", () => ({
  TimeScrubber: () => null,
}));

import { PanoramaConsole } from "./PanoramaConsole";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };
const INITIAL_KPIS = { kpis: [], recalculatedFor: "Nacional · este mes" };

const mockAssign = vi.fn();
const originalLocation = window.location;

function setUrl(url: string) {
  window.history.replaceState(null, "", url);
  const current = new URL(url, "http://localhost");
  // jsdom's real window.location.assign performs a navigation it doesn't
  // support ("Not implemented: navigation"), and its `assign` method isn't
  // directly spy-able (non-configurable on the Location object). Replace the
  // whole object with a plain stub that mirrors the fields the component and
  // useSearchParams mock read, plus a jest.fn() for `assign`.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, ...current, assign: mockAssign },
  });
}

function renderConsole() {
  return render(
    <PanoramaConsole
      defaultLayerId="perdidas"
      defaultFeatures={EMPTY_FC}
      initialKpis={INITIAL_KPIS}
    />,
  );
}

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();
  routerRefresh.mockClear();
  mockAssign.mockClear();
  setUrl("/gob/panorama");
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe("PanoramaConsole onPreset — full navigation on preset period commit (router-drop fix)", () => {
  it("commits the preset's period via window.location.assign, preserving other params", () => {
    setUrl("/gob/panorama?province=AR-B");
    renderConsole();

    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));

    expect(mockAssign).toHaveBeenCalledTimes(1);
    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost/gob/panorama");
    expect(url.searchParams.get("province")).toBe("AR-B");
    // "brotes-activos" is a 90d preset.
    expect(url.searchParams.get("period")).toBe("90d");
  });

  it("never calls router.push/replace/refresh — only the full-navigation path", () => {
    renderConsole();

    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));

    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
