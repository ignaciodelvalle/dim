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

export async function welfareAttachmentSignedUrl(
  supabase: SupabaseServerClient,
  storagePath: string,
  expiresIn: number = WELFARE_ATTACHMENT_URL_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("welfare-evidence")
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
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
