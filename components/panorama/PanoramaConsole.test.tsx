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

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
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
let layerPanelProps: {
  states?: Record<string, Record<string, unknown>>;
  onToggle?: (id: string) => void;
} | null = null;

vi.mock("@/components/panorama/SituationalMapDynamic", () => ({
  SituationalMapDynamic: (props: Record<string, unknown>) => {
    mapProps = props;
    // v2C: the console's scope pill + period segmented arrive via the
    // `topRightSlot` prop (the real map renders them in its floating top-right
    // cluster) — render the slot so the scope/period assertions see it. The
    // legacy `bottomDock` slot is kept for any straggler usage.
    return (
      <div data-testid="map-region">
        {props.topRightSlot as ReactNode}
        {props.bottomDock as ReactNode}
      </div>
    );
  },
}));
vi.mock("@/components/panorama/DetailDrawer", () => ({
  DetailDrawer: () => null,
}));
vi.mock("@/components/panorama/LayerPanel", () => ({
  LayerPanel: (props: {
    states?: Record<string, Record<string, unknown>>;
    onToggle?: (id: string) => void;
  }) => {
    layerPanelProps = props;
    return null;
  },
}));
// panorama-vista-redesign Phase 3: PanoramaKpiStrip was retired from its
// mount (extracted into PanoramaKpiFooter + PanoramaMetricsColumn). Stub the
// footer as the DOM-order position marker; the metrics column is left REAL
// (it renders the actual per-vista KPI tiles the redesign is about).
vi.mock("@/components/panorama/PanoramaKpiFooter", () => ({
  PanoramaKpiFooter: () => <div data-testid="kpi-strip" />,
}));
// TimeScrubber is deliberately REAL (design-QA 2026-07-04 P0): the control
// budget below must hold with the actual scrubber rendered, not mocked away —
// mocking it made the ≤8 assertion dishonest vs production first paint.

import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import { PanoramaConsole } from "./PanoramaConsole";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };
const INITIAL_KPIS = { kpis: [], recalculatedFor: "Nacional · este mes", dataAsOf: null };
// A REAL (non-empty) loaded strip with a flat/no-delta tile — buildPanoramaReading
// falls back to "Sin variación destacable…" (the legit all-clear for a LOADED but
// flat strip), and the strip is NOT degraded (tiles present). Distinct from the
// EMPTY strip, which now reads as a failure state (empty ≠ all-clear, fix #1).
const REAL_KPIS: PanoramaKpis = {
  kpis: [
    {
      id: "mordeduras",
      label: "Mordeduras / 10k hab.",
      value: "1,2",
      tone: "warn",
      info: { definition: "d" },
      href: "/gob/vigilancia",
      source: "s",
    },
  ],
  recalculatedFor: "Nacional · este mes",
  dataAsOf: null,
};
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

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

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

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("fetches the preset's layers client-side against the NEW period", async () => {
    renderConsole();

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    await waitFor(() => {
      const layerCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        // Feature fetches only — the scrubber histogram (?histogram=1) is a
        // separate scope-total call with its own period lifecycle.
        .filter(
          (u) =>
            u.startsWith("/api/panorama/") && !u.includes("/kpis") && !u.includes("histogram=1"),
        );
      expect(layerCalls.some((u) => u.includes("/api/panorama/cobertura"))).toBe(true);
      expect(layerCalls.some((u) => u.includes("/api/panorama/zoonosis"))).toBe(true);
      // Every layer fetch carries the preset's period — no stale closure.
      for (const u of layerCalls) expect(u).toContain("period=90d");
    });
  });

  it("persists the committed board to localStorage for the bare-URL restore", () => {
    renderConsole();

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

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

  it("reading a pre-redesign v1 entry (no capasDetail/scrubDetail) restores cleanly, defaulting to Simple", async () => {
    // A `panorama:board:v1` entry saved BEFORE panorama-vista-redesign — the
    // exact pre-redesign shape (design Decision 5: no version bump, tolerant
    // OPTIONAL fields).
    window.localStorage.setItem(
      "panorama:board:v1",
      JSON.stringify({
        layers: "cobertura,zoonosis",
        level: "province",
        preset: "brotes-activos",
        period: "90d",
      }),
    );

    // No JSON.parse failure, no crash — the console mounts normally.
    expect(() => renderConsole()).not.toThrow();

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("layers")).toBe("zoonosis,cobertura");
    });
    // P3.6: the Simple/Detalle toggle was removed from Capas — the panel always
    // renders full detail now, so opening it mounts NO Simple/Detalle button.
    // (A legacy board with/without capasDetail restores without crashing.)
    openFiltro();
    expect(
      screen.queryByRole("button", { name: "Modo simple de Capas del mapa" }),
    ).not.toBeInTheDocument();
  });
});

