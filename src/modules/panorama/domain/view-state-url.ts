// Panorama ViewState — the single URL serialize/deserialize boundary (task #50).
//
// P1a: the ONE seam between the canonical `PanoramaViewState` and the browser
// URL, replacing the scattered `searchParams.get(...)` reads + `params.set(...)`
// writes documented in docs/plans/panorama-viewstate-inventory.md. Making the
// boundary symmetric fixes the H14 deep-link round-trip defect structurally: the
// property `viewStateFromParams(viewStateToParams(v)) ≡ v` (over the serialized
// fields) is a unit test, so any param read-but-never-written (or vice-versa)
// fails red instead of shipping as a field report.
//
// SERIALIZED (round-trips): scope, period, asOf, layers, verifiedOnly, preset,
// camera. EPHEMERAL by design (§4.2): basis (a lens, not a coordinate — fork #1),
// encoding (reserved for #24), representation (dock tab). Those carry through the
// `seed` argument, not the URL.
//
// Pure — NO @/db, NO next, NO React. Operates on URLSearchParams + strings only.

import { isLayerId } from "./layers";
import { getPreset } from "./presets";
import type { LayerId } from "./types";
import {
  type AnalyticsPeriodPreset,
  DEFAULT_VIEW_STATE,
  type PanoramaViewState,
  type ViewCamera,
  type ViewPeriod,
  type ViewScope,
  type ViewStateSeed,
  makeViewState,
} from "./view-state";

// Current URL param names (verified against the working tree — see the inventory).
const PARAM = {
  province: "province",
  locality: "locality",
  period: "period",
  from: "from",
  to: "to",
  asOf: "asOf",
  layers: "layers",
  verified: "verified",
  preset: "preset",
  z: "z",
  lat: "lat",
  lng: "lng",
} as const;

const PERIOD_PRESETS: ReadonlySet<string> = new Set<AnalyticsPeriodPreset>([
  "7d",
  "30d",
  "90d",
  "ytd",
  "trailing12m",
  "3y",
  "5y",
]);

// ---------------------------------------------------------------------------
// Serialize: ViewState → URLSearchParams
// ---------------------------------------------------------------------------

/**
 * Serialize a ViewState to URL search params, emitting ONLY the params that
 * differ from a bare national default — so an unchanged view yields the same
 * minimal URL the console emits today (no gratuitous `?verified=0` noise). The
 * ephemeral fields (basis/encoding/representation) are never emitted.
 */
export function viewStateToParams(view: PanoramaViewState): URLSearchParams {
  const p = new URLSearchParams();

  // scope → province / locality
  if (view.scope.kind === "province") {
    p.set(PARAM.province, view.scope.province);
  } else if (view.scope.kind === "locality") {
    p.set(PARAM.province, view.scope.province);
    p.set(PARAM.locality, view.scope.locality);
  }

  // period → period preset OR period=custom + from + to
  if (view.period.kind === "preset") {
    p.set(PARAM.period, view.period.preset);
  } else {
    p.set(PARAM.period, "custom");
    p.set(PARAM.from, view.period.from);
    p.set(PARAM.to, view.period.to);
  }

  // asOf (scrub cut) — absent = live
  if (view.asOf !== null) p.set(PARAM.asOf, view.asOf);

  // layers — comma-joined, activation order
  if (view.layers.length > 0) p.set(PARAM.layers, view.layers.join(","));

  // verified filter — only when on
  if (view.verifiedOnly) p.set(PARAM.verified, "1");

  // preset — only when a preset is active
  if (view.preset !== null) p.set(PARAM.preset, view.preset);

  // camera frame — z / lat / lng
  if (view.camera !== null) {
    p.set(PARAM.z, String(view.camera.zoom));
    p.set(PARAM.lat, String(view.camera.lat));
    p.set(PARAM.lng, String(view.camera.lng));
  }

  return p;
}

// ---------------------------------------------------------------------------
// Deserialize: URLSearchParams → ViewState
// ---------------------------------------------------------------------------

/**
 * Parse URL search params into a ViewState, layering over `seed` (which supplies
 * the ephemeral fields + any first-visit/role defaults) and then the neutral
 * DEFAULT_VIEW_STATE. Unknown / malformed params fall back silently — a crafted
 * URL never throws and never widens data scope (scope narrowing is still enforced
 * server-side; this is presentation only).
 *
 * Accepts a `URLSearchParams` or a plain record (the shape Next server pages
 * receive as `searchParams`), so both the browser and SSR call one function.
 */
export function viewStateFromParams(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
  seed: ViewStateSeed = {},
): PanoramaViewState {
  const get = toGetter(input);

  const scope = parseScope(get);
  const period = parsePeriod(get);
  const asOf = get(PARAM.asOf) ?? null;
  const layers = parseLayers(get(PARAM.layers));
  const verifiedOnly = get(PARAM.verified) === "1";
  const preset = parsePreset(get(PARAM.preset));
  const camera = parseCamera(get);

  // Build from defaults ← seed (ephemerals + role defaults) ← URL (serialized).
  const base = makeViewState(seed);
  return {
    ...base,
    scope,
    period,
    asOf,
    layers,
    verifiedOnly,
    // preset: a URL preset wins; else the seed's preset (first-visit default).
    preset: preset ?? base.preset,
    camera: camera ?? base.camera,
  };
}

// ---------------------------------------------------------------------------
// Field parsers
// ---------------------------------------------------------------------------

type Getter = (key: string) => string | undefined;

function toGetter(input: URLSearchParams | Record<string, string | string[] | undefined>): Getter {
  if (input instanceof URLSearchParams) {
    return (k) => input.get(k) ?? undefined;
  }
  return (k) => {
    const v = input[k];
    return Array.isArray(v) ? v[0] : v;
  };
}

function parseScope(get: Getter): ViewScope {
  const province = get(PARAM.province);
  const locality = get(PARAM.locality);
  if (province && locality) return { kind: "locality", province, locality };
  if (province) return { kind: "province", province };
  return { kind: "national" };
}

function parsePeriod(get: Getter): ViewPeriod {
  const period = get(PARAM.period);
  if (period === "custom") {
    const from = get(PARAM.from);
    const to = get(PARAM.to);
    if (from && to) return { kind: "custom", from, to };
    return DEFAULT_VIEW_STATE.period; // partial custom → default
  }
  if (period && PERIOD_PRESETS.has(period)) {
    return { kind: "preset", preset: period as AnalyticsPeriodPreset };
  }
  return DEFAULT_VIEW_STATE.period;
}

function parseLayers(raw: string | undefined): LayerId[] {
  if (!raw) return [];
  const seen = new Set<LayerId>();
  const out: LayerId[] = [];
  for (const token of raw.split(",")) {
    const t = token.trim();
    if (isLayerId(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function parsePreset(raw: string | undefined): PanoramaViewState["preset"] {
  if (!raw) return null;
  return getPreset(raw as never) ? (raw as PanoramaViewState["preset"]) : null;
}

function parseCamera(get: Getter): ViewCamera | null {
  const zoom = toFinite(get(PARAM.z));
  const lat = toFinite(get(PARAM.lat));
  const lng = toFinite(get(PARAM.lng));
  if (zoom === null || lat === null || lng === null) return null;
  return { zoom, lat, lng };
}

function toFinite(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
