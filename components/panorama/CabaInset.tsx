"use client";

import type maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { ActiveLayer } from "@/components/panorama/SituationalMap";
import {
  type DivisionLevel,
  divisionFillColorExpr,
  divisionSuppressedFilter,
  joinCellsToDivisionsMulti,
} from "@/components/panorama/division-fill";
import { fetchGeojsonCached } from "@/components/panorama/geojson-cache";
import { HATCH_IMAGE_ID, buildHatchImageData } from "@/components/panorama/hatch-pattern";
import { normalizeBarioCode } from "@/lib/infra/geo-join";

import "maplibre-gl/dist/maplibre-gl.css";

// ---------------------------------------------------------------------------
// CabaInset — a docked barrio-scale mini-map of CABA (map-polish cursor Part2).
//
// At national zoom CABA is an unreadable smear on the main SituationalMap. This
// inset renders the 48 barrios (public/geo/caba-barrios.geojson) at a fixed,
// non-interactive frame and fills them with the active choropleth base layer's
// CABA aggregates — reusing the EXACT division-fill join, color expression, and
// k-anon hatch as the main map, so a barrio never reads differently here.
//
// PRIVACY: same-origin GeoJSON only (no external tiles/glyphs — the main map's
// §13.4 rule), same aggregates, same k=5 suppression. This is a PRESENTATION
// panel: it invents no data and surfaces no count the main map would not.
//
// MINIMAL by design (this batch): static CABA camera, no camera sync with the
// main map, no hover popups, CABA-only (no GBA/AMBA departamentos). A fuller
// version would sync the camera, add the surrounding AMBA departamentos, and
// mirror hover — see the map-polish notes.
// ---------------------------------------------------------------------------

const CABA_BARRIOS_URL = "/geo/caba-barrios.geojson";
// A fixed bounding box around CABA (lng/lat). The inset camera never moves.
const CABA_BBOX: [[number, number], [number, number]] = [
  [-58.531, -34.705],
  [-58.335, -34.526],
];

// Dark-console chrome palette — mirrors the main SituationalMap basemap consts
// (chrome, not data-scale tokens; the data colors come from viz-scales via the
// shared division-fill expression).
// LIGHT canvas (v2C — dark skin retired 2026-07-11). Mirror SituationalMap.
const COLOR_CANVAS = "#ffffff";
const COLOR_LAND = "#eef1f4";
const COLOR_DIVISION_LINE = "#3a4568";
const DATA_FILL_OPACITY = 0.92;

const SRC = "caba-inset-src";
const LAND_FILL = "caba-inset-land";
const DATA_FILL = "caba-inset-data";
const SUPPRESS_FILL = "caba-inset-suppress";
const LINE = "caba-inset-line";

type Props = {
  /** The active choropleth base layer whose CABA cells fill the barrios (or null). */
  layer: ActiveLayer | null;
  /** Whether the inset is shown (national/regional zoom, a choropleth active). */
  visible: boolean;
  /**
   * #9 — when the active base layer is PROVINCE-level (national zoom, e.g. rabies
   * coverage), CABA has a single province value, not per-barrio granularity. The
   * parent evaluates that value against the SAME scale the main map uses (divergent
   * for rate layers, sequential otherwise) and passes the resulting flat color
   * here; the inset then fills all 48 barrios uniformly with it so CABA is legible
   * at national zoom and reads the SAME color as its (tiny) polygon on the main
   * map. Null for a locality-level layer, which keeps the per-barrio join below.
   */
  uniformFill?: string | null;
  /**
   * Adversarial-review fix (2026-07-11, LOW #6 — twin of M1): the EFFECTIVE
   * classed breaks the MAIN division fill renders with (the live-edge breaks,
   * frozen across a time-scrub by SituationalMap's scale-lock). Without them
   * the inset derived its own quantiles over CABA-only values, so barrio colors
   * diverged from the main choropleth — visibly so mid-scrub. Threaded into the
   * per-barrio divisionFillColorExpr join below; ignored in uniform-fill mode
   * (the parent already classifies the single province value).
   */
  lockedBreaks?: readonly number[] | null;
  /**
   * Round-3 QA fix 3 / task #66c: drill into CABA on click — reuses the SAME
   * shallow `commitScopeDrill("AR-C", null)` seam a main-map province click
   * uses (wired by the console as `onProvinceDrill("AR-C")`), so tapping CABA
   * in the mini-map behaves identically to tapping CABA on the main map. When
   * absent (no drill target, mirroring the main map's `canDrillProvince`
   * gate), the panel stays the original display-only div.
   */
  onDrill?: () => void;
};

