// @vitest-environment jsdom
//
// Tests for components/panorama/use-asof-frame.ts — the temporal FRAME pipeline.
//
// The failure path is what matters here and is the reason this file exists: the
// stale-frame notice is error UI that a healthy local environment never shows,
// so without a forced 429 it would ship unexercised. (The traffic fix in the
// same change dropped playback from ~274 to ~58 req/min, which removed the very
// condition that used to trigger it by accident.)
//
// Same idiom as lib/ui/use-layer-features.test.ts: renderHook against a stubbed
// global fetch.

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAsOfFrame } from "@/components/panorama/use-asof-frame";
import type { FeatureCollection, LayerId } from "@/src/modules/panorama/domain/types";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const ISO = "2026-07-01T00:00:00.000Z";

function setup(fetchImpl: typeof fetch, onFrameSettled = () => {}) {
  vi.stubGlobal("fetch", fetchImpl);
  const asOfData = new Map<LayerId, FeatureCollection>();
  const result = renderHook(() =>
    useAsOfFrame({
      asOfIso: ISO,
      baseQs: "period=90d",
      timeBasis: "valid",
      level: "province",
      // zoonosis is a temporal layer; cobertura is a current-state rollup and
      // must be filtered out by the hook, not requested.
      activeLayerIds: () => ["zoonosis", "cobertura"] as LayerId[],
      asOfData,
      signalFor: () => new AbortController().signal,
      dropCubeStamp: () => {},
      onFrameSettled,
    }),
  );
  return { result, asOfData };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAsOfFrame", () => {
  it("requests only the TEMPORAL layers, once each, at the given instant", async () => {
    const calls: string[] = [];
    const { asOfData } = setup(async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ features: EMPTY }), { status: 200 });
    });

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/api/panorama/zoonosis");
    expect(calls[0]).toContain(`asOf=${encodeURIComponent(ISO)}`);
    // cobertura is a current-state rollup — asking for it as-of would be a lie.
    expect(calls.join(" ")).not.toContain("/api/panorama/cobertura");
    await waitFor(() => expect(asOfData.has("zoonosis" as LayerId)).toBe(true));
  });

  it("reports a rate-limited frame instead of silently keeping stale features", async () => {
    const { result, asOfData } = setup(async () => new Response("", { status: 429 }));

    await waitFor(() => expect(result.result.current).not.toBeNull());
    expect(result.result.current?.rateLimited).toBe(true);
    expect(result.result.current?.layers.length).toBe(1);
    // The cache is deliberately NOT cleared — a blank map is worse than a stale
    // one. The honesty comes from the report, not from wiping the frame.
    expect(asOfData.has("zoonosis" as LayerId)).toBe(false);
  });

  it("reports a failed frame that is not a rate limit", async () => {
    const { result } = setup(async () => new Response("", { status: 500 }));

    await waitFor(() => expect(result.result.current).not.toBeNull());
    expect(result.result.current?.rateLimited).toBe(false);
  });

  it("settles the frame even when every layer fails, so the map still repaints", async () => {
    const settled = vi.fn();
    setup(async () => new Response("", { status: 500 }), settled);
    await waitFor(() => expect(settled).toHaveBeenCalled());
  });

  it("reports nothing when the frame lands cleanly", async () => {
    const { result } = setup(
      async () => new Response(JSON.stringify({ features: EMPTY }), { status: 200 }),
    );
    await waitFor(() => expect(result.result.current).toBeNull());
  });
});
