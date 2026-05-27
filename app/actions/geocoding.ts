"use server";

// Server action wrappers around lib/geocoding.ts.
//
// Two pairs of actions:
//   - geocodeAddressAction / reverseGeocodeAction       — auth-gated. Used by
//     logged-in flows.
//   - geocodeAddressPublicAction / reverseGeocodePublicAction — NO auth, IP
//     rate-limited. Used by anonymous public flows (PetSightingForm,
//     DenunciaWizard) where the user has no session by definition. The
//     critique-direcciones-2026-05-27 marks this as the pre-requisite for the
//     unified-location refactor: anonymous typing must not redirect to /login.
//
// Pure logic (Nominatim fetch + parser + per-instance token bucket) lives in
// lib/geocoding.ts.

import { headers } from "next/headers";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import {
  type GeocodeBias,
  type GeocodeResult,
  type ReverseGeocodeResult,
  geocodeAddress,
  reverseGeocode,
} from "@/lib/geocoding";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";

export type { GeocodeBias, GeocodeResult, ReverseGeocodeResult };

// ---------------------------------------------------------------------------
// Authed variants
// ---------------------------------------------------------------------------

export async function geocodeAddressAction(
  query: string,
  bias?: GeocodeBias,
): Promise<GeocodeResult[]> {
  await requireUserOrRedirect();
  return geocodeAddress(query, bias);
}

export async function reverseGeocodeAction(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  await requireUserOrRedirect();
  return reverseGeocode(lat, lng);
}

// ---------------------------------------------------------------------------
// Anonymous variants — IP rate-limited
// ---------------------------------------------------------------------------
//
// Limits picked to comfortably support real interactive use (autocomplete is
// 600ms-debounced client-side; a typical sighting flow does <10 lookups) while
// rejecting abuse:
//
//   60 requests per minute per IP — covers bursty typing
//   400 requests per hour per IP  — caps sustained automated abuse
//
// Both the persistent bucket AND the per-instance token bucket in
// lib/geocoding.ts protect Nominatim quota: the token bucket caps RPS across
// every caller in the worker, the persistent bucket caps each IP across all
// workers / cold starts.

const PUBLIC_GEOCODING_LIMIT = { maxPerMinute: 60, maxPerHour: 400 } as const;

async function callerIpAddress(): Promise<string> {
  const reqHeaders = await headers();
  const forwardedFor = reqHeaders.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return reqHeaders.get("x-real-ip") ?? "unknown";
}

// @no-auth-required: anonymous geocoding autocomplete on public surfaces
// (PetSightingForm, DenunciaWizard). IP rate-limited via enforceRateLimit;
// the pure helper at lib/geocoding.ts never logs the query string (spec D10).
export async function geocodeAddressPublicAction(
  query: string,
  bias?: GeocodeBias,
): Promise<GeocodeResult[]> {
  const ip = await callerIpAddress();
  try {
    await enforceRateLimit("geocode_public", ip, PUBLIC_GEOCODING_LIMIT);
  } catch (err) {
    if (err instanceof RateLimitError) return [];
    throw err;
  }
  return geocodeAddress(query, bias);
}

// @no-auth-required: anonymous reverse-geocoding on public surfaces. Returns
// null on rate-limit so the caller falls back to plain lat/lng without errors.
export async function reverseGeocodePublicAction(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  const ip = await callerIpAddress();
  try {
    await enforceRateLimit("geocode_public", ip, PUBLIC_GEOCODING_LIMIT);
  } catch (err) {
    if (err instanceof RateLimitError) return null;
    throw err;
  }
  return reverseGeocode(lat, lng);
}
