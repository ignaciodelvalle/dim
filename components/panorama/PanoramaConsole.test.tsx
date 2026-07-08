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

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
// left real: it's the actual UI surface `onPreset` is wired to. The map and
// KPI-strip stubs render POSITION MARKERS (and capture props) so the
// panorama-redesign composition tests can assert DOM order + the frame prop.
let mapProps: Record<string, unknown> | null = null;
let layerPanelProps: { states?: Record<string, Record<string, unknown>> } | null = null;

vi.mock("@/components/panorama/SituationalMapDynamic", () => ({
  SituationalMapDynamic: (props: Record<string, unknown>) => {
    mapProps = props;
    return <div data-testid="map-region" />;
  },
}));
vi.mock("@/components/panorama/DetailDrawer", () => ({
  DetailDrawer: () => null,
}));
vi.mock("@/components/panorama/LayerPanel", () => ({
  LayerPanel: (props: { states?: Record<string, Record<string, unknown>> }) => {
    layerPanelProps = props;
    return null;
  },
}));
vi.mock("@/components/panorama/PanoramaKpiStrip", () => ({
  PanoramaKpiStrip: () => <div data-testid="kpi-strip" />,
}));
// TimeScrubber is deliberately REAL (design-QA 2026-07-04 P0): the control
// budget below must hold with the actual scrubber rendered, not mocked away —
// mocking it made the ≤8 assertion dishonest vs production first paint.

import { PanoramaConsole } from "./PanoramaConsole";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };
const INITIAL_KPIS = { kpis: [], recalculatedFor: "Nacional · este mes", dataAsOf: null };
const OK_ENVELOPE = { features: EMPTY_FC, truncated: false, suppressedCount: 0 };

// Deferred-promise mode (panorama-redesign abort tests): when `deferMode` is
// on, each fetch stays pending until its entry in `deferred` is resolved —
// and rejects with an AbortError when its AbortSignal fires, mirroring the
// real fetch contract. Default mode resolves instantly (legacy tests).
type DeferredFetch = {
  url: string;
  signal: AbortSignal | null;
  resolve: (body: unknown) => void;
};
let deferMode = false;
let deferred: DeferredFetch[] = [];

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  const signal = init?.signal ?? null;
  if (!deferMode) {
    // The KPI endpoint returns a PanoramaKpis payload, not a layer envelope —
    // setKpis with the wrong shape would crash the PanoramaReading render.
    const body = url.includes("/api/panorama/kpis") ? INITIAL_KPIS : OK_ENVELOPE;
    return Promise.resolve({ ok: true, json: async () => body } as unknown as Response);
  }
  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
    deferred.push({
      url,
      signal,
      resolve: (body) => resolve({ ok: true, json: async () => body } as unknown as Response),
    });
  });
});

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
  deferMode = false;
  deferred = [];
  mapProps = null;
  layerPanelProps = null;
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

// ---------------------------------------------------------------------------
// panorama-redesign Fase 1 — reflow composition, control budget, frame, abort
// ---------------------------------------------------------------------------

