// Location normalization gate — P2 of the location domain epic.
//
// normalizeLocationForWrite is the single write gate for all server actions
// that persist a LocationValue. It consolidates the scattered per-site calls to
// canonicalProvinceNameForStorage / resolveCanonicalJurisdiction /
// tryResolveCanonicalJurisdiction behind a single entry point whose opts
// preserve the SAME effective behavior each site had before P2.
//
// Design contract:
//  - "strict"  → resolveCanonicalJurisdiction (throws JurisdictionValidationError)
//  - "soft"    → tryResolveCanonicalJurisdiction (pass-through on miss)
//  - "none"    → canonicalProvinceNameForStorage only; raw locality passed through
//  - requireCoords: true → reject when lat/lng are absent or out-of-range.
//    Only pass for sites that already required coords before P2.
//  - coord range check (lat -90..90 / lng -180..180) is run whenever coords
//    are present, regardless of locality mode. This is the deliberate P2
//    hardening: previously only sighting/finder enforced range; now setPetLost
//    also does (see STEP 3 in the P2 spec).
//
// SAFETY NET: every option combination maps to what the caller already did.
// No new hard rejections are introduced unless the caller passes requireCoords.

import { canonicalProvinceNameForStorage } from "@/lib/domain/jurisdiction-canonical";
import type { LocationValue } from "@/lib/domain/location-value";
import {
  JurisdictionValidationError,
  resolveCanonicalJurisdiction,
  tryResolveCanonicalJurisdiction,
} from "@/lib/infra/jurisdiction-validation";

export type LocalityValidation = "strict" | "soft" | "none";

export type NormalizeOpts = {
  /**
   * Controls locality validation:
   * - "strict": resolveCanonicalJurisdiction — throws on unknown locality.
   * - "soft":   tryResolveCanonicalJurisdiction — passes raw text on miss.
   * - "none":   no locality lookup; raw locality is passed through as-is.
   *
   * Defaults to "none".
   */
  locality?: LocalityValidation;
  /**
   * When true, coords must be present AND in range.
   * Use only for sites that already rejected missing coords before P2.
   */
  requireCoords?: boolean;
};

export type NormalizedLocation = {
  /** Canonical display name for storage (e.g. "Buenos Aires", "CABA"). */
  province: string | null;
  /** Canonical locality name, raw locality, or null depending on opts. */
  locality: string | null;
  /**
   * true when the locality resolved against the INDEC catalog.
   * Always true for "strict" (throws on miss), true/false for "soft",
   * always false for "none".
   */
  localityCanonical: boolean;
  /**
   * ar_localities uuid PK when the locality resolved, else null. This is the
   * structural locality-attribution FK value (migration 0147) — write sites set
   * their pets/welfare/cases.localityId column from it. Null under "none" mode,
   * on a passthrough (province or locality absent), and on a "soft" miss.
   */
  localityId: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
};

/**
 * Coordinate range errors thrown by normalizeLocationForWrite when
 * requireCoords is true or when present coords are out of range.
 */
export class CoordError extends Error {
  readonly code: "COORD_REQUIRED" | "COORD_OUT_OF_RANGE";
  constructor(code: "COORD_REQUIRED" | "COORD_OUT_OF_RANGE", message: string) {
    super(message);
    this.name = "CoordError";
    this.code = code;
  }
}

/**
 * Single write gate for persisting location data from a {@link LocationValue}.
 *
 * @throws {JurisdictionValidationError} when locality="strict" and the
 *   (province, locality) pair is not in the INDEC catalog.
 * @throws {CoordError} when requireCoords=true and coords are absent, or when
 *   any present coords are outside WGS-84 range.
 */
export async function normalizeLocationForWrite(
  loc: LocationValue,
  opts: NormalizeOpts = {},
): Promise<NormalizedLocation> {
  const { locality: localityMode = "none", requireCoords = false } = opts;

  // ── 1. Province canonicalization ──────────────────────────────────────────
  // Handles ISO code (e.g. "AR-C"), display name, and aliases.
  // Returns null when the input is empty or unresolvable.
  const province = canonicalProvinceNameForStorage(loc.provinceCode ?? loc.province ?? "");

  // ── 2. Coord validation ───────────────────────────────────────────────────
  const lat = loc.lat;
  const lng = loc.lng;

  if (requireCoords) {
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new CoordError("COORD_REQUIRED", "Coordenadas requeridas pero ausentes o inválidas.");
    }
  }

  if (lat !== null && lng !== null) {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new CoordError("COORD_OUT_OF_RANGE", "La ubicación está fuera de rango.");
    }
  }

  // ── 3. Locality resolution ────────────────────────────────────────────────
  const rawLocality = loc.locality ?? "";

  if (localityMode === "strict") {
    if (province && rawLocality) {
      // Throws JurisdictionValidationError on unknown (province, locality).
      // Callers catch and map to their action error shape — same as before P2.
      const canonical = await resolveCanonicalJurisdiction({
        rawProvince: province,
        rawLocality,
      });
      return {
        province: canonical.province.name,
        locality: canonical.locality.localityName,
        localityCanonical: true,
        localityId: canonical.locality.id,
        lat,
        lng,
        address: loc.address,
      };
    }
    // Province or locality absent — pass through without strict validation.
    return {
      province,
      locality: rawLocality || null,
      localityCanonical: false,
      localityId: null,
      lat,
      lng,
      address: loc.address,
    };
  }

  if (localityMode === "soft") {
    if (province && rawLocality) {
      const resolved = await tryResolveCanonicalJurisdiction({
        rawProvince: province,
        rawLocality,
      });
      return {
        province: resolved.province || province,
        locality: resolved.locality || rawLocality || null,
        localityCanonical: resolved.canonical,
        localityId: resolved.localityId,
        lat,
        lng,
        address: loc.address,
      };
    }
    return {
      province,
      locality: rawLocality || null,
      localityCanonical: false,
      localityId: null,
      lat,
      lng,
      address: loc.address,
    };
  }

  // "none": province canonicalization only; raw locality passed through.
  return {
    province,
    locality: rawLocality || null,
    localityCanonical: false,
    localityId: null,
    lat,
    lng,
    address: loc.address,
  };
}

// Re-export for callers that need the error type without a separate import.
export { JurisdictionValidationError };