describe("PanoramaConsole — browser Back re-derives the board from the popped URL (MAP-2)", () => {
  it("reverts the active preset when popstate reverts ?preset (tab/legend/KPIs follow the URL)", () => {
    renderConsole();

    // Commit preset A, then preset B — two history entries.
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    const urlAfterA = `${window.location.pathname}${window.location.search}`;
    expect(new URLSearchParams(window.location.search).get("preset")).toBe("brotes-activos");

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Bienestar/ }));
    expect(new URLSearchParams(window.location.search).get("preset")).toBe("bienestar");
    openVista();
    expect(screen.getByRole("radio", { name: /Bienestar/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Simulate browser Back: the URL reverts to A and popstate fires. In this Next
    // version useSearchParams does NOT observe popstate — the console must re-derive
    // the board from the popped URL itself.
    act(() => {
      window.history.replaceState(null, "", urlAfterA);
      cachedSearchKey = null;
      cachedSearchParams = null;
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // The view re-derived: preset A is active again, B is not — the tab/legend/KPIs
    // (all preset-driven) follow the reverted URL instead of staying on B.
    expect(new URLSearchParams(window.location.search).get("preset")).toBe("brotes-activos");
    openVista();
    expect(screen.getByRole("radio", { name: /Brotes activos/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    openVista();
    expect(screen.getByRole("radio", { name: /Bienestar/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("preserves the popped URL's period + layers across Back — never rewrites them to the preset default (adversarial review MED #1)", async () => {
    renderConsole();

    // Preset A at its default window (90d)…
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    // …then the operator customizes the period to 12m — a shallow replace that
    // keeps preset=A in the URL (the period picker's commit shape).
    act(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("period", "12m");
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    });
    const urlAfterPeriod = `${window.location.pathname}${window.location.search}`;
    expect(new URLSearchParams(window.location.search).get("period")).toBe("12m");

    // Preset B — a new history entry back at B's default window.
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Bienestar/ }));
    expect(new URLSearchParams(window.location.search).get("preset")).toBe("bienestar");
    fetchMock.mockClear();

    // Browser Back → the popped URL still says preset=A & period=12m.
    act(() => {
      window.history.replaceState(null, "", urlAfterPeriod);
      cachedSearchKey = null;
      cachedSearchParams = null;
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // Preset A is active again…
    openVista();
    expect(screen.getByRole("radio", { name: /Brotes activos/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // …and the POPPED board fields survive verbatim: the resync must restore
    // period/layers FROM the popped URL — the old reuse of the click-path
    // applyPreset forced period back to A's default (90d) and rewrote the URL.
    const popped = new URLSearchParams(window.location.search);
    expect(popped.get("period")).toBe("12m");
    expect(popped.get("preset")).toBe("brotes-activos");
    expect(popped.get("layers")).toBe("zoonosis,cobertura");

    // The restored layer set refetches at the POPPED window (12m), never 90d.
    await waitFor(() => {
      const layerCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter(
          (u) =>
            u.startsWith("/api/panorama/") && !u.includes("/kpis") && !u.includes("histogram=1"),
        );
      expect(layerCalls.some((u) => u.includes("/api/panorama/cobertura"))).toBe(true);
      expect(layerCalls.some((u) => u.includes("/api/panorama/zoonosis"))).toBe(true);
      for (const u of layerCalls) expect(u).toContain("period=12m");
    });
    // The KPIs follow the popped window too (popstate is not observed by
    // useSearchParams, so the resync refetches them explicitly).
    await waitFor(() => {
      const kpiCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes("/api/panorama/kpis"));
      expect(kpiCalls.some((u) => u.includes("period=12m"))).toBe(true);
    });
  });
});

describe("PanoramaConsole — PERÍODO commits shallow, no reload (Root B, QA #3b)", () => {
  it("a preset período commits via history.pushState (never location.assign / the router) and refetches KPIs + layers at the new window", async () => {
    // Explicit period suppresses the first-visit default preset — then activate a
    // preset so there ARE active period-sensitive layers (cobertura) to refetch.
    setUrl("/gob/panorama?period=3y");
    renderConsole();
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    // Drain the preset's own 90d layer burst so the assertions below see only the
    // período change's fetches.
    await waitFor(() => {
      const calls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes("/api/panorama/cobertura") && u.includes("period=90d"));
      expect(calls.length).toBeGreaterThan(0);
    });

    const pushSpy = vi.spyOn(window.history, "pushState");
    pushSpy.mockClear();
    fetchMock.mockClear();

    openPeriodo();
    fireEvent.click(screen.getByRole("button", { name: "30 días" }));

    // Shallow: the URL flipped to 30d in place — a pushState, NO reload. (The old
    // path called window.location.assign; the History push + the router assertions
    // below prove the commit no longer navigates the document.)
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("period")).toBe("30d");
    expect(params.get("from")).toBeNull();
    expect(params.get("to")).toBeNull();
    expect(window.location.pathname).toBe("/gob/panorama");

    // KPIs refetch client-side at the NEW window (useSearchParams can't see the
    // shallow write, so commitPeriod fetches them explicitly).
    await waitFor(() => {
      const kpiCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes("/api/panorama/kpis"));
      expect(kpiCalls.some((u) => u.includes("period=30d"))).toBe(true);
    });
    // The active period-sensitive layer refetches at 30d too.
    await waitFor(() => {
      const layerCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter(
          (u) =>
            u.startsWith("/api/panorama/") && !u.includes("/kpis") && !u.includes("histogram=1"),
        );
      expect(
        layerCalls.some((u) => u.includes("/api/panorama/cobertura") && u.includes("period=30d")),
      ).toBe(true);
    });
  });

  it("a custom range commits ONCE (revealing 'Personalizado…' does not commit; the single commit fires when both dates are set)", () => {
    setUrl("/gob/panorama?period=3y");
    renderConsole();

    openPeriodo();
    const pushSpy = vi.spyOn(window.history, "pushState");
    pushSpy.mockClear();

    // Revealing the picker must NOT commit (this is the fix for the double-reload).
    fireEvent.click(screen.getByRole("button", { name: /Personalizado/ }));
    expect(new URLSearchParams(window.location.search).get("period")).toBe("3y");
    expect(pushSpy).not.toHaveBeenCalled();

    // Setting only "Desde" still doesn't commit (range incomplete).
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } });
    expect(new URLSearchParams(window.location.search).get("period")).toBe("3y");
    expect(pushSpy).not.toHaveBeenCalled();

    // Completing the range with "Hasta" commits — exactly ONCE.
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-03-01" } });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(window.location.search);
    expect(params.get("period")).toBe("custom");
    expect(params.get("from")).toBe("2026-01-01");
    expect(params.get("to")).toBe("2026-03-01");
  });

  it("browser Back restores the prior período (popstate resync keeps the highlight coherent)", () => {
    setUrl("/gob/panorama?period=3y");
    renderConsole();

    openPeriodo();
    fireEvent.click(screen.getByRole("button", { name: "30 días" }));
    const urlAfter30 = `${window.location.pathname}${window.location.search}`;
    expect(new URLSearchParams(window.location.search).get("period")).toBe("30d");

    openPeriodo();
    fireEvent.click(screen.getByRole("button", { name: "90 días" }));
    expect(new URLSearchParams(window.location.search).get("period")).toBe("90d");

    // Back → the popped URL says 30d. useSearchParams does not observe popstate,
    // so the console re-derives the board (and the committed window) itself.
    act(() => {
      window.history.replaceState(null, "", urlAfter30);
      cachedSearchKey = null;
      cachedSearchParams = null;
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(new URLSearchParams(window.location.search).get("period")).toBe("30d");
    // The PeriodPanel highlight follows the restored window (committedPeriod).
    openPeriodo();
    expect(screen.getByRole("button", { name: "30 días" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "90 días" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("PanoramaConsole — v2C floating dock (collapsed default, tabs, panes)", () => {
  it("ships collapsed by default: the bar + tabs are visible, no pane content mounts", () => {
    const { container } = renderConsole();

    const dock = screen.getByTestId("panorama-dock");
    expect(dock).toBeVisible();
    // The three tabs are reachable from the collapsed bar.
    expect(screen.getByRole("tab", { name: /Registros/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Estadísticas/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Línea de tiempo/ })).toBeVisible();
    // Collapsed: the tabpanel exists (APG completeness) but is `hidden` and
    // mounts no pane content — no scrubber, no table.
    const panel = container.querySelector("#pano-dock-panel");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("hidden");
    expect(container.querySelector("input[type='range']")).toBeNull();
    expect(screen.getByRole("button", { name: "▴ Expandir" })).toBeVisible();
  });

  it("clicking a tab while collapsed expands the dock onto that pane; Colapsar closes it", () => {
    const { container } = renderConsole();

    fireEvent.click(screen.getByRole("tab", { name: /Estadísticas/ }));
    const panel = container.querySelector("#pano-dock-panel");
    expect(panel).not.toBeNull();
    // Expanded: the panel is no longer hidden.
    expect(panel).not.toHaveAttribute("hidden");
    expect(screen.getByRole("tab", { name: /Estadísticas/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "▾ Colapsar" }));
    // Collapsed again: the panel stays in the DOM (APG completeness) but hidden.
    expect(container.querySelector("#pano-dock-panel")).toHaveAttribute("hidden");
  });

  // a11y round (task #43 + review round 2) — dock tab semantics.
  it("A11Y A1 (WCAG 4.1.2 / APG): dock tabs carry a VALID aria-controls in both states (panel always in DOM)", () => {
    renderConsole();

    // Collapsed default: the #pano-dock-panel tabpanel is ALWAYS rendered (hidden
    // when collapsed), so aria-controls is a valid IDREF in both states —
    // completing the tablist/tab/tabpanel APG contract (review round 2 refined
    // the earlier "drop aria-controls when collapsed" fix, which cleared the
    // dangling-IDREF axe hit but left the APG pattern incomplete).
    const collapsedPanel = document.getElementById("pano-dock-panel");
    expect(collapsedPanel).not.toBeNull();
    expect(collapsedPanel).toHaveAttribute("hidden");
    for (const name of [/Registros/, /Estadísticas/, /Línea de tiempo/]) {
      expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-controls", "pano-dock-panel");
    }

    // Expand → the same panel becomes visible (not re-created).
    fireEvent.click(screen.getByRole("tab", { name: /Estadísticas/ }));
    expect(screen.getByRole("tab", { name: /Estadísticas/ })).toHaveAttribute(
      "aria-controls",
      "pano-dock-panel",
    );
    expect(document.getElementById("pano-dock-panel")).not.toHaveAttribute("hidden");
  });

  it("A11Y M3 (ARIA APG): dock tablist uses roving tabindex + Arrow/Home/End, manual activation", () => {
    renderConsole();
    const registros = screen.getByRole("tab", { name: /Registros/ });
    const stats = screen.getByRole("tab", { name: /Estadísticas/ });
    const timeline = screen.getByRole("tab", { name: /Línea de tiempo/ });

    // Only the active tab is Tab-stoppable. C10 (P3.6): the dock now defaults to
    // "Estadísticas" (not "Registros 0", which read as a false "vacío"), so it is
    // the selected + Tab-stoppable tab.
    expect(stats).toHaveAttribute("tabindex", "0");
    expect(registros).toHaveAttribute("tabindex", "-1");
    expect(timeline).toHaveAttribute("tabindex", "-1");

    // ArrowRight moves FOCUS to the next tab, without switching the pane.
    stats.focus();
    fireEvent.keyDown(stats, { key: "ArrowRight" });
    expect(timeline).toHaveFocus();
    expect(timeline).toHaveAttribute("tabindex", "0");
    expect(stats).toHaveAttribute("tabindex", "-1");
    // Selection did NOT follow focus (manual activation): still collapsed,
    // Estadísticas still the selected tab.
    expect(stats).toHaveAttribute("aria-selected", "true");
    // Still collapsed: the panel is present but hidden (no pane switch on focus).
    expect(document.getElementById("pano-dock-panel")).toHaveAttribute("hidden");

    // End → last, Home → first.
    fireEvent.keyDown(timeline, { key: "End" });
    expect(timeline).toHaveFocus();
    fireEvent.keyDown(timeline, { key: "Home" });
    expect(registros).toHaveFocus();
  });

  it("A11Y (review round 2): a mouse click on a tab syncs the roving tabindex to the clicked tab", () => {
    renderConsole();
    const registros = screen.getByRole("tab", { name: /Registros/ });
    const stats = screen.getByRole("tab", { name: /Estadísticas/ });
    const timeline = screen.getByRole("tab", { name: /Línea de tiempo/ });

    // Arrow the roving focus onto the LAST tab (focusIndex now points at timeline).
    registros.focus();
    fireEvent.keyDown(registros, { key: "End" });
    expect(timeline).toHaveAttribute("tabindex", "0");

    // Then MOUSE-click a DIFFERENT tab. The roving position must follow the click
    // (prev bug: focusIndex stayed on timeline, so tabIndex={0} was stranded on
    // the wrong tab under mixed mouse+keyboard use).
    fireEvent.click(stats);
    expect(stats).toHaveAttribute("tabindex", "0");
    expect(timeline).toHaveAttribute("tabindex", "-1");
    expect(registros).toHaveAttribute("tabindex", "-1");
  });

  it("Registros pane hosts the accessible map table (empty-state copy when no aggregate rows)", () => {
    renderConsole();

    fireEvent.click(screen.getByRole("tab", { name: /Registros/ }));
    // EMPTY_FC seed → the MapDataTable's honest empty state (not a blank pane).
    expect(
      screen.getByText("Sin datos por unidad para las capas activas en este alcance."),
    ).toBeVisible();
  });

  it("Estadísticas pane renders the ranking section (honest empty copy without a rankable base)", () => {
    renderConsole();

    fireEvent.click(screen.getByRole("tab", { name: /Estadísticas/ }));
    // perdidas (density, EMPTY features) → RankedUnitsPanel's honest empty copy.
    expect(screen.getByText(/Peores/)).toBeVisible();
    expect(screen.getByText("Sin datos suficientes en este alcance.")).toBeVisible();
  });
});

describe("PanoramaConsole — deep-link level guard (MAP-5)", () => {
  it("falls a national level=locality deep-link back to province (no province in scope)", () => {
    // No ?province and no implicit jurisdiction province → a locality choropleth
    // has no drilled scope to fill and would read "sin datos en todo el país".
    setUrl("/gob/panorama?level=locality");
    renderConsole();
    // level fell back to province → the on-canvas badge reads "Provincias".
    expect(mapProps?.aggregationLabel).toBe("Provincias");
  });

  it("keeps level=locality when a province IS in scope", () => {
    setUrl("/gob/panorama?level=locality&province=AR-B");
    renderConsole();
    // A drilled province retains locality — the badge names the division, not
    // "Provincias".
    expect(mapProps?.aggregationLabel).toBe("Departamentos/partidos");
  });
});

// ---------------------------------------------------------------------------
// panorama-redesign Fase 1 — reflow composition, control budget, frame, abort
// ---------------------------------------------------------------------------

/** True when `a` precedes `b` in DOM order. */
function isBefore(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/**
 * Open the "Filtro" rail panel so its layer catalog (Simple/Detalle toggle,
 * LayerPanel) mounts. Task #38 v3 replaced the old top-left "Capas" popover
 * with the floating vertical rail — the layer catalog now lives behind the
 * "Filtro" icon button — so any test that interacts with the Simple/Detalle
 * controls or the LayerPanel must open it first. "Filtro" is unique: the
 * bivariate encoding toggle (Brotes vista) still uses the literal "Capas"
 * label, but that button carries no `aria-expanded`, so it never collides.
 */
function openFiltro(): void {
  fireEvent.click(screen.getByRole("button", { name: "Capas del mapa" }));
}

/**
 * Ensure the "Vista" rail panel is open so the preset radiogroup (PresetPanel)
 * mounts. Task #38 v3: the preset strip moved off the always-visible top-left
 * cluster into the "Vista" rail panel, AND selecting a preset auto-closes the
 * panel (`setRailOpen(null)` in the panel's `onPreset` wrapper) — so this must
 * be called again before every subsequent radio read/click in the same test.
 * Idempotent: only clicks the trigger when the panel isn't already open, so
 * calling it repeatedly never accidentally toggles it closed.
 */
function openVista(): void {
  const trigger = screen.getByRole("button", { name: "Vista" });
  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }
}

/**
 * Open the "Período" rail panel so PeriodPanel (the preset list + Personalizado)
 * mounts. Idempotent, like openVista — only clicks the trigger when closed.
 */
function openPeriodo(): void {
  const trigger = screen.getByRole("button", { name: "Período" });
  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }
}

/**
 * Open the v2C dock's "Línea de tiempo" tab so the TimeScrubber mounts. The
 * v2C fixed console moved the scrubber off the always-on bottomDock strip into
 * the floating dock (PO: timeline is opt-in — dock collapsed by default), so
 * any test that interacts with the scrubber must open that tab first.
 */
function openTimeline(): void {
  fireEvent.click(screen.getByRole("tab", { name: /Línea de tiempo/ }));
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

describe("PanoramaConsole — reflow composition (panorama-vista-redesign Phases 1 & 3)", () => {
  it("v2C composition: masthead-less console = map + overlay clusters; suppression notice + reading live in the legend panel", () => {
    // Explicit period → the first-visit default preset does NOT rewrite the
    // board, so the server-seeded perdidas layer (suppressedCount 3) stays on
    // and the suppression notice renders for the presence assertions.
    setUrl("/gob/panorama?period=3y");
    // A REAL loaded strip (flat tile) so the reading is the legit "Sin variación
    // destacable…" landmark — an EMPTY strip now reads as a failure state (fix #1).
    renderRedesignConsole({ defaultSuppressedCount: 3, initialKpis: REAL_KPIS });

    // Task #38 v3: the "Vista" rail button labels the preset control (right rail).
    const presets = screen.getByRole("button", { name: "Vista" });
    const map = screen.getByTestId("map-region");
    // v2C: the map leads the DOM (overlays are absolute siblings AFTER it).
    expect(isBefore(map, presets)).toBe(true);
    // The k-anon suppression notice + the one-line reading moved into the
    // legend pill's expanded panel — both stay in the accessibility tree
    // (native <details>) so the honesty surfaces are always reachable.
    expect(screen.getByText(/celdas con menos de 5 casos/)).toBeInTheDocument();
    expect(
      screen.getByText("Sin variación destacable frente al período anterior."),
    ).toBeInTheDocument();
    // The legend pill's k-anon marker is ALWAYS visible on the collapsed strip.
    expect(screen.getByText(/k<5 protegido/)).toBeInTheDocument();
    // The floating dock closes the stack.
    expect(screen.getByTestId("panorama-dock")).toBeInTheDocument();
  });

  it("degraded KPIs: KPI-driven conclusion surfaces show a failure state, never a reassuring one (trust/safety)", () => {
    // The KPI fan-out resolved to the honest degraded payload. The one-line
    // reading and the metrics column must REPLACE their reassuring copy with an
    // explicit "no pudimos calcular/cargar" state — the two must never coexist.
    setUrl("/gob/panorama?period=3y");
    const DEGRADED_KPIS: PanoramaKpis = {
      kpis: [],
      recalculatedFor:
        "No pudimos cargar los indicadores en este momento. Reintentá en unos segundos.",
      dataAsOf: null,
      degraded: true,
    };
    renderRedesignConsole({ initialKpis: DEGRADED_KPIS });

    // Honest failure states present…
    expect(screen.getByText("No pudimos calcular la lectura en este momento.")).toBeInTheDocument();
    expect(
      screen.getByText("No pudimos cargar los indicadores en este momento."),
    ).toBeInTheDocument();
    // …and NO reassuring conclusion anywhere on the degraded view.
    expect(
      screen.queryByText("Sin variación destacable frente al período anterior."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Métricas no disponibles para esta vista.")).not.toBeInTheDocument();
  });

  it("empty KPI strip WITHOUT the degraded flag still reads as a failure, never all-clear (empty ≠ all-clear)", () => {
    // PO instrumented-review finding #1 (2026-07-10): a strip that is EMPTY but
    // carries NO explicit `degraded` sentinel (an older/serialized payload, a
    // 503 body, a partial fixture) must STILL replace the reassuring conclusion
    // — never fall through to buildPanoramaReading([]) → "Sin variación
    // destacable…". Empty ≠ all-clear in a surveillance tool.
    setUrl("/gob/panorama?period=3y");
    const EMPTY_KPIS: PanoramaKpis = {
      kpis: [],
      recalculatedFor: "Recalculado para Nacional",
      dataAsOf: null,
    };
    renderRedesignConsole({ initialKpis: EMPTY_KPIS });

    // Honest failure states present (reading + metrics column)…
    expect(screen.getByText("No pudimos calcular la lectura en este momento.")).toBeInTheDocument();
    expect(
      screen.getByText("No pudimos cargar los indicadores en este momento."),
    ).toBeInTheDocument();
    // …and NO reassuring conclusion despite the missing flag.
    expect(
      screen.queryByText("Sin variación destacable frente al período anterior."),
    ).not.toBeInTheDocument();
  });

  it("hosts the filters slot inside the scope-pill disclosure, next to the Filtro rail button", () => {
    const { container } = renderRedesignConsole();

    // Task #38 v3: the old "Alcance y período" disclosure summary is now the
    // scope pill (same <details>/<summary> disclosure primitive, OverlayDisclosure).
    const scopeSummary = screen.getByTestId("panorama-scope-pill");
    expect(scopeSummary.closest("details")).not.toBeNull();
    // panorama-vista-redesign Phase 2 / task #38 v3: the layer catalog trigger
    // (formerly "Capas", now the rail's "Filtro" icon button) is present.
    expect(screen.getByRole("button", { name: "Capas del mapa" })).toBeInTheDocument();

    // The slot content is REACHABLE (identical behavior, one click away)…
    const filterSelect = screen.getByLabelText("Provincia");
    // …but sits behind the closed disclosure at first paint.
    const details = filterSelect.closest("details");
    expect(details).not.toBeNull();
    expect(details!.hasAttribute("open")).toBe(false);
    expect(container.contains(filterSelect)).toBe(true);
  });

  it("first paint: the rail + Filtro button + the collapsed dock (timeline opt-in) are visible; the scrubber mounts on the timeline tab", () => {
    // Task #38 v3: the preset strip moved off first-paint into the "Vista" rail
    // panel; the always-visible first-paint control budget is now the rail
    // (7 icon buttons) + KPI cards + dock bar, and the layer catalog stays
    // behind the "Filtro" rail button. The TimeScrubber moved into the floating
    // dock's "Línea de tiempo" tab (PO: timeline is opt-in, dock ships collapsed).
    const { container } = renderRedesignConsole({ defaultSuppressedCount: 3 });

    // At least 6 controls (rail icons, KPI cards, dock tabs/Expandir) are
    // first-paint, none of them behind a closed disclosure.
    expect(
      Array.from(container.querySelectorAll("button")).filter(
        (b) => b.closest("details:not([open])") === null,
      ).length,
    ).toBeGreaterThanOrEqual(6);
    // The "Filtro" trigger is visible at first paint (not behind a disclosure).
    const capasBtn = screen.getByRole("button", { name: "Capas del mapa", expanded: false });
    expect(capasBtn).toBeVisible();
    expect(capasBtn.closest("details:not([open])")).toBeNull();
    // P3.6: the Simple/Detalle toggle was removed from Capas (consistency with
    // the other rail panels) — the panel now always renders full detail, so no
    // Simple/Detalle button ever mounts, even after opening the panel.
    expect(
      screen.queryByRole("button", { name: "Modo simple de Capas del mapa" }),
    ).not.toBeInTheDocument();
    openFiltro();
    expect(
      screen.queryByRole("button", { name: "Modo simple de Capas del mapa" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Modo detalle de Capas del mapa" }),
    ).not.toBeInTheDocument();
    // P3.6: with detail always on, the open Capas panel shows per-layer opacity
    // sliders (range inputs) for active layers — close it so the scrubber range
    // check below is not confounded by them.
    fireEvent.keyDown(document, { key: "Escape" });
    // The dock bar is first-paint (collapsed): its three tabs are reachable but
    // no pane content mounts yet — the scrubber arrives on the timeline tab.
    expect(screen.getByTestId("panorama-dock")).toBeVisible();
    expect(screen.getByRole("tab", { name: /Registros/ })).toBeVisible();
    expect(container.querySelector("input[type='range']")).toBeNull();
    openTimeline();
    // The scrubber's range input mounts, not behind any details disclosure.
    expect(screen.queryByText("Reproducir en el tiempo")).not.toBeInTheDocument();
    const range = container.querySelector("input[type='range']");
    expect(range).not.toBeNull();
    expect(range!.closest("details:not([open])")).toBeNull();
  });

  it("PO screenshot fix (2026-07-08): Vista cards show only the label — clicking a tab activates the preset with no question/description line rendered anywhere", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    openVista();
    expect(screen.getByRole("radio", { name: /Brotes activos/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Both the parent's duplicated "VISTA" headline + question line AND the
    // per-card description were removed — the preset's question never renders.
    expect(
      screen.queryByText("¿Dónde hay brotes activos sobre huecos de vacunación?"),
    ).not.toBeInTheDocument();
  });
});

describe("PanoramaConsole — TimeScrubber temporal gating (panorama-vista-redesign Phase 4)", () => {
  it("non-temporal vista (cumplimiento: cobertura only) shows the scrubber's disabled state", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();
    openTimeline();

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /cumplimiento/i }));

    expect(
      screen.getByText(/La reproducción temporal necesita una capa de eventos activa/),
    ).toBeInTheDocument();
  });

  it("current-state base (brotes-activos: cobertura base): active scrubber carries the honest 'estado actual' disclaimer (trust/safety)", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();
    openTimeline();

    // brotes-activos: base cobertura (current-state) + signal zoonosis (temporal)
    // → the scrubber stays active (zoonosis reproduces) but must state plainly
    // that the cobertura fill does not move with the fecha de corte.
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    expect(
      screen.queryByText(/La reproducción temporal necesita una capa de eventos activa/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/El indicador base \(cobertura antirrábica\) es un estado actual/),
    ).toBeInTheDocument();
  });

  it("activating a temporal layer self-enables the scrubber without a reload", async () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();
    openTimeline();

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /cumplimiento/i }));
    expect(
      screen.getByText(/La reproducción temporal necesita una capa de eventos activa/),
    ).toBeInTheDocument();
    // Task #38 v3: the layer catalog is the Filtro rail panel — FiltroPanel
    // renders the checkbox rows directly (LayerPanel is no longer mounted). P3.6:
    // the Simple/Detalle toggle was removed; the panel always shows full detail,
    // so just open it and click the zoonosis row's checkbox for real.
    openFiltro();

    // zoonosis is temporal — activating it must flip temporalAvailable true.
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Zoonosis/ }));
    });

    await waitFor(() => {
      expect(
        screen.queryByText(/La reproducción temporal necesita una capa de eventos activa/),
      ).not.toBeInTheDocument();
    });
  });
});

describe("PanoramaConsole — preset frame (camera-only)", () => {
  // Explicit period in the URL → the first-visit default preset stays out of
  // the way, so token counting starts at the test's own clicks.
  it("passes { framing, token } to the map when the preset carries framing", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    expect(mapProps?.frame).toEqual({ framing: { kind: "national" }, token: 1 });
  });

  it("re-clicking the SAME preset bumps the token so the map re-frames", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    expect(mapProps?.frame).toEqual({ framing: { kind: "national" }, token: 2 });
  });

  it("clears the frame when a framing-less preset is selected (map behavior unchanged)", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    // bienestar is a locality-level drill-down preset — deliberately framing-less
    // (design-QA 2026-07-04: only national-overview presets frame the country).
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Bienestar/ }));

    expect(mapProps?.frame).toBeNull();
  });
});