/** True when `a` precedes `b` in DOM order. */
function isBefore(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function renderRedesignConsole(extraProps: Record<string, unknown> = {}) {
  return render(
    <PanoramaConsole
      defaultLayerId="perdidas"
      defaultFeatures={EMPTY_FC}
      initialKpis={INITIAL_KPIS}
      filtersSlot={
        <select aria-label="Provincia">
          <option>Todas</option>
        </select>
      }
      {...extraProps}
    />,
  );
}

describe("PanoramaConsole — reflow composition (panorama-redesign Fase 1)", () => {
  it("renders Reading → PresetPanel → SuppressionNotice before the map, KPI strip after", () => {
    // Explicit period → the first-visit default preset does NOT rewrite the
    // board, so the server-seeded perdidas layer (suppressedCount 3) stays on
    // and the suppression notice is visible for the DOM-order assertion.
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole({ defaultSuppressedCount: 3 });

    const reading = screen.getByText("Sin variación destacable frente al período anterior.");
    const presets = screen.getByText("Vista");
    const notice = screen.getByText(/celdas con menos de 5 casos/);
    const map = screen.getByTestId("map-region");
    const strip = screen.getByTestId("kpi-strip");

    expect(isBefore(reading, presets)).toBe(true);
    expect(isBefore(presets, notice)).toBe(true);
    expect(isBefore(notice, map)).toBe(true);
    expect(isBefore(map, strip)).toBe(true);
  });

  it("hosts the filters slot inside the 'Alcance y período' disclosure, next to 'Personalizar'", () => {
    const { container } = renderRedesignConsole();

    const scopeSummary = screen.getByText("Alcance y período");
    expect(scopeSummary.closest("details")).not.toBeNull();
    expect(screen.getByText("Personalizar")).toBeInTheDocument();

    // The slot content is REACHABLE (identical behavior, one click away)…
    const filterSelect = screen.getByLabelText("Provincia");
    // …but sits behind the closed disclosure at first paint.
    const details = filterSelect.closest("details");
    expect(details).not.toBeNull();
    expect(details!.hasAttribute("open")).toBe(false);
    expect(container.contains(filterSelect)).toBe(true);
  });

  it("stays within the first-paint BOARD control budget (≤8) with the REAL TimeScrubber rendered", () => {
    // Honest budget (design-QA 2026-07-04 P0). Scope of the ≤8 assertion:
    //   COUNTED — the board: preset buttons + disclosure summaries + any
    //   control not hidden behind a default-closed <details>. TimeScrubber is
    //   the REAL component here (no mock): its play/range/"Ahora" controls
    //   must sit behind the default-closed "Reproducir en el tiempo"
    //   disclosure, contributing exactly ONE summary to the budget.
    //   NOT COUNTED — map-canvas controls (MapLibre zoom + "Mi alcance" live
    //   on the map surface itself; SituationalMap is mocked) and the KPI
    //   strip's refresh (below the map hero, mocked). Production first paint
    //   therefore shows 8 board controls + the map's own canvas controls.
    const { container } = renderRedesignConsole({ defaultSuppressedCount: 3 });

    const all = Array.from(container.querySelectorAll("button, input, select, summary"));
    const firstPaint = all.filter((el) => {
      const hiddenBy = el.closest("details:not([open])");
      if (hiddenBy === null) return true;
      // The <summary> of a closed details is itself visible.
      return el.tagName === "SUMMARY" && el.parentElement === hiddenBy;
    });

    expect(firstPaint.length).toBeLessThanOrEqual(8);
    // Sanity: the 5 preset buttons ARE part of the visible set.
    expect(firstPaint.filter((el) => el.tagName === "BUTTON").length).toBeGreaterThanOrEqual(5);
    // The real scrubber IS mounted but its controls are NOT first-paint: the
    // range slider hides behind the closed disclosure, whose summary shows.
    expect(container.querySelector("input[type='range']")).not.toBeNull();
    expect(firstPaint.some((el) => el.getAttribute("type") === "range")).toBe(false);
    expect(screen.getByText("Reproducir en el tiempo").tagName).toBe("SUMMARY");
  });
});

describe("PanoramaConsole — preset frame (camera-only)", () => {
  // Explicit period in the URL → the first-visit default preset stays out of
  // the way, so token counting starts at the test's own clicks.
  it("passes { framing, token } to the map when the preset carries framing", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));

    expect(mapProps?.frame).toEqual({ framing: { kind: "national" }, token: 1 });
  });

  it("re-clicking the SAME preset bumps the token so the map re-frames", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));

    expect(mapProps?.frame).toEqual({ framing: { kind: "national" }, token: 2 });
  });

  it("clears the frame when a framing-less preset is selected (map behavior unchanged)", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    // bienestar is a locality-level drill-down preset — deliberately framing-less
    // (design-QA 2026-07-04: only national-overview presets frame the country).
    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bienestar/ }));

    expect(mapProps?.frame).toBeNull();
  });
});

