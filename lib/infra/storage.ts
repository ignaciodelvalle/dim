// Storage URL helpers.
//
// pet-photos is a public bucket — we build URLs deterministically without
// round-tripping the Supabase client. event-attachments is private — we
// generate short-lived signed URLs server-side at render time.

import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

export async function eventAttachmentSignedUrl(
  supabase: SupabaseServerClient,
  storagePath: string,
  expiresIn: number = EVENT_ATTACHMENT_URL_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("event-attachments")
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
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
    const { createAdminClient } = await import("@/lib/supabase/admin");
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
  supabase: SupabaseServerClient,
  storagePaths: string[],
  expiresIn: number = EVENT_ATTACHMENT_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  if (storagePaths.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from("event-attachments")
    .createSignedUrls(storagePaths, expiresIn);
  if (error || !data) return new Map();
  const result = new Map<string, string>();
  for (const item of data) {
    if (item.signedUrl && item.path) {
      result.set(item.path, item.signedUrl);
    }
  }
  return result;
}
