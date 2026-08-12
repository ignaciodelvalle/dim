// Storage URL helpers.
//
// pet-photos is a public bucket — we build URLs deterministically without
// round-tripping the Supabase client. event-attachments and welfare-evidence are
// private — we generate short-lived signed URLs server-side at render time, as
// service role (migration 0164 for welfare-evidence, 0172 for event-attachments).
// No signer in this module takes a caller client: an authenticated-role SELECT
// on a private bucket is an enumeration grant, not an access check.

// The service-role client is imported dynamically: lib/supabase/admin.ts is
// `server-only`, and this module also exports petPhotoUrl/orgLogoUrl, which
// client components import. The promise is memoised so N concurrent signers
// share ONE module load instead of racing N dynamic imports.
let adminModule: Promise<typeof import("@/lib/supabase/admin")> | null = null;
function loadAdmin(): Promise<typeof import("@/lib/supabase/admin")> {
  adminModule ??= import("@/lib/supabase/admin");
  return adminModule;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const EVENT_ATTACHMENT_URL_TTL_SECONDS = 3600;
const WELFARE_ATTACHMENT_URL_TTL_SECONDS = 3600;

export function petPhotoUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/pet-photos/${storagePath}`;
}

// org-logos bucket — public read, like pet-photos. Used by the refugio
// public profile (handoff P2-2).
export function orgLogoUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/org-logos/${storagePath}`;
}

/**
 * Sign an event-attachment object.
 *
 * Takes NO caller client on purpose (migration 0172, same reasoning as
 * welfareAttachmentSignedUrl below). `event_attachments_authenticated_read` was
 * `using (bucket_id = 'event-attachments')` — the bucket name and nothing else,
 * so it was TRUE for every object. That made
 * POST /storage/v1/object/list/event-attachments an enumeration of every pet's
 * vaccine cards, vet receipts and note photos in the country, readable by any
 * signed-up account. The 2026-07-04 scope review logged this as LOW on the
 * grounds that "discovery is gated by the app" — the list endpoint is gated by
 * the policy, not by the app, so that triage was wrong.
 *
 * The INSERT/UPDATE/DELETE policies stay: uploads keep running as the caller
 * (an INSERT-only grant cannot enumerate, and update/delete are `auth.uid() =
 * owner`). Only the read side moves to service role, because only the read side
 * was the enumeration surface.
 *
 * Callers must authorize first — they already do: every call site is an owner
 * page behind requirePetAccess or the pet-scoped timeline signer.
 */
export async function eventAttachmentSignedUrl(
  storagePath: string,
  expiresIn: number = EVENT_ATTACHMENT_URL_TTL_SECONDS,
): Promise<string | null> {
  try {
    const { createAdminClient } = await loadAdmin();
    const { data, error } = await createAdminClient()
      .storage.from("event-attachments")
      .createSignedUrl(storagePath, expiresIn);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Sign a welfare-evidence object.
 *
 * Takes NO caller client on purpose (RA-8 R2, migration 0164). The
 * `welfare-evidence` bucket has no anon/authenticated storage policy: the
 * previous one gated SELECT on "some welfare_reports row owns this path
 * prefix", which names no caller, so the RLS-filtered list endpoint let anyone
 * enumerate and download every cruelty-complaint evidence file in the country.
 * RLS cannot express the actual rule — "this anonymous reporter holds the
 * receipt code" — so signing runs as service role and the AUTHORIZATION LIVES
 * IN THE CALLER, which is where it already was: every call site is a server
 * component or action that has verified a receipt code, reporter identity,
 * jurisdiction fence, or admin role before asking for a URL.
 *
 * Consequence for new call sites: calling this function is equivalent to
 * handing out the file. Do not call it from a path that has not first decided
 * the viewer may see this report.
 *
 * Returns null on any failure (missing object, unconfigured service-role key),
 * matching the previous degradation — the UI renders "(no disponible)".
 */
export async function welfareAttachmentSignedUrl(
  storagePath: string,
  expiresIn: number = WELFARE_ATTACHMENT_URL_TTL_SECONDS,
): Promise<string | null> {
  try {
    const { createAdminClient } = await loadAdmin();
    const { data, error } = await createAdminClient()
      .storage.from("welfare-evidence")
      .createSignedUrl(storagePath, expiresIn);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Batch-sign multiple event-attachment paths in a single Storage round-trip.
 * Returns a Map<storagePath, signedUrl> for each path that signed successfully.
 * Paths that fail (missing, permission error) are omitted from the map.
 */
export async function eventAttachmentSignedUrls(
  storagePaths: string[],
  expiresIn: number = EVENT_ATTACHMENT_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  if (storagePaths.length === 0) return new Map();
  const result = new Map<string, string>();
  try {
    const { createAdminClient } = await loadAdmin();
    const { data, error } = await createAdminClient()
      .storage.from("event-attachments")
      .createSignedUrls(storagePaths, expiresIn);
    if (error || !data) return result;
    for (const item of data) {
      if (item.signedUrl && item.path) {
        result.set(item.path, item.signedUrl);
      }
    }
  } catch {
    return new Map();
  }
  return result;
}