describe("PanoramaConsole — first-visit default preset (design-QA 2026-07-04 highest-leverage nit)", () => {
  it("default-activates 'bienestar' on a truly-bare first visit, aligned with fetch (QA #81)", async () => {
    // spyOn returns the SAME spy when history.pushState was already spied in a
    // previous test — clear its accumulated calls before this render.
    const pushSpy = vi.spyOn(window.history, "pushState");
    pushSpy.mockClear();
    renderRedesignConsole();

    // Board committed silently — replaceState, never a history entry.
    expect(pushSpy).not.toHaveBeenCalled();
    const params = new URLSearchParams(window.location.search);
    // QA histórico 2026-07-08: the default landing preset is now the
    // proven-populated welfare view (base denuncias + decomisos reference) so the
    // first paint shows data instead of the empty cobertura choropleth.
    expect(params.get("preset")).toBe("bienestar");
    expect(params.get("period")).toBe("90d");
    expect(params.get("layers")).toBe("denuncias,decomisos");
    // Preset row and map state are CONNECTED on first paint: the button reads
    // active. bienestar is a locality drill-down preset — deliberately
    // framing-less, so the map receives no national frame on the default land.
    openVista();
    expect(screen.getByRole("radio", { name: /Bienestar/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(mapProps?.frame).toBeNull();
    // The preset's base layer resolves client-side against the committed period.
    await waitFor(() => {
      const layerCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.startsWith("/api/panorama/") && !u.includes("/kpis"));
      expect(
        layerCalls.some((u) => u.includes("/api/panorama/denuncias") && u.includes("period=90d")),
      ).toBe(true);
    });
  });

  it("honors a role-aware defaultPresetId — govt lands on 'sintomas' (local surveillance)", async () => {
    // Audit-ratified 2026-07-09: a jurisdiction (govt) operator opens on local
    // syndromic surveillance instead of the national welfare default. The server
    // page passes the role-resolved preset; the console default-activates IT on a
    // truly-bare first visit (same URL-contract guard as the fallback).
    const pushSpy = vi.spyOn(window.history, "pushState");
    pushSpy.mockClear();
    renderRedesignConsole({ defaultPresetId: "sintomas" });

    expect(pushSpy).not.toHaveBeenCalled();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("preset")).toBe("sintomas");
    expect(params.get("period")).toBe("30d");
    expect(params.get("layers")).toBe("zoonosis,sintomas");
    // sintomas is a locality-level drill-down preset — framing-less, so it stays
    // in the operator's jurisdiction (no national frame on the default land).
    expect(mapProps?.frame).toBeNull();
    await waitFor(() => {
      const layerCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.startsWith("/api/panorama/") && !u.includes("/kpis"));
      expect(
        layerCalls.some((u) => u.includes("/api/panorama/sintomas") && u.includes("period=30d")),
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

describe("PanoramaConsole — server-seeded first-visit fast path (perf plan 1.2)", () => {
  // A non-empty FeatureCollection per layer so a seeded layer read from the
  // WRONG cache (a level mismatch — C2) would surface as an EMPTY_FC on the map.
  const seedFc = (tag: string) => ({
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { tag },
        geometry: { type: "Point" as const, coordinates: [-58.4, -34.6] },
      },
    ],
  });
  const bienestarSeed = [
    {
      id: "denuncias",
      features: seedFc("denuncias"),
      truncated: false,
      suppressedCount: 0,
      noLocalityCount: 0,
    },
    {
      id: "decomisos",
      features: seedFc("decomisos"),
      truncated: false,
      suppressedCount: 0,
      noLocalityCount: 0,
    },
  ];

  it("paints the seeded preset layers on first render with NO live layer load and NO KPI refetch", async () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    pushSpy.mockClear();
    renderRedesignConsole({
      // PO-ratified 2026-07-09: a NATIONAL first visit seeds the role-default
      // preset (bienestar) at PROVINCE — the preset's own `level: "locality"` is
      // now only a preference; the scope (national here) decides. initialLevel
      // MUST equal that seed level (the C2 invariant), and the zoomed-out
      // hysteresis derivation lands on the same province, so there is no drift.
      seededPresetId: "bienestar",
      seededLayers: bienestarSeed,
      initialLevel: "province",
    });

    // The preset row + map connect on first paint (no fetch waited on).
    await waitFor(() => {
      openVista();
      expect(screen.getByRole("radio", { name: /Bienestar/ })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });

    // The board committed silently (replaceState, not a history push) with the
    // preset's period + layers + locality level.
    expect(pushSpy).not.toHaveBeenCalled();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("preset")).toBe("bienestar");
    expect(params.get("period")).toBe("90d");
    expect(params.get("layers")).toBe("denuncias,decomisos");
    // National framing → province is the derived level, so the board carries NO
    // explicit `level` flag (province is the un-flagged default).
    expect(params.get("level")).toBeNull();

    // The seeded features are on the map AT the seeded level — read from the
    // cache that matches initialLevel. A level mismatch would blank these
    // (EMPTY_FC), so a non-empty read IS the level-invariant guard.
    const layers = (mapProps?.layers ?? []) as Array<{
      id: string;
      features: { features: unknown[] };
    }>;
    const denuncias = layers.find((l) => l.id === "denuncias");
    const decomisos = layers.find((l) => l.id === "decomisos");
    expect(denuncias?.features.features.length).toBe(1);
    expect(decomisos?.features.features.length).toBe(1);
    // perdidas (the legacy default seed) is NOT on the board on this path.
    expect(layers.some((l) => l.id === "perdidas")).toBe(false);

    // The whole point: the preset commit issues NO LIVE layer load — every
    // seeded layer was served from the cache the initializer filled, so
    // fetchLayersInto has nothing to fetch (missingFromCache === []).
    //
    // NOTE on the scope of this assertion: we key on LIVE loads (asOf-absent).
    // Under THIS test's `useSearchParams` mock (which reads window.location), the
    // shallow board commit flips the resolved window 3y→90d, and the real
    // TimeScrubber transiently emits a non-live as-of on that transition — firing
    // a couple of `?asOf=` refetches. That is PRE-EXISTING scrubber behavior (it
    // happens on the non-seeded first-visit path too) and does NOT occur in
    // production, where useSearchParams ignores the History-API commit so the
    // window never transitions. It is orthogonal to this commit's caching win.
    const liveLayerCalls = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter(
        (u) =>
          u.startsWith("/api/panorama/") &&
          !u.includes("/kpis") &&
          !u.includes("asOf=") &&
          // The scrubber histogram (?histogram=1) is a separate scope-total call,
          // not a seeded-layer FEATURE load — this assertion guards the latter.
          !u.includes("histogram=1"),
      );
    const kpiCalls = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes("/api/panorama/kpis"));
    expect(liveLayerCalls).toEqual([]);
    // The KPIs were seeded server-side at the preset window; seededQsRef is
    // pre-armed with the committed scope+period so the commit skips the refetch.
    expect(kpiCalls).toEqual([]);
  });
});

describe("PanoramaConsole — debounce + keyed abort (panorama-redesign Fase 1)", () => {
  const coberturaCalls = () =>
    fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/panorama/cobertura"));

  it("coalesces rapid preset clicks into ONE fetch burst for the last selection", async () => {
    renderRedesignConsole();

    // Two clicks inside the 200ms debounce window: only the LAST preset fetches.
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /cumplimiento/i }));

    await waitFor(() => expect(coberturaCalls()).toHaveLength(1));
    // brotes-activos' zoonosis layer was superseded before its burst fired. The
    // scrubber histogram (?histogram=1) is a separate scope-total call, not the
    // superseded FEATURE fetch this test guards.
    const zoonosisCalls = fetchMock.mock.calls.filter(
      (c) =>
        String(c[0]).includes("/api/panorama/zoonosis") && !String(c[0]).includes("histogram=1"),
    );
    expect(zoonosisCalls).toHaveLength(0);
  });

  it("aborts a superseded in-flight fetch; the abort NEVER deactivates the layer; last click wins", async () => {
    deferMode = true;
    renderRedesignConsole();
    // Task #38 v3: the layer catalog is the Filtro rail panel — FiltroPanel
    // renders the cobertura row's checkbox + live loading/count spans directly
    // (LayerPanel is no longer mounted). P3.6: no Simple/Detalle toggle; full
    // detail always shows, so just open the panel.
    openFiltro();

    // Burst A (brotes-activos): cobertura + zoonosis go in flight after ~200ms.
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    await waitFor(() => expect(coberturaCalls()).toHaveLength(1));

    // Burst B (cumplimiento) supersedes A's cobertura fetch.
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /cumplimiento/i }));
    await waitFor(() => expect(coberturaCalls()).toHaveLength(2));

    const [first, second] = coberturaCalls();
    expect((first[1]?.signal as AbortSignal).aborted).toBe(true);
    expect((second[1]?.signal as AbortSignal).aborted).toBe(false);

    // Let A's AbortError rejection settle: the catch must EARLY-RETURN — the
    // layer stays active+loading (B in flight), never flipped to inactive.
    // Selecting a preset closes the rail panel (task #38 v3) — reopen Filtro
    // to read the row's live state (the underlying `states` is console state,
    // unaffected by the panel remounting).
    await act(async () => {});
    openFiltro();
    const coberturaCheckbox = screen.getByRole("checkbox", {
      name: /Cobertura antirrábica/,
    }) as HTMLInputElement;
    const coberturaRow = coberturaCheckbox.closest("label") as HTMLElement;
    expect(coberturaCheckbox.checked).toBe(true);
    expect(within(coberturaRow).getByText("cargando…")).toBeInTheDocument();

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
      expect(within(coberturaRow).queryByText("cargando…")).not.toBeInTheDocument();
      expect(coberturaCheckbox.checked).toBe(true);
      expect(within(coberturaRow).getByText("2")).toBeInTheDocument();
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

describe("PanoramaConsole — derived aggregation level (P4c design §5.5: scope-only, camera never flips it)", () => {
  it("KEEPS the province axis when the camera zooms past Z_LOCALITY at national scope (P4c)", async () => {
    renderConsole();
    // Activate a province-baseline preset with a choropleth base (cobertura).
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    await waitFor(() => {
      expect(mapProps?.onZoom).toBeInstanceOf(Function);
    });
    fetchMock.mockClear();

    // Zoom past the old locality threshold — the map reports the new camera zoom.
    act(() => {
      (mapProps!.onZoom as (z: number) => void)(6);
    });

    // P4c: free zoom is LOOKING, not drilling — the data axis stays province and
    // NO nationwide locality refetch fires (the old hysteresis flip fetched every
    // locality in the country here). Committing a jurisdiction is a CLICK.
    const coberturaCalls = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes("/api/panorama/cobertura"));
    expect(coberturaCalls.length).toBe(0);
  });

  it("keeps PROVINCE at national scope while the camera stays below Z_LOCALITY", async () => {
    renderConsole();
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
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

// ---------------------------------------------------------------------------
// QA fixes (cursor-agent review, panorama-vista-redesign)
// ---------------------------------------------------------------------------

describe("PanoramaConsole — scrubber temporal-gating cluster (QA fix)", () => {
  it("clears asOf and undims non-temporal layers once the active set loses its last temporal layer (finding 1)", async () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();
    openTimeline();

    // brotes-activos: base cobertura (non-temporal) + signal zoonosis (temporal).
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    // Task #38 v3: the layer catalog is the Filtro rail panel — FiltroPanel
    // renders the checkbox rows directly (LayerPanel is no longer mounted). P3.6:
    // no Simple/Detalle toggle; full detail always shows.
    openFiltro();

    // Start a scrub — the loop chip is enabled as soon as zoonosis is active
    // (activation is synchronous; it doesn't wait on the layer fetch).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "↺ última semana" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "↺ última semana" }));
    await waitFor(() => {
      const cobertura = (mapProps?.layers as Array<{ id: string; dimmed?: boolean }>)?.find(
        (l) => l.id === "cobertura",
      );
      expect(cobertura?.dimmed).toBe(true);
    });

    // Deactivate the only temporal layer — temporalAvailable flips false. The
    // Filtro panel is still open/Detalle (nothing since closed it), so the
    // zoonosis checkbox (checked, activated above) is reachable directly.
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Zoonosis/ }));
    });

    await waitFor(() => {
      expect(
        screen.getByText(/La reproducción temporal necesita una capa de eventos activa/),
      ).toBeInTheDocument();
    });
    // The map must stop dimming cobertura — asOf was cleared, not left stuck.
    await waitFor(() => {
      const cobertura = (mapProps?.layers as Array<{ id: string; dimmed?: boolean }>)?.find(
        (l) => l.id === "cobertura",
      );
      expect(cobertura?.dimmed).toBe(false);
    });
  });

  it("keyed-aborts a superseded as-of fetch on a rapid scrub (finding 4)", async () => {
    deferMode = true;
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();
    openTimeline();

    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "↺ última semana" })).toBeEnabled();
    });

    // Two rapid loop-chip clicks each move the scrub position, firing two
    // as-of fetches for the active temporal layer (zoonosis).
    fireEvent.click(screen.getByRole("button", { name: "↺ última semana" }));
    fireEvent.click(screen.getByRole("button", { name: "↺ último mes" }));

    await waitFor(() => {
      const asOfCalls = deferred.filter(
        (d) => d.url.includes("/api/panorama/zoonosis") && d.url.includes("asOf="),
      );
      expect(asOfCalls.length).toBeGreaterThanOrEqual(2);
    });
    const asOfCalls = deferred.filter(
      (d) => d.url.includes("/api/panorama/zoonosis") && d.url.includes("asOf="),
    );
    const [first, second] = asOfCalls.slice(-2);
    expect(first.signal?.aborted).toBe(true);
    expect(second?.signal?.aborted).toBe(false);
  });
});

