// Use-case: logScan — record a credential_scanned event (strangler migration 58/61).
//
// Records a credential_scanned event whenever the public credential page is
// viewed. Called from a tiny client component on the page (via useEffect) so
// the page render itself stays a pure read.
//
// SCAN-LOCATION PRIVACY CONTRACT (Task #45, PO decision obs #733 — see also
// AGENTS.md §Privacidad → Scan events and lib/events/event-schemas.ts):
//   - Every scanner-role scan carries `scan_ip_area`: a coarse, city-precision
//     area derived from platform geo headers (lib/infra/scan-geo.ts). The raw
//     IP is never read into the payload. Explicit null off-Vercel.
//   - Scanner-role rows are HARD-ANONYMIZED: recorded_by_user_id is always
//     NULL, even for authenticated non-owner viewers. Read paths that resolve
//     recorded_by_user_id → display name (e.g. the gov welfare timeline in
//     lib/analytics/govt-dashboards.ts) must never be able to identify a
//     scanner. `viewer_authenticated` keeps the boolean signal without the link.
//   - Precise GPS (`scan_coords` + `scan_accuracy_m`) is stored ONLY when the
//     pet is currently lost AND the caller passed coords, which the client
//     collects exclusively through an explicit browser-geolocation grant with
//     visible consent copy (ScanLogger.tsx). The lost check happens HERE so a
//     forged client call cannot attach coords to a non-lost pet.
//   - Self-scans (owner viewing their own pet) keep recorded_by_user_id (it is
//     the owner's own history) but carry NO location fields: owner-role rows
//     are exempt from the 90-day purge, and indefinitely-retained location
//     linked to an identity is exactly what this contract forbids.
//   - Retention: location fields live only on author_role='scanner' rows,
//     which lib/infra/scan-retention.ts purges wholesale after 90 days.

import { headers } from "next/headers";

import { db, ownerships, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { ipAreaFromHeaders } from "@/lib/infra/scan-geo";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";

/** GPS fix passed by the client after an explicit geolocation grant. */
export type ScanCoords = {
  lat: number;
  lng: number;
  /** GeolocationCoordinates.accuracy, meters. */
  accuracyM?: number;
};

/**
 * Server-side coords validation — never trust the client. Returns null (drop
 * coords, still log the scan) on any out-of-range or non-finite value.
 */
function sanitizeCoords(
  coords: ScanCoords | undefined,
): { lat: number; lng: number; accuracyM: number | null } | null {
  if (!coords) return null;
  const { lat, lng, accuracyM } = coords;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  const accuracy =
    typeof accuracyM === "number" && Number.isFinite(accuracyM) && accuracyM >= 0
      ? Math.min(Math.round(accuracyM), 1_000_000)
      : null;
  return { lat, lng, accuracyM: accuracy };
}

export async function logScan(publicToken: string, opts?: { coords?: ScanCoords }): Promise<void> {
  if (!publicToken) return;

  const [pet] = await db
    .select({ id: pets.id, status: pets.status })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Is the viewer the pet's current owner? Used to flag self-scans so the UI
  // can hide them from the default timeline.
  let isSelfScan = false;
  if (user) {
    const [ownership] = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, pet.id),
          eq(ownerships.ownerUserId, user.id),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    isSelfScan = !!ownership;
  }

  const payload: Record<string, unknown> = {
    is_self_scan: isSelfScan,
    viewer_authenticated: !!user,
  };

  if (!isSelfScan) {
    // Guaranteed floor: coarse IP-area on every external scan (null when the
    // platform geo headers are absent, e.g. local dev). Never the raw IP.
    payload.scan_ip_area = ipAreaFromHeaders(await headers());

    // Precise GPS only for lost pets, and only when the client passed coords
    // after an explicit geolocation grant. Server-enforced lost check.
    if (pet.status === "lost") {
      const coords = sanitizeCoords(opts?.coords);
      if (coords) {
        payload.scan_coords = { lat: coords.lat, lng: coords.lng };
        if (coords.accuracyM !== null) payload.scan_accuracy_m = coords.accuracyM;
      }
    }
  }

  const now = new Date();
  const eventPayload = validateEventPayload("credential_scanned", payload);
  await db.insert(petEvents).values({
    petId: pet.id,
    eventType: "credential_scanned",
    occurredAt: now,
    recordedAt: now,
    // Scanner-role rows are hard-anonymized: no user id, no identity link.
    // Self-scans keep the owner's id — it is the owner's own history.
    recordedByUserId: isSelfScan ? (user?.id ?? null) : null,
    authorRole: isSelfScan ? "owner" : "scanner",
    payload: eventPayload,
  });
}