describe("PanoramaConsole — first-visit default preset (design-QA 2026-07-04 highest-leverage nit)", () => {
  it("default-activates 'cumplimiento' on a truly-bare first visit, aligned with framing + fetch", async () => {
    // spyOn returns the SAME spy when history.pushState was already spied in a
    // previous test — clear its accumulated calls before this render.
    const pushSpy = vi.spyOn(window.history, "pushState");
    pushSpy.mockClear();
    renderRedesignConsole();

    // Board committed silently — replaceState, never a history entry.
    expect(pushSpy).not.toHaveBeenCalled();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("preset")).toBe("cumplimiento");
    expect(params.get("period")).toBe("90d");
    expect(params.get("layers")).toBe("cobertura");
    // Preset row and map state are CONNECTED on first paint: the button reads
    // active and the map receives the preset's national frame.
    expect(screen.getByRole("button", { name: /cumplimiento/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(mapProps?.frame).toEqual({ framing: { kind: "national" }, token: 1 });
    // The preset's layer resolves client-side against the committed period.
    await waitFor(() => {
      const layerCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.startsWith("/api/panorama/") && !u.includes("/kpis"));
      expect(
        layerCalls.some((u) => u.includes("/api/panorama/cobertura") && u.includes("period=90d")),
      ).toBe(true);
    });
  });

  it("does NOT default-activate when the URL carries an explicit period (deliberate navigation)", () => {
    setUrl("/gob/panorama?period=30d");
    renderRedesignConsole();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("preset")).toBeNull();
    expect(params.get("layers")).toBeNull();
  });

  it("does NOT default-activate when a saved board exists (the restore wins)", async () => {
    window.localStorage.setItem(
      "panorama:board:v1",
      JSON.stringify({ layers: "denuncias", level: "locality", preset: null, period: "30d" }),
    );
    renderRedesignConsole();

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("layers")).toBe("denuncias");
    });
    expect(new URLSearchParams(window.location.search).get("preset")).toBeNull();
  });
});

describe("PanoramaConsole — debounce + keyed abort (panorama-redesign Fase 1)", () => {
  const coberturaCalls = () =>
    fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/panorama/cobertura"));

  it("coalesces rapid preset clicks into ONE fetch burst for the last selection", async () => {
    renderRedesignConsole();

    // Two clicks inside the 200ms debounce window: only the LAST preset fetches.
    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));
    fireEvent.click(screen.getByRole("button", { name: /cumplimiento/ }));

    await waitFor(() => expect(coberturaCalls()).toHaveLength(1));
    // brotes-activos' zoonosis layer was superseded before its burst fired.
    const zoonosisCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/panorama/zoonosis"),
    );
    expect(zoonosisCalls).toHaveLength(0);
  });

  it("aborts a superseded in-flight fetch; the abort NEVER deactivates the layer; last click wins", async () => {
    deferMode = true;
    renderRedesignConsole();

    // Burst A (brotes-activos): cobertura + zoonosis go in flight after ~200ms.
    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));
    await waitFor(() => expect(coberturaCalls()).toHaveLength(1));

    // Burst B (cumplimiento) supersedes A's cobertura fetch.
    fireEvent.click(screen.getByRole("button", { name: /cumplimiento/ }));
    await waitFor(() => expect(coberturaCalls()).toHaveLength(2));

    const [first, second] = coberturaCalls();
    expect((first[1]?.signal as AbortSignal).aborted).toBe(true);
    expect((second[1]?.signal as AbortSignal).aborted).toBe(false);

    // Let A's AbortError rejection settle: the catch must EARLY-RETURN — the
    // layer stays active+loading (B in flight), never flipped to inactive.
    await act(async () => {});
    const midFlight = layerPanelProps?.states?.cobertura as {
      active: boolean;
      loading: boolean;
    };
    expect(midFlight.active).toBe(true);
    expect(midFlight.loading).toBe(true);

    // Resolve the WINNING (last) fetch — its payload lands.
    const point = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [-60, -35] as [number, number] },
      properties: {},
    };
    const winning = deferred.filter((d) => d.url.includes("/api/panorama/cobertura")).at(-1);
    expect(winning).toBeDefined();
    act(() => {
      winning!.resolve({
        features: { type: "FeatureCollection", features: [point, point] },
        truncated: false,
        suppressedCount: 0,
        noLocalityCount: 0,
      });
    });

    await waitFor(() => {
      const s = layerPanelProps?.states?.cobertura as {
        active: boolean;
        loading: boolean;
        count: number;
      };
      expect(s.loading).toBe(false);
      expect(s.active).toBe(true);
      expect(s.count).toBe(2);
    });
  });
});

