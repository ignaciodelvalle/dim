// @vitest-environment jsdom
//
// PanoramaConsole — map-QOL fluid board commits (feat/map-qol).
//
// The preset period commit used to be an INTERIM full document navigation
// (`window.location.assign`, commit 0e94f198) to dodge the Next 15.5.x
// router-drop defect. The map-QOL mechanism SUPERSEDES that cure: the board
// (period/layers/level/preset) is committed via the shallow History API
// (lib/ui/map-layer-nav.ts pushMapStateUrl) and the data is refetched with a
// plain client fetch — no router transition exists to be dropped, and no
// reload happens. These tests pin that contract:
//   1. preset click → history.pushState with the full board URL, NO
//      router.push/replace/refresh, NO location.assign;
//   2. the preset's layers are fetched client-side against the NEW params;
//   3. the committed board is persisted to localStorage for the bare-URL
//      restore.
//
// Scope: the onPreset commit path + board persistence. The map and the other
// panels are mocked out — they pull in maplibre-gl and are irrelevant here.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.fn();
const routerReplace = vi.fn();
const routerRefresh = vi.fn();

// PanoramaConsole keys effects on the searchParams OBJECT identity — mirror
// Next's real guarantee (stable reference until the URL actually changes) by
// memoizing on the search string. A fresh instance per call would loop.
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

// The map + surrounding panels are irrelevant to the fluid-commit contract and
// pull in maplibre-gl (heavy, browser-only) — stub them out. PresetPanel is
// left real: it's the actual UI surface `onPreset` is wired to.
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
const INITIAL_KPIS = { kpis: [], recalculatedFor: "Nacional · este mes", dataAsOf: null };
const OK_ENVELOPE = { features: EMPTY_FC, truncated: false, suppressedCount: 0 };

const fetchMock = vi.fn(
  async (_input: RequestInfo | URL, _init?: RequestInit) =>
    ({
      ok: true,
      json: async () => OK_ENVELOPE,
    }) as unknown as Response,
);

function setUrl(url: string) {
  window.history.replaceState(null, "", url);
  cachedSearchKey = null;
  cachedSearchParams = null;
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
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
  setUrl("/gob/panorama");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PanoramaConsole onPreset — fluid shallow commit (supersedes the 0e94f198 interim cure)", () => {
  it("commits the preset board via history.pushState, preserving other params, without any reload", () => {
    setUrl("/gob/panorama?province=AR-B");
    renderConsole();
    const pushSpy = vi.spyOn(window.history, "pushState");

    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));

    expect(pushSpy).toHaveBeenCalledTimes(1);
    // The URL updated in place — same document, no navigation.
    const params = new URLSearchParams(window.location.search);
    expect(params.get("province")).toBe("AR-B");
    // "brotes-activos" is a 90d preset with base cobertura + signal zoonosis.
    expect(params.get("period")).toBe("90d");
    expect(params.get("preset")).toBe("brotes-activos");
    expect(params.get("layers")).toBe("zoonosis,cobertura");
    expect(window.location.pathname).toBe("/gob/panorama");
  });

  it("never calls router.push/replace/refresh — the commit bypasses the router entirely", () => {
    renderConsole();

    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));

    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("fetches the preset's layers client-side against the NEW period", async () => {
    renderConsole();

    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));

    await waitFor(() => {
      const layerCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.startsWith("/api/panorama/") && !u.includes("/kpis"));
      expect(layerCalls.some((u) => u.includes("/api/panorama/cobertura"))).toBe(true);
      expect(layerCalls.some((u) => u.includes("/api/panorama/zoonosis"))).toBe(true);
      // Every layer fetch carries the preset's period — no stale closure.
      for (const u of layerCalls) expect(u).toContain("period=90d");
    });
  });

  it("persists the committed board to localStorage for the bare-URL restore", () => {
    renderConsole();

    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));

    const raw = window.localStorage.getItem("panorama:board:v1");
    expect(raw).not.toBeNull();
    const board = JSON.parse(raw as string) as Record<string, unknown>;
    expect(board.layers).toBe("zoonosis,cobertura");
    expect(board.preset).toBe("brotes-activos");
    expect(board.period).toBe("90d");
  });
});

describe("PanoramaConsole — bare-URL board restore (subtle, not sticky)", () => {
  it("restores a saved board on a bare URL via shallow replaceState + client fetch", async () => {
    window.localStorage.setItem(
      "panorama:board:v1",
      JSON.stringify({
        layers: "cobertura,zoonosis",
        level: "province",
        preset: "brotes-activos",
        period: "90d",
      }),
    );
    renderConsole();

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("layers")).toBe("zoonosis,cobertura");
      expect(params.get("period")).toBe("90d");
    });
    // Restored WITHOUT touching the router (no navigation, no reload).
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    await waitFor(() => {
      const layerCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.startsWith("/api/panorama/") && !u.includes("/kpis"));
      expect(layerCalls.some((u) => u.includes("/api/panorama/cobertura"))).toBe(true);
    });
  });

  it("does NOT restore when the URL already carries explicit board/period params", () => {
    window.localStorage.setItem(
      "panorama:board:v1",
      JSON.stringify({
        layers: "cobertura",
        level: "province",
        preset: null,
        period: "90d",
      }),
    );
    setUrl("/gob/panorama?period=30d");
    renderConsole();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("period")).toBe("30d");
    expect(params.get("layers")).toBeNull();
  });
});
