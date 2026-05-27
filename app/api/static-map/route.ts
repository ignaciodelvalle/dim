// Static map image endpoint.
//
// GET /api/static-map?lat=...&lng=...&zoom=15&w=800&h=450
//
// Used by the refugio public profile LocationPanel (handoff P2-6). The
// caller passes lat/lng; the route fetches OSM tiles + composites the
// marker server-side and streams the PNG. Cache headers let CDNs (and
// the browser) keep the image for a day — orgs don't move often.
//
// No auth: any authenticated or anonymous request can hit this. The
// only inputs are the coordinates themselves, which are public per
// disclose_address gate on the refugio query.

import { NextResponse } from "next/server";

import { renderStaticMapPng } from "@/lib/static-map";

function parseFloatOr(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntOr(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = parseFloatOr(url.searchParams.get("lat"), Number.NaN);
  const lng = parseFloatOr(url.searchParams.get("lng"), Number.NaN);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng query params required" }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "coordinates out of range" }, { status: 400 });
  }

  const zoom = parseIntOr(url.searchParams.get("zoom"), 15, 1, 19);
  const width = parseIntOr(url.searchParams.get("w"), 800, 100, 2048);
  const height = parseIntOr(url.searchParams.get("h"), 450, 100, 2048);

  try {
    const png = await renderStaticMapPng({ lat, lng, zoom, width, height });
    // NextResponse wants a BodyInit; convert Buffer to a Uint8Array.
    const body = new Uint8Array(png);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // 1-day cache — refugios don't move often. Stale-while-revalidate
        // lets the CDN serve the old tile while we regenerate.
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    console.error("[static-map] render failed:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "render_failed" }, { status: 502 });
  }
}