describe("PanoramaConsole — implicit single-province division scope (PO validation 2026-07-07)", () => {
  it("threads the implicit division province to the map when no ?province is selected (scoped govt operator)", () => {
    // A CABA operator lands on /gob/panorama already scoped to CABA but never
    // picks a province in the switcher, so ?province is absent. The console must
    // still hand the map the effective province so its 48 barrios render.
    setUrl("/gob/panorama?period=3y");
    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
        initialLevel="locality"
        initialDivisionProvince="AR-C"
      />,
    );

    expect(mapProps?.selectedProvinceCode).toBe("AR-C");
  });

  it("also activates the implicit province on a truly-bare first visit (no explicit board)", () => {
    // The real scenario: the operator opens the panorama fresh. The first-visit
    // default preset still fires, but it never sets ?province, so the effective
    // province must persist through it.
    setUrl("/gob/panorama");
    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
        initialLevel="locality"
        initialDivisionProvince="AR-C"
      />,
    );

    expect(mapProps?.selectedProvinceCode).toBe("AR-C");
  });

  it("keeps the national basemap (null province) when there is no implicit scope (admin/multi-province)", () => {
    setUrl("/gob/panorama?period=3y");
    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
      />,
    );

    expect(mapProps?.selectedProvinceCode).toBeNull();
  });

  it("lets an explicit ?province selection win over the implicit scope (explicit path intact — admin drill-down too)", () => {
    // Admin (or a multi-province operator) explicitly picking a province, or a
    // scoped operator overriding their home province, must render THAT province.
    setUrl("/gob/panorama?period=3y&province=AR-B");
    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
        initialLevel="locality"
        initialDivisionProvince="AR-C"
      />,
    );

    expect(mapProps?.selectedProvinceCode).toBe("AR-B");
  });
});

describe("PanoramaConsole — derived aggregation level (panorama-ia-v2 §1.1, replaces AggregationToggle)", () => {
  it("drills to LOCALITY when the camera zooms past Z_LOCALITY at national scope", async () => {
    renderConsole();
    // Activate a province-baseline preset with a choropleth base (cobertura).
    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));
    await waitFor(() => {
      expect(mapProps?.onZoom).toBeInstanceOf(Function);
    });
    fetchMock.mockClear();

    // Zoom past the locality threshold — the map reports the new camera zoom.
    act(() => {
      (mapProps!.onZoom as (z: number) => void)(6);
    });

    // The derived level flips to locality → cobertura is refetched WITHOUT the
    // province level flag (locality is the default, un-flagged fetch).
    await waitFor(() => {
      const coberturaCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes("/api/panorama/cobertura"));
      expect(coberturaCalls.length).toBeGreaterThan(0);
      expect(coberturaCalls.every((u) => !u.includes("level=province"))).toBe(true);
    });
  });

  it("keeps PROVINCE at national scope while the camera stays below Z_LOCALITY", async () => {
    renderConsole();
    fireEvent.click(screen.getByRole("button", { name: /Brotes activos/ }));
    await waitFor(() => {
      expect(mapProps?.onZoom).toBeInstanceOf(Function);
    });
    fetchMock.mockClear();

    // A far-out zoom must NOT trigger a locality refetch (level stays province).
    act(() => {
      (mapProps!.onZoom as (z: number) => void)(3.5);
    });

    // No new cobertura fetch is issued — the level did not change.
    const coberturaCalls = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes("/api/panorama/cobertura"));
    expect(coberturaCalls.length).toBe(0);
  });
});
