"use server";

// Server action wrappers around lib/geocoding.ts.
//
// Pattern mirrors booking.ts: pure logic lives in lib/, the action layer adds
// auth gating. Auth is required so anonymous traffic can't abuse our
// Nominatim quota.

import { requireUserOrRedirect } from "@/lib/auth-guards";
import {
  type GeocodeBias,
  type GeocodeResult,
  type ReverseGeocodeResult,
  geocodeAddress,
  reverseGeocode,
} from "@/lib/geocoding";

export type { GeocodeBias, GeocodeResult, ReverseGeocodeResult };

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
