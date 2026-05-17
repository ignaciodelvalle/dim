import "server-only";

import { createClient as createSdkClient } from "@supabase/supabase-js";

// Service-role admin client — bypasses Row Level Security.
// ONLY import this module from app/actions/admin-institutional.ts.
// The service-role key must NEVER appear in logs, error messages, or bundles.
//
// Module-level cache is safe here because the service-role client has no
// per-request session state (unlike the cookie-bound server.ts client).

let cached: ReturnType<typeof createSdkClient> | null = null;

export function createAdminClient(): ReturnType<typeof createSdkClient> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin client not configured: missing env vars.");
  }

  cached = createSdkClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cached;
}