describe("PanoramaConsole — province-level scrub paints the as-of frame (CRITICAL-2)", () => {
  it("fetches the as-of frame at level=province when scrubbing at province framing", async () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();
    openTimeline();

    // brotes-activos at national scope → province is the derived level; zoonosis
    // (temporal) is active.
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "↺ última semana" })).toBeEnabled();
    });
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "↺ última semana" }));

    // The zoonosis as-of fetch now carries the province level flag, so the frame
    // matches the province-aggregated map. Before the fix it fetched locality-level
    // and the province map silently kept painting the LIVE cache.
    await waitFor(() => {
      const asOfCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes("/api/panorama/zoonosis") && u.includes("asOf="));
      expect(asOfCalls.length).toBeGreaterThan(0);
      expect(asOfCalls.every((u) => u.includes("level=province"))).toBe(true);
    });
  });

  it("renders the as-of frame as the zoonosis data source (not the live province cache)", async () => {
    // Distinct payloads: the province-level as-of zoonosis returns ONE feature;
    // every other fetch stays empty. If the reorder is correct, the map's zoonosis
    // layer carries that as-of feature while scrubbing.
    const asOfFeature = {
      type: "Feature" as const,
      properties: { provinceCode: "AR-B", value: 42 },
      geometry: { type: "Point" as const, coordinates: [-60, -36] },
    };
    const custom = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      const isAsOfZoonosisProvince =
        url.includes("/api/panorama/zoonosis") &&
        url.includes("asOf=") &&
        url.includes("level=province");
      const body = url.includes("/api/panorama/kpis")
        ? INITIAL_KPIS
        : isAsOfZoonosisProvince
          ? { features: { type: "FeatureCollection", features: [asOfFeature] }, truncated: false }
          : OK_ENVELOPE;
      return Promise.resolve({ ok: true, json: async () => body } as unknown as Response);
    });
    vi.stubGlobal("fetch", custom);

    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();
    openTimeline();
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "↺ última semana" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "↺ última semana" }));

    await waitFor(() => {
      const zoonosis = (
        mapProps?.layers as Array<{ id: string; features: { features: unknown[] } }>
      )?.find((l) => l.id === "zoonosis");
      expect(zoonosis?.features.features.length).toBe(1);
    });
  });
});

