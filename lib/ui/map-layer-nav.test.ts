// Tests for lib/ui/map-layer-nav.ts — mirrors lib/ui/sheet-nav.test.ts's
// approach for pushTabUrl/replaceTabUrl: `window` is stubbed manually so
// this stays a fast, focused unit test of the raw History-API calls
// (pushState vs replaceState), independent of any jsdom/RTL rendering.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isSameRouteUrl, pushMapStateUrl, replaceMapStateUrl } from "./map-layer-nav";

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

describe("isSameRouteUrl — re-exported from sheet-nav.ts, not duplicated", () => {
  it("true for a same-route query-only target", () => {
    expect(isSameRouteUrl("/gob/panorama", "/gob/panorama?layer=perdidas")).toBe(true);
  });

  it("false for a different route", () => {
    expect(isSameRouteUrl("/gob/panorama", "/gob/analytics?layer=perdidas")).toBe(false);
  });
});
