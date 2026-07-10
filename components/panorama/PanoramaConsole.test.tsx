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
    // ARCHETYPE A: the TimeScrubber is DOCKED inside the map card via the
    // `bottomDock` prop — render it so the scrubber-gating assertions still see it.
    return <div data-testid="map-region">{props.bottomDock as ReactNode}</div>;
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

    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("fetches the preset's layers client-side against the NEW period", async () => {
    renderConsole();

    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

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
    // Missing capasDetail/scrubDetail default to Simple (false) — both
    // Simple/Detalle toggles read "Simple" as pressed. (Open the Capas popover
    // so the toggle mounts — layers are secondary chrome in the redesign.)
    openCapas();
    expect(screen.getByRole("button", { name: "Modo simple de capas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
 * Open the "Capas" popover so its CapasBox (Simple/Detalle toggle, LayerPanel)
 * mounts. The ARCHETYPE redesign moved the layer catalog behind a compact
 * popover button — layers are secondary to the preset strip — so any test that
 * interacts with the Simple/Detalle controls must open it first.
 */
function openCapas(): void {
  // The popover trigger is the only "Capas" button carrying aria-expanded — the
  // bivariate encoding toggle (Brotes vista) is also labelled "Capas" but has no
  // expanded state, so filtering by `expanded` disambiguates them.
  fireEvent.click(screen.getByRole("button", { name: /Capas/, expanded: false }));
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
  it("renders Vista strip → map → SuppressionNotice (map column) → KPIs → Reading LAST (monitoring rail order)", () => {
    // Explicit period → the first-visit default preset does NOT rewrite the
    // board, so the server-seeded perdidas layer (suppressedCount 3) stays on
    // and the suppression notice is visible for the DOM-order assertion.
    setUrl("/gob/panorama?period=3y");
    // A REAL loaded strip (flat tile) so the reading is the legit "Sin variación
    // destacable…" landmark — an EMPTY strip now reads as a failure state (fix #1).
    renderRedesignConsole({ defaultSuppressedCount: 3, initialKpis: REAL_KPIS });

    const presets = screen.getByText("Vista");
    const map = screen.getByTestId("map-region");
    // SuppressionNotice lives WITH the map it describes (design Decision 1) —
    // it sits AFTER the map, inside the same map column.
    const notice = screen.getByText(/celdas con menos de 5 casos/);
    const strip = screen.getByTestId("kpi-strip");
    // ARCHETYPE monitoring rail: KPIs lead, the one-line reading (narration) is
    // LAST — so it now sits AFTER the KPI strip, not before it.
    const reading = screen.getByText("Sin variación destacable frente al período anterior.");

    expect(isBefore(presets, map)).toBe(true);
    expect(isBefore(map, notice)).toBe(true);
    expect(isBefore(notice, strip)).toBe(true);
    expect(isBefore(strip, reading)).toBe(true);
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

  it("hosts the filters slot inside the 'Alcance y período' disclosure, next to CapasBox", () => {
    const { container } = renderRedesignConsole();

    const scopeSummary = screen.getByText("Alcance y período");
    expect(scopeSummary.closest("details")).not.toBeNull();
    // panorama-vista-redesign Phase 2: "Personalizar" moved into CapasBox's
    // Detalle mode (rendered inside the Vista panel, not the right rail).
    expect(screen.getByText("Capas")).toBeInTheDocument();

    // The slot content is REACHABLE (identical behavior, one click away)…
    const filterSelect = screen.getByLabelText("Provincia");
    // …but sits behind the closed disclosure at first paint.
    const details = filterSelect.closest("details");
    expect(details).not.toBeNull();
    expect(details!.hasAttribute("open")).toBe(false);
    expect(container.contains(filterSelect)).toBe(true);
  });

  it("first paint: Vista strip + the Capas button + the compact TimeScrubber are all visible (no disclosures); layers open in the popover", () => {
    // ARCHETYPE redesign: the preset strip stays first-paint (presets-as-
    // onboarding), the layer catalog moved behind a compact "Capas" popover
    // (layers secondary), and the scrubber is a compact always-present element
    // under the map — none hides behind a details disclosure.
    const { container } = renderRedesignConsole({ defaultSuppressedCount: 3 });

    // The 6 preset tabs are first-paint.
    expect(
      Array.from(container.querySelectorAll("button")).filter(
        (b) => b.closest("details:not([open])") === null,
      ).length,
    ).toBeGreaterThanOrEqual(6);
    // The "Capas" trigger is visible at first paint (not behind a disclosure);
    // the Simple/Detalle toggle only mounts once the popover is opened.
    const capasBtn = screen.getByRole("button", { name: /Capas/, expanded: false });
    expect(capasBtn).toBeVisible();
    expect(capasBtn.closest("details:not([open])")).toBeNull();
    expect(screen.queryByRole("button", { name: "Modo simple de capas" })).not.toBeInTheDocument();
    openCapas();
    expect(screen.getByRole("button", { name: "Modo simple de capas" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Modo detalle de capas" })).toBeVisible();
    // The scrubber's range input IS first-paint now — no "Reproducir en el
    // tiempo" disclosure wrapper exists anymore (superseded, Phase 4).
    expect(screen.queryByText("Reproducir en el tiempo")).not.toBeInTheDocument();
    const range = container.querySelector("input[type='range']");
    expect(range).not.toBeNull();
    expect(range!.closest("details:not([open])")).toBeNull();
  });

  it("PO screenshot fix (2026-07-08): Vista cards show only the label — clicking a tab activates the preset with no question/description line rendered anywhere", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

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

    fireEvent.click(screen.getByRole("radio", { name: /cumplimiento/i }));

    expect(screen.getByText("No disponible en esta vista")).toBeInTheDocument();
  });

  it("current-state base (brotes-activos: cobertura base): active scrubber carries the honest 'estado actual' disclaimer (trust/safety)", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    // brotes-activos: base cobertura (current-state) + signal zoonosis (temporal)
    // → the scrubber stays active (zoonosis reproduces) but must state plainly
    // that the cobertura fill does not move with the fecha de corte.
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    expect(screen.queryByText("No disponible en esta vista")).not.toBeInTheDocument();
    expect(
      screen.getByText("Estado actual — cobertura antirrábica no varía con la fecha de corte."),
    ).toBeInTheDocument();
  });

  it("activating a temporal layer self-enables the scrubber without a reload", async () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    fireEvent.click(screen.getByRole("radio", { name: /cumplimiento/i }));
    expect(screen.getByText("No disponible en esta vista")).toBeInTheDocument();
    // Flip to Detalle so the mocked LayerPanel mounts and captures onToggle.
    openCapas();
    fireEvent.click(screen.getByRole("button", { name: "Modo detalle de capas" }));

    // zoonosis is temporal — activating it must flip temporalAvailable true.
    await act(async () => {
      layerPanelProps?.onToggle?.("zoonosis");
    });

    await waitFor(() => {
      expect(screen.queryByText("No disponible en esta vista")).not.toBeInTheDocument();
    });
  });
});

describe("PanoramaConsole — preset frame (camera-only)", () => {
  // Explicit period in the URL → the first-visit default preset stays out of
  // the way, so token counting starts at the test's own clicks.
  it("passes { framing, token } to the map when the preset carries framing", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    expect(mapProps?.frame).toEqual({ framing: { kind: "national" }, token: 1 });
  });

  it("re-clicking the SAME preset bumps the token so the map re-frames", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));

    expect(mapProps?.frame).toEqual({ framing: { kind: "national" }, token: 2 });
  });

  it("clears the frame when a framing-less preset is selected (map behavior unchanged)", () => {
    setUrl("/gob/panorama?period=3y");
    renderRedesignConsole();

    // bienestar is a locality-level drill-down preset — deliberately framing-less
    // (design-QA 2026-07-04: only national-overview presets frame the country).
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
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
        (u) => u.startsWith("/api/panorama/") && !u.includes("/kpis") && !u.includes("asOf="),
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
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    fireEvent.click(screen.getByRole("radio", { name: /cumplimiento/i }));

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
    // CapasBox mounts LayerPanel only in Detalle mode (panorama-vista-redesign
    // Phase 2) — flip to Detalle so the mocked LayerPanel captures `states`.
    openCapas();
    fireEvent.click(screen.getByRole("button", { name: "Modo detalle de capas" }));

    // Burst A (brotes-activos): cobertura + zoonosis go in flight after ~200ms.
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    await waitFor(() => expect(coberturaCalls()).toHaveLength(1));

    // Burst B (cumplimiento) supersedes A's cobertura fetch.
    fireEvent.click(screen.getByRole("radio", { name: /cumplimiento/i }));
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
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
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

    // brotes-activos: base cobertura (non-temporal) + signal zoonosis (temporal).
    fireEvent.click(screen.getByRole("radio", { name: /Brotes activos/ }));
    // Flip to Detalle so LayerPanel mounts and captures onToggle.
    openCapas();
    fireEvent.click(screen.getByRole("button", { name: "Modo detalle de capas" }));

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

    // Deactivate the only temporal layer — temporalAvailable flips false.
    await act(async () => {
      layerPanelProps?.onToggle?.("zoonosis");
    });

    await waitFor(() => {
      expect(screen.getByText("No disponible en esta vista")).toBeInTheDocument();
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

    // brotes-activos at national scope → province is the derived level; zoonosis
    // (temporal) is active.
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

    // brotes-activos + province level + cobertura & zoonosis active → the encoding
    // toggle is offered.
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
          delta: { pct: 50, direction: "down" as const, label: "-50%" },
        },
        {
          id: "mordeduras" as const,
          label: "Mordeduras / 10k hab.",
          value: "3",
          tone: "neutral" as const,
          info: { definition: "d" },
          href: "/x",
          source: "s",
          delta: { pct: 5, direction: "up" as const, label: "+5%" },
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
    openCapas();
    expect(screen.getByRole("button", { name: "Modo simple de capas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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

describe("PanoramaConsole — click-to-drill province (task #55)", () => {
  const mockAssign = vi.fn();
  const originalLocation = window.location;

  function stubLocation(url: string) {
    const u = new URL(url, "http://localhost");
    // jsdom's real location.assign is unspyable + throws on navigation — swap in
    // a stub exposing the fields the drill callbacks read plus a spyable assign.
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

  it("drills into a clicked province via full navigation, reusing ?province + clearing locality", () => {
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
    // so the reloaded province frames itself instead of restoring the national camera.
    stubLocation("/gob/panorama?period=3y&locality=stale&z=4.2&lat=-38&lng=-63");
    mockAssign.mockClear();
    (mapProps!.onProvinceDrill as (code: string) => void)("AR-B");

    expect(mockAssign).toHaveBeenCalledTimes(1);
    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost");
    expect(url.pathname).toBe("/gob/panorama");
    expect(url.searchParams.get("province")).toBe("AR-B");
    expect(url.searchParams.get("period")).toBe("3y");
    expect(url.searchParams.get("locality")).toBeNull();
    // Camera dropped — the province fit runs on reload.
    expect(url.searchParams.get("z")).toBeNull();
    expect(url.searchParams.get("lat")).toBeNull();
    expect(url.searchParams.get("lng")).toBeNull();
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

  it("offers ← Volver only for an explicit province pick and pops back to national", () => {
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
    mockAssign.mockClear();
    (mapProps!.onReturnNational as () => void)();

    expect(mockAssign).toHaveBeenCalledTimes(1);
    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost");
    expect(url.searchParams.get("province")).toBeNull();
    expect(url.searchParams.get("period")).toBe("3y");
    // The province-framed camera is dropped so the national view re-frames itself.
    expect(url.searchParams.get("z")).toBeNull();
    expect(url.searchParams.get("lat")).toBeNull();
    expect(url.searchParams.get("lng")).toBeNull();
  });
});
