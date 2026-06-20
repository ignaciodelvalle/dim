// Pure server-side proxy to Nominatim/OSM for forward and reverse geocoding.
//
// This module holds the testable core: rate limiter + fetch + parser. The
// "use server" boundary (auth gating) lives in app/actions/geocoding.ts,
// which delegates here. Mirrors the writer/wrapper pattern from booking.ts.
//
// CRITICAL (spec D10): never log user-supplied query strings. Log only error
// type and rate-limit hits.
//
// Bias strategy: we DO NOT append the pet's jurisdiction to the q= string.
// That was the v1 approach and it actively broke common queries —
// "Florida y Lavalle, CABA, Ciudad Autónoma de Buenos Aires" is parsed by
// Nominatim as a strict address chain and returns zero results. Instead we
// pass viewbox+bounded=0 when the pet's province has a known bbox (see
// lib/ar-viewboxes.ts). bounded=0 is a soft priority, not a hard filter, so
// addresses outside the box (cross-jurisdiction incidents) still resolve.

import { provinceViewbox } from "@/lib/ar-viewboxes";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "DIM/1.0 (https://dim.ar; contact: ignaciodelvalle2014@gmail.com)";
const RATE_LIMIT_PER_SECOND = 5;
const REQUEST_TIMEOUT_MS = 8000;

export type GeocodeResult = {
  lat: number;
  lng: number;
  display_name: string;
  province: string | null;
  locality: string | null;
};

export type ReverseGeocodeResult = {
  display_name: string;
  province: string | null;
  locality: string | null;
};

export type GeocodeBias = {
  province?: string | null;
  locality?: string | null;
};

// Token bucket — per-instance module state. In serverless, that's per warm
// instance. With debounced clients + Nominatim's 1 req/sec sustained policy,
// 5 tokens/sec is comfortable headroom.
let bucketTokens = RATE_LIMIT_PER_SECOND;
let bucketLastRefill = Date.now();

function consumeToken(): boolean {
  const now = Date.now();
  const elapsedSec = (now - bucketLastRefill) / 1000;
  bucketTokens = Math.min(RATE_LIMIT_PER_SECOND, bucketTokens + elapsedSec * RATE_LIMIT_PER_SECOND);
  bucketLastRefill = now;
  if (bucketTokens >= 1) {
    bucketTokens -= 1;
    return true;
  }
  return false;
}

// Test-only: reset bucket state between tests so they don't bleed into each other.
// Not part of the public surface; importers in production code must not call this.
export function __resetRateLimitForTests(): void {
  bucketTokens = RATE_LIMIT_PER_SECOND;
  bucketLastRefill = Date.now();
}

function pickLocality(address: Record<string, string | undefined> | undefined): string | null {
  if (!address) return null;
  // CABA special case: OSM returns the city-level name ("Buenos Aires") in
  // `address.city` for every point inside CABA, but the INDEC catalog holds CABA
  // as its 48 *barrios* (Palermo, Caballito, …), not "Buenos Aires". Prefer the
  // barrio (`suburb` / `city_district`) so the locality matches the catalog
  // instead of failing canonical validation on the denuncia/lost forms.
  const state = address.state ?? "";
  if (/ciudad aut[oó]noma de buenos aires|^\s*caba\s*$/i.test(state)) {
    return (
      address.suburb ??
      address.city_district ??
      address.city ??
      address.town ??
      address.village ??
      address.hamlet ??
      null
    );
  }
  return (
    address.city ?? address.town ?? address.suburb ?? address.village ?? address.hamlet ?? null
  );
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeAddress(query: string, bias?: GeocodeBias): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  if (!consumeToken()) {
    console.warn("[geocoding] rate limit hit (forward)");
    throw new Error("rate_limited");
  }

  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set("accept-language", "es");

  // Soft priority bias by province bbox when known. bounded=0 means the box
  // is a hint — Nominatim still returns results outside it (lower-ranked).
  const viewbox = provinceViewbox(bias?.province ?? null);
  if (viewbox) {
    url.searchParams.set("viewbox", viewbox.join(","));
    url.searchParams.set("bounded", "0");
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(url.toString());
  } catch (err) {
    console.error(
      "[geocoding] fetch failed (forward):",
      err instanceof Error ? err.name : "unknown",
    );
    throw new Error("fetch_failed");
  }

  if (!response.ok) {
    console.error("[geocoding] non-2xx (forward):", response.status);
    throw new Error("provider_error");
  }

  const raw = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: Record<string, string | undefined>;
  }>;

  return raw
    .map((r) => ({
      lat: Number.parseFloat(r.lat),
      lng: Number.parseFloat(r.lon),
      display_name: r.display_name,
      province: r.address?.state ?? null,
      locality: pickLocality(r.address),
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  if (!consumeToken()) {
    console.warn("[geocoding] rate limit hit (reverse)");
    return null;
  }

  const url = new URL(`${NOMINATIM_BASE}/reverse`);
  url.searchParams.set("lat", lat.toFixed(7));
  url.searchParams.set("lon", lng.toFixed(7));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "es");

  let response: Response;
  try {
    response = await fetchWithTimeout(url.toString());
  } catch (err) {
    console.error(
      "[geocoding] fetch failed (reverse):",
      err instanceof Error ? err.name : "unknown",
    );
    return null;
  }

  if (!response.ok) {
    if (response.status === 404) return null;
    console.error("[geocoding] non-2xx (reverse):", response.status);
    return null;
  }

  const raw = (await response.json()) as {
    display_name?: string;
    address?: Record<string, string | undefined>;
  };

  if (!raw.display_name) return null;

  return {
    display_name: raw.display_name,
    province: raw.address?.state ?? null,
    locality: pickLocality(raw.address),
  };
}