/** One raw barrio feature, as much as the code read needs. */
type BarrioRawFeature = { properties?: { code?: string } | null };

export function CabaInset({
  layer,
  visible,
  uniformFill = null,
  lockedBreaks = null,
  onDrill,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const barrioCodesRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef(false);
  const layerRef = useRef<ActiveLayer | null>(layer);
  layerRef.current = layer;
  const uniformFillRef = useRef<string | null>(uniformFill);
  uniformFillRef.current = uniformFill;
  const lockedBreaksRef = useRef<readonly number[] | null>(lockedBreaks);
  lockedBreaksRef.current = lockedBreaks;

  // Mount the mini-map once the inset becomes visible; tear it down when hidden.
  useEffect(() => {
    if (!visible || !containerRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "bg", type: "background", paint: { "background-color": COLOR_CANVAS } }],
        },
        interactive: false,
        attributionControl: false,
        center: [-58.435, -34.61],
        zoom: 9,
      });
      mapRef.current = map;

      map.on("load", async () => {
        if (cancelled) return;
        try {
          if (!map.hasImage(HATCH_IMAGE_ID)) {
            const hatch = buildHatchImageData();
            if (hatch) map.addImage(HATCH_IMAGE_ID, hatch, { pixelRatio: 2 });
          }
        } catch {
          // No canvas — suppressed barrios fall back to outline-only.
        }
        try {
          // biome-ignore lint/suspicious/noExplicitAny: runtime JSON from local GeoJSON asset.
          const raw = await fetchGeojsonCached<any>(CABA_BARRIOS_URL);
          if (cancelled) return;
          const features = (raw.features ?? []) as BarrioRawFeature[];
          map.addSource(SRC, {
            type: "geojson",
            data: { type: "FeatureCollection", features } as unknown as GeoJSON.FeatureCollection,
            promoteId: "code",
          });
          const codes = new Set<string>();
          for (const f of features) {
            const c = f.properties?.code;
            if (typeof c === "string") codes.add(normalizeBarioCode(c));
          }
          barrioCodesRef.current = codes;

          // Land base (so a no-data barrio reads as territory, not a hole), then
          // the data fill, the k-anon hatch, and the outline on top.
          map.addLayer({
            id: LAND_FILL,
            type: "fill",
            source: SRC,
            paint: { "fill-color": COLOR_LAND, "fill-opacity": 1 },
          });
          map.addLayer({
            id: DATA_FILL,
            type: "fill",
            source: SRC,
            paint: {
              "fill-color": divisionFillColorExpr(new Map()),
              "fill-opacity": DATA_FILL_OPACITY,
            },
          });
          map.addLayer({
            id: SUPPRESS_FILL,
            type: "fill",
            source: SRC,
            paint: { "fill-pattern": HATCH_IMAGE_ID, "fill-opacity": 0.85 },
            filter: divisionSuppressedFilter(new Set()),
          });
          map.addLayer({
            id: LINE,
            type: "line",
            source: SRC,
            paint: { "line-color": COLOR_DIVISION_LINE, "line-width": 0.6, "line-opacity": 0.85 },
          });
          map.fitBounds(CABA_BBOX, { padding: 8, animate: false });
          loadedRef.current = true;
          syncFill();
        } catch {
          // Barrios asset unavailable — the inset stays an empty dark panel.
        }
      });
    });

    return () => {
      cancelled = true;
      loadedRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Mount tied to visibility; the fill is reconciled by the effect below.
  }, [visible]);

  // Recompute the barrio fill whenever the active base layer, the province-level
  // uniform fill, or the main map's effective classed breaks change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: layer + uniformFill + lockedBreaks are the intended triggers.
  useEffect(() => {
    if (loadedRef.current) syncFill();
  }, [layer, uniformFill, lockedBreaks]);

  // Join the active layer's cells to the CABA barrios and repaint the data fill +
  // suppression hatch. A province-level layer (no locality names) simply yields
  // no matches → outline-only barrios, which is the honest minimal behavior.
  function syncFill() {
    const map = mapRef.current;
    if (!map || !map.getLayer(DATA_FILL)) return;
    const l = layerRef.current;
    const codes = barrioCodesRef.current;
    // #9 — province-level layer: CABA has one province value, not per-barrio data.
    // Fill every barrio uniformly with the parent-evaluated color (same scale as
    // the main map) so CABA is legible at national zoom; no k-anon hatch (a single
    // province value is never suppressed). Honest: the chrome labels it a province
    // value, and every barrio reads identically (no invented per-barrio variation).
    const uniform = uniformFillRef.current;
    if (uniform && codes.size > 0) {
      map.setPaintProperty(DATA_FILL, "fill-color", uniform);
      if (map.getLayer(SUPPRESS_FILL)) {
        map.setFilter(SUPPRESS_FILL, divisionSuppressedFilter(new Set()));
      }
      return;
    }
    if (!l || codes.size === 0) {
      map.setPaintProperty(DATA_FILL, "fill-color", divisionFillColorExpr(new Map()));
      if (map.getLayer(SUPPRESS_FILL)) {
        map.setFilter(SUPPRESS_FILL, divisionSuppressedFilter(new Set()));
      }
      return;
    }
    const join = joinCellsToDivisionsMulti(l.features, [
      { level: "barrio" as DivisionLevel, codes },
    ]);
    // LOW #6 (M1 twin): classify the barrios with the MAIN map's effective
    // breaks (live-edge, scrub-frozen) so the inset colors match the main
    // choropleth on every frame — never a CABA-only quantile re-derivation.
    map.setPaintProperty(
      DATA_FILL,
      "fill-color",
      divisionFillColorExpr(join.values, lockedBreaksRef.current),
    );
    if (map.getLayer(SUPPRESS_FILL)) {
      map.setFilter(SUPPRESS_FILL, divisionSuppressedFilter(join.suppressed));
    }
  }

  if (!visible) return null;

  // task #38 v3: pushed LEFT of the floating vertical rail (right-3.5, ~56px
  // wide) so the AMBA magnifier clears it — the rail now owns the right edge.
  const panelClassName =
    "absolute right-[4.9rem] top-3.5 w-[168px] overflow-hidden rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card shadow-lg";
  const content = (
    <>
      <div className="flex items-baseline justify-between px-2 py-1 text-ln-op-ink-2">
        <span className="text-[var(--text-xs)] font-medium">CABA</span>
        <span className="text-[var(--text-xs)] text-ln-op-mute">
          {uniformFill ? "valor provincial" : "por barrio"}
        </span>
      </div>
      <div ref={containerRef} className="h-[150px] w-full" style={{ background: COLOR_CANVAS }} />
    </>
  );

  // Round-3 QA fix 3: when a drill target exists, the whole panel becomes a
  // real <button> (native Enter/Space handling, no bespoke keydown wiring) so
  // clicking/activating CABA in the inset drills exactly like clicking the
  // province on the main map. No drill target ⇒ stays the original inert div.
  if (onDrill) {
    return (
      <button
        type="button"
        onClick={onDrill}
        aria-label="Ver CABA en detalle"
        className={`${panelClassName} text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul focus-visible:ring-offset-1`}
      >
        {content}
      </button>
    );
  }

  return <div className={panelClassName}>{content}</div>;
}