describe("PanoramaConsole — bivariate is honest under a scrub (CRITICAL-2)", () => {
  it("disables the bivariate encoding while scrubbing and shows an honest note", async () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();
    openTimeline();

    // brotes-activos + province level + cobertura & zoonosis active → the encoding
    // toggle is offered.
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    const bivariateBtn = await screen.findByRole("button", { name: "Riesgo (bivariado)" });
    expect(bivariateBtn).toBeEnabled();

    // Start a scrub — cobertura is non-temporal (frozen), so a bivariate join would
    // mix time bases. The encoding must be disabled with an honest caption.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "↺ última semana" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "↺ última semana" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Riesgo (bivariado)" })).toBeDisabled();
    });
    expect(screen.getByText(/solo al último evento/i)).toBeInTheDocument();
  });
});

describe("PanoramaConsole — reading aligned with the metrics column (QA fix, finding 5)", () => {
  it("PanoramaReading headlines only the active preset's curated metrics, not the full KPI set", async () => {
    setUrl("/gob/panorama?period=3y");
    const customKpis = {
      kpis: [
        {
          id: "cobertura" as const,
          label: "Cobertura antirrábica",
          value: "10%",
          tone: "neutral" as const,
          info: { definition: "d" },
          href: "/x",
          source: "s",
          delta: { pct: 50, unit: "pct" as const, direction: "down" as const, label: "-50%" },
        },
        {
          id: "mordeduras" as const,
          label: "Mordeduras / 10k hab.",
          value: "3",
          tone: "neutral" as const,
          info: { definition: "d" },
          href: "/x",
          source: "s",
          delta: { pct: 5, unit: "pct" as const, direction: "up" as const, label: "+5%" },
        },
      ],
      recalculatedFor: "Recalculado para Nacional",
      dataAsOf: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/api/panorama/kpis") ? customKpis : OK_ENVELOPE;
        return Promise.resolve({ ok: true, json: async () => body } as unknown as Response);
      }),
    );

    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={customKpis}
      />,
    );

    // bienestar's curated metrics are denuncias/mordeduras/mascotas — cobertura
    // (the larger-magnitude delta) is excluded. The full-kpis reading would
    // headline cobertura; the aligned reading must headline mordeduras instead.
    openVista();
    fireEvent.click(screen.getByRole("radio", { name: /Bienestar/ }));

    await waitFor(() => {
      expect(screen.getByText(/Mordeduras empeora 5%/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Cobertura antirrábica empeora/)).not.toBeInTheDocument();
  });
});

