// Tests for lib/ui/map-layer-nav.ts — mirrors lib/ui/sheet-nav.test.ts's
// approach for pushTabUrl/replaceTabUrl: `window` is stubbed manually so
// this stays a fast, focused unit test of the raw History-API calls
// (pushState vs replaceState), independent of any jsdom/RTL rendering.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  encodeAsOfToParams,
  encodeCameraToParams,
  isSameRouteUrl,
  parseAsOfFromParams,
  parseCameraFromParams,
  pushMapStateUrl,
  replaceMapStateUrl,
} from "./map-layer-nav";

describe("pushMapStateUrl / replaceMapStateUrl — history-API state machine", () => {
  const pushState = vi.fn();
  const replaceState = vi.fn();

  beforeEach(() => {
    pushState.mockClear();
    replaceState.mockClear();
    vi.stubGlobal("window", {
      history: { pushState, replaceState },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushMapStateUrl calls history.pushState with the given URL, never replaceState", () => {
    pushMapStateUrl("/gob/panorama?layer=perdidas&period=30d");
    expect(pushState).toHaveBeenCalledWith(null, "", "/gob/panorama?layer=perdidas&period=30d");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("replaceMapStateUrl calls history.replaceState with the given URL, never pushState", () => {
    replaceMapStateUrl("/gob/panorama?layer=perdidas&asOf=2026-06-01");
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/gob/panorama?layer=perdidas&asOf=2026-06-01",
    );
    expect(pushState).not.toHaveBeenCalled();
  });

  it("pushMapStateUrl is a no-op when window is undefined (SSR safety)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => pushMapStateUrl("/gob/panorama?layer=perdidas")).not.toThrow();
  });

  it("replaceMapStateUrl is a no-op when window is undefined (SSR safety)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => replaceMapStateUrl("/gob/panorama?layer=perdidas")).not.toThrow();
  });
});

describe("camera encode/decode — 'Copiar vista' round-trip", () => {
  it("round-trips a camera through the URL (rounded, but restorable)", () => {
    const params = new URLSearchParams("layers=perdidas&period=90d");
    encodeCameraToParams(params, { zoom: 6.123456, lng: -63.61672, lat: -40.0004 });
    expect(params.get("z")).toBe("6.12");
    expect(params.get("lng")).toBe("-63.617");
    expect(params.get("lat")).toBe("-40");
    // Untouched params survive.
    expect(params.get("layers")).toBe("perdidas");
    const camera = parseCameraFromParams(params);
    expect(camera).toEqual({ zoom: 6.12, lng: -63.617, lat: -40 });
  });

  it("returns null when any camera component is missing", () => {
    expect(parseCameraFromParams(new URLSearchParams("z=6&lat=-40"))).toBeNull();
    expect(parseCameraFromParams(new URLSearchParams(""))).toBeNull();
  });

  it("returns null for an out-of-range or non-finite coordinate (hand-edited URL)", () => {
    expect(parseCameraFromParams(new URLSearchParams("z=6&lat=999&lng=-63"))).toBeNull();
    expect(parseCameraFromParams(new URLSearchParams("z=x&lat=-40&lng=-63"))).toBeNull();
  });
});

describe("asOf encode/decode — scrub-position round-trip", () => {
  it("encodes a scrub position at day precision and parses it back to UTC midnight", () => {
    const params = new URLSearchParams("layers=perdidas");
    encodeAsOfToParams(params, new Date("2026-06-01T14:37:00.000Z"));
    expect(params.get("asOf")).toBe("2026-06-01");
    const parsed = parseAsOfFromParams(params);
    expect(parsed?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("drops the param at the live edge (null)", () => {
    const params = new URLSearchParams("asOf=2026-06-01");
    encodeAsOfToParams(params, null);
    expect(params.has("asOf")).toBe(false);
    expect(parseAsOfFromParams(params)).toBeNull();
  });

  it("tolerates a full-ISO asOf from an older link", () => {
    const parsed = parseAsOfFromParams(new URLSearchParams("asOf=2026-06-01T09:00:00.000Z"));
    expect(parsed?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("returns null for a malformed asOf", () => {
    expect(parseAsOfFromParams(new URLSearchParams("asOf=ayer"))).toBeNull();
  });
});

describe("isSameRouteUrl — re-exported from sheet-nav.ts, not duplicated", () => {
  it("true for a same-route query-only target", () => {
    expect(isSameRouteUrl("/gob/panorama", "/gob/panorama?layer=perdidas")).toBe(true);
  });

  it("false for a different route", () => {
    expect(isSameRouteUrl("/gob/panorama", "/gob/analytics?layer=perdidas")).toBe(false);
  });
});