describe("PanoramaConsole — saved-board Simple/Detalle strict boolean coercion (QA fix, finding 7)", () => {
  it("reads a corrupt non-boolean capasDetail/scrubDetail as Simple, never as truthy", async () => {
    window.localStorage.setItem(
      "panorama:board:v1",
      JSON.stringify({
        layers: "cobertura",
        level: "province",
        preset: null,
        period: "90d",
        capasDetail: "yes", // corrupt: not a boolean
        scrubDetail: 1, // corrupt: not a boolean
      }),
    );

    expect(() => renderConsole()).not.toThrow();

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("layers")).toBe("cobertura");
    });
    // P3.6: the Capas Simple/Detalle toggle was removed — a corrupt saved
    // capasDetail/scrubDetail must still restore without crashing (it is coerced
    // and kept for persistence continuity), and no Simple/Detalle button mounts.
    openFiltro();
    expect(
      screen.queryByRole("button", { name: "Modo simple de Capas del mapa" }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// perf plan 1.3 — streamed (un-awaited) KPIs: pending → resolved + last-set-wins
// ---------------------------------------------------------------------------

/** An externally-controllable promise, mirroring the RSC-streamed KPI loader. */
function deferredPromise<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const MORDEDURAS_KPIS: PanoramaKpis = {
  kpis: [
    {
      id: "mordeduras",
      label: "Mordeduras / 10k hab.",
      value: "1,2",
      tone: "warn",
      info: { definition: "d" },
      href: "/gob/vigilancia",
      source: "s",
    },
  ],
  recalculatedFor: "Recalculado para Nacional",
  dataAsOf: null,
  coverageDenominator: null,
};

describe("PanoramaConsole — streamed KPIs (perf plan 1.3)", () => {
  it("renders the 'Cargando indicadores…' pending state while the promise is unresolved, then the KPI once it lands", async () => {
    // Explicit period so the console does NOT rewrite the board on mount (no
    // preset auto-activation), keeping the strip in manual mode (shows all KPIs).
    setUrl("/gob/panorama?period=3y");
    const { promise, resolve } = deferredPromise<PanoramaKpis>();

    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        kpisPromise={promise}
      />,
    );

    // Pending: the metrics column shows the loading cue, not a KPI or the
    // degraded "no disponibles" copy.
    expect(screen.getByText("Cargando indicadores…")).toBeInTheDocument();
    expect(screen.queryByText("Mordeduras / 10k hab.")).not.toBeInTheDocument();

    await act(async () => {
      resolve(MORDEDURAS_KPIS);
      await promise;
    });

    // Resolved: the streamed KPI is rendered; the pending cue is gone.
    await waitFor(() => {
      expect(screen.getByText("Mordeduras / 10k hab.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Cargando indicadores…")).not.toBeInTheDocument();
  });

  it("last-set-wins: a client refetch that takes over is NOT clobbered by the late-resolving streamed seed", async () => {
    setUrl("/gob/panorama?period=3y");
    const { promise: seedPromise, resolve: resolveSeed } = deferredPromise<PanoramaKpis>();

    const view = render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        kpisPromise={seedPromise}
      />,
    );

    // Flush mount effects — the seed effect subscribes; the strip is pending.
    await act(async () => {});
    expect(screen.getByText("Cargando indicadores…")).toBeInTheDocument();

    // Change the period → scopePeriodQs changes → the client KPI refetch effect
    // issues (fetchMock returns the empty INITIAL_KPIS) and takes over the strip.
    setUrl("/gob/panorama?period=90d");
    await act(async () => {
      view.rerender(
        <PanoramaConsole
          defaultLayerId="perdidas"
          defaultFeatures={EMPTY_FC}
          kpisPromise={seedPromise}
        />,
      );
    });

    // The client refetch resolved to an EMPTY strip (no tiles) and cleared the
    // pending state — an empty settled strip now reads as a FAILURE state, never
    // an all-clear (empty ≠ all-clear, fix #1), so the metrics column shows the
    // degraded copy, not loading and not a reassuring "no disponibles".
    await waitFor(() => {
      expect(
        screen.getByText("No pudimos cargar los indicadores en este momento."),
      ).toBeInTheDocument();
    });

    // NOW the slow streamed seed resolves LATE with a stale payload. The guard
    // must skip it — the seed's KPI must never appear over the fresher refetch.
    await act(async () => {
      resolveSeed(MORDEDURAS_KPIS);
      await seedPromise;
    });

    expect(screen.queryByText("Mordeduras / 10k hab.")).not.toBeInTheDocument();
    expect(
      screen.getByText("No pudimos cargar los indicadores en este momento."),
    ).toBeInTheDocument();
  });
});

describe("PanoramaConsole — embedded scope drill (Theme 1: no reload)", () => {
  const mockAssign = vi.fn();
  const originalLocation = window.location;

  function stubLocation(url: string) {
    const u = new URL(url, "http://localhost");
    // jsdom's real location.assign is unspyable + throws on navigation — swap in
    // a stub exposing the fields the drill callbacks read plus a spyable assign.
    // pathname/search are the live URL the console reads via window.location.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, pathname: u.pathname, search: u.search, assign: mockAssign },
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    mockAssign.mockClear();
  });

  it("drills into a clicked province via SHALLOW pushState (no reload), reusing ?province + clearing locality/camera", async () => {
    setUrl("/gob/panorama?period=3y");
    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
      />,
    );
    expect(mapProps?.onProvinceDrill).toBeInstanceOf(Function);
    // No explicit province yet → no "← Volver".
    expect(mapProps?.onReturnNational).toBeUndefined();

    // A national camera is pinned in the URL (z/lat/lng) — the drill must DROP it
    // so the drilled province frames itself instead of restoring the national camera.
    stubLocation("/gob/panorama?period=3y&locality=stale&z=4.2&lat=-38&lng=-63");
    // Real pushState would fight the stubbed location; assert the call, no side effect.
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    pushSpy.mockClear();
    mockAssign.mockClear();

    await act(async () => {
      (mapProps!.onProvinceDrill as (code: string) => void)("AR-B");
    });

    // The scope committed via the shallow History API — NOT a reload, NOT the
    // router. (Other shallow URL-sync writes — level/board — also go through the
    // History API; the contract that matters is the scope commit + no reload.)
    expect(mockAssign).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    const drillPush = pushSpy.mock.calls
      .map((c) => new URL(c[2] as string, "http://localhost"))
      .find((u) => u.searchParams.get("province") === "AR-B");
    expect(drillPush).toBeDefined();
    expect(drillPush!.pathname).toBe("/gob/panorama");
    expect(drillPush!.searchParams.get("period")).toBe("3y");
    expect(drillPush!.searchParams.get("locality")).toBeNull();
    // Camera dropped — the province fit re-frames the map in place.
    expect(drillPush!.searchParams.get("z")).toBeNull();
    expect(drillPush!.searchParams.get("lat")).toBeNull();
    expect(drillPush!.searchParams.get("lng")).toBeNull();
    // The drilled province flows to the map immediately (no reload needed) so the
    // A1 autozoom + division rendering fire for AR-B.
    expect(mapProps?.selectedProvinceCode).toBe("AR-B");
    // A scope-bundle fetch was issued to refresh the switcher localities/centroids.
    await waitFor(() => {
      const scopeCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes("/api/panorama/scope"));
      expect(scopeCalls.some((u) => u.includes("province=AR-B"))).toBe(true);
    });
    pushSpy.mockRestore();
  });

  it("falls back to a full document navigation when the scope-bundle fetch fails (graceful degrade)", async () => {
    setUrl("/gob/panorama?period=3y");
    // A scope fetch that fails must degrade to today's behavior (full reload),
    // never a half-updated map.
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("/api/panorama/scope")) {
          return Promise.resolve({ ok: false, status: 503 } as Response);
        }
        const body = u.includes("/api/panorama/kpis") ? INITIAL_KPIS : OK_ENVELOPE;
        return Promise.resolve({ ok: true, json: async () => body } as unknown as Response);
      }),
    );
    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
      />,
    );
    stubLocation("/gob/panorama?period=3y");
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    pushSpy.mockClear();
    mockAssign.mockClear();

    await act(async () => {
      (mapProps!.onProvinceDrill as (code: string) => void)("AR-B");
    });

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledTimes(1);
    });
    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost");
    expect(url.searchParams.get("province")).toBe("AR-B");
    pushSpy.mockRestore();
  });

  it("does NOT offer a drill or return to a jurisdiction-scoped operator", () => {
    setUrl("/gob/panorama?period=3y");
    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
        initialDivisionProvince="AR-C"
      />,
    );
    expect(mapProps?.onProvinceDrill).toBeUndefined();
    expect(mapProps?.onReturnNational).toBeUndefined();
  });

  it("offers ← Volver for an explicit province pick and pops back to national via pushState (no reload)", async () => {
    setUrl("/gob/panorama?period=3y&province=AR-B");
    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
      />,
    );
    expect(mapProps?.onReturnNational).toBeInstanceOf(Function);

    stubLocation("/gob/panorama?period=3y&province=AR-B&z=7.1&lat=-36&lng=-59");
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    pushSpy.mockClear();
    mockAssign.mockClear();

    await act(async () => {
      (mapProps!.onReturnNational as () => void)();
    });

    // Popped back to national with NO reload — a shallow History commit only.
    expect(pushSpy).toHaveBeenCalled();
    expect(mockAssign).not.toHaveBeenCalled();
    // The commit that dropped the province (and its camera) so national re-frames.
    const returnPush = pushSpy.mock.calls
      .map((c) => new URL(c[2] as string, "http://localhost"))
      .find((u) => u.searchParams.get("province") === null);
    expect(returnPush).toBeDefined();
    expect(returnPush!.searchParams.get("period")).toBe("3y");
    expect(returnPush!.searchParams.get("z")).toBeNull();
    expect(returnPush!.searchParams.get("lat")).toBeNull();
    expect(returnPush!.searchParams.get("lng")).toBeNull();
    // Return-to-national needs no scope-bundle fetch.
    expect(
      fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes("/api/panorama/scope")),
    ).toBe(false);
    // The map immediately returns to the national basemap (no province).
    expect(mapProps?.selectedProvinceCode).toBeNull();
    pushSpy.mockRestore();
  });

  it("browser Back (popstate) reverts a drill: scope follows the POPPED URL, no reload", async () => {
    setUrl("/gob/panorama?period=3y");
    render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
      />,
    );

    // Drill into AR-B — the map reflects the drilled province (client-committed).
    stubLocation("/gob/panorama?period=3y");
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    pushSpy.mockClear();
    mockAssign.mockClear();
    await act(async () => {
      (mapProps!.onProvinceDrill as (code: string) => void)("AR-B");
    });
    expect(mapProps?.selectedProvinceCode).toBe("AR-B");

    // Browser Back: the popped history entry is the national URL. A native
    // popstate does NOT re-sync useSearchParams in this Next version, so the
    // console must read the POPPED URL straight off window.location and revert
    // the client-committed scope — otherwise URL and view diverge (the bug).
    stubLocation("/gob/panorama?period=3y"); // national again — no ?province
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // Scope tracks the popped URL (national) — no divergence, no full reload.
    expect(mapProps?.selectedProvinceCode).toBeNull();
    expect(mockAssign).not.toHaveBeenCalled();
    pushSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Live-QA regressions (2026-07-11): parts of the console still read the SERVER
// scope/level instead of the client drill state — the map prop is already
// client-wired, but the masthead pill was a byte-static server string and the
// level leaked across drill→Back. These tests reproduce each and pin the fix.
// ---------------------------------------------------------------------------
describe("PanoramaConsole — embedded drill: masthead pill + level reset (live-QA regressions)", () => {
  // The pages hand the console a `scopeLabel` (server default) + `allowedProvinces`.
  // Passing both mounts the masthead header (pill) AND the embedded switcher.
  function renderScopedConsole(extraProps: Record<string, unknown> = {}) {
    return render(
      <PanoramaConsole
        defaultLayerId="perdidas"
        defaultFeatures={EMPTY_FC}
        initialKpis={INITIAL_KPIS}
        scopeLabel="Nacional · todas las provincias"
        allowedProvinces={[
          { code: "AR-B", name: "Buenos Aires" },
          { code: "AR-C", name: "Ciudad Autónoma de Buenos Aires" },
        ]}
        {...extraProps}
      />,
    );
  }

  it("MEDIUM: the masthead pill re-labels to the drilled province on a client drill (was stuck on the server scopeLabel)", async () => {
    setUrl("/gob/panorama?period=3y");
    renderScopedConsole();

    // National at first paint — the pill shows the server default.
    expect(screen.getByTestId("panorama-scope-pill")).toHaveTextContent(
      "Nacional · todas las provincias",
    );

    // Drill into Buenos Aires via the SHALLOW client commit (no reload). Mock
    // pushState so window.location stays national — the pill must track the
    // client scopeOverride, NOT the URL/server value.
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    await act(async () => {
      (mapProps!.onProvinceDrill as (code: string) => void)("AR-B");
    });

    // The pill now names the drilled province (from the SAME client scope the
    // map/KPIs read), and the national default is gone.
    const pill = screen.getByTestId("panorama-scope-pill");
    expect(pill).toHaveTextContent("Buenos Aires");
    expect(pill).not.toHaveTextContent("Nacional · todas las provincias");
    pushSpy.mockRestore();
  });

  it("A11Y M2 (WCAG 4.1.3): a scope commit is announced in a polite live region", async () => {
    setUrl("/gob/panorama?period=3y");
    renderScopedConsole();

    // The live region exists and is silent on first paint (no announcement of
    // the initial scope — aria-live only fires on subsequent mutations).
    const live = screen.getByTestId("panorama-scope-live");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("");

    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    await act(async () => {
      (mapProps!.onProvinceDrill as (code: string) => void)("AR-B");
    });

    // After the commit the region publishes the new scope for a screen reader.
    expect(screen.getByTestId("panorama-scope-live")).toHaveTextContent("Alcance: Buenos Aires");
    pushSpy.mockRestore();
  });

  it("A11Y M1 (WCAG 2.4.3): committing a scope from the OPEN pill returns focus to the trigger", async () => {
    setUrl("/gob/panorama?period=3y");
    renderScopedConsole();

    // Open the jurisdiction disclosure and put focus on the trigger — the exact
    // keyboard path (Enter on the pill opens it, then the operator drives the
    // embedded <select>). The commit auto-closes the panel; M1 asserts focus is
    // RESTORED to the pill rather than dropped to <body> (a11y review round 2 —
    // the live-region text was covered, the focus landing was not).
    const pill = screen.getByTestId("panorama-scope-pill");
    const details = pill.closest("details") as HTMLDetailsElement;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    pill.focus();
    expect(pill).toHaveFocus();

    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Provincia"), { target: { value: "AR-B" } });
    });

    expect(pill).toHaveFocus();
    expect(details.hasAttribute("open")).toBe(false);
    pushSpy.mockRestore();
  });

  it("QA fix (2026-07-11 §3): an OUT-OF-SCOPE province drill (not in allowedProvinces) shows the province NAME, not the raw ISO code", async () => {
    // A govt-local operator (allowedProvinces here is only AR-B/AR-C) can be
    // forced to an out-of-scope province via ?province= (e.g. a leak probe);
    // the fence still returns zero data, but the pill previously fell back to
    // the raw code ("AR-V") because it only looked the name up in
    // allowedProvinces — which never contains an out-of-scope code.
    setUrl("/gob/panorama?period=3y");
    renderScopedConsole();
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    await act(async () => {
      (mapProps!.onProvinceDrill as (code: string) => void)("AR-V");
    });

    const pill = screen.getByTestId("panorama-scope-pill");
    expect(pill).toHaveTextContent("Tierra del Fuego");
    expect(pill).not.toHaveTextContent("AR-V");
    pushSpy.mockRestore();
  });

  it("MEDIUM: a JurisdictionSwitcher province pick drives BOTH the map prop and the pill (switcher path)", async () => {
    setUrl("/gob/panorama?period=3y");
    renderScopedConsole();
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    // Pick a province in the embedded switcher `<select>` (commitScopeDrill).
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Provincia"), { target: { value: "AR-B" } });
    });

    // The client scope flows to the map (autozoom source) AND the pill together.
    expect(mapProps?.selectedProvinceCode).toBe("AR-B");
    expect(screen.getByTestId("panorama-scope-pill")).toHaveTextContent("Buenos Aires");
    pushSpy.mockRestore();
  });

  it("HIGH: browser Back after a drill resets the aggregation axis to province (national), not the stuck 'Localidades' view", async () => {
    setUrl("/gob/panorama?period=3y");
    renderScopedConsole();
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    // Drill into AR-B → the derived level flips to locality (scope-wins)…
    await act(async () => {
      (mapProps!.onProvinceDrill as (code: string) => void)("AR-B");
    });
    // …and the autozoom fits the province, leaving the camera at a drilled-in
    // zoom (past the province↔locality boundary).
    await act(async () => {
      (mapProps!.onZoom as (z: number) => void)(8);
    });
    // Sanity: the map now aggregates by the province's departments.
    expect(mapProps?.aggregationLabel).toBe("Departamentos/partidos");

    // Browser Back to national (pushState was mocked, so window.location is still
    // national — no ?province). Before the fix the level stayed "locality" off
    // the stale drilled-in zoom, so the national choropleth painted "Localidades"
    // ("sin datos en todo el país"). The revert must restore the province axis.
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(mapProps?.selectedProvinceCode).toBeNull();
    expect(mapProps?.aggregationLabel).toBe("Provincias");
    pushSpy.mockRestore();
  });

  it("HIGH: the in-map ← Volver also resets the axis to province (same reset as popstate)", async () => {
    setUrl("/gob/panorama?period=3y&province=AR-B");
    renderScopedConsole();
    const pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    // Opened already drilled into AR-B (locality axis); camera at a drilled-in zoom.
    await act(async () => {
      (mapProps!.onZoom as (z: number) => void)(8);
    });
    expect(mapProps?.aggregationLabel).toBe("Departamentos/partidos");

    // ← Volver (onReturnNational → commitScopeDrill(null, null)).
    await act(async () => {
      (mapProps!.onReturnNational as () => void)();
    });

    expect(mapProps?.selectedProvinceCode).toBeNull();
    expect(mapProps?.aggregationLabel).toBe("Provincias");
    pushSpy.mockRestore();
  });
});
