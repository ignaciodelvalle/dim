// Session refresh helper for middleware. On every request this:
//   1. Reads the current auth cookies,
//   2. Asks Supabase to verify/refresh the session,
//   3. Writes any updated cookies back onto the response.
// Without this, sessions silently expire and users get bounced back to login.

import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() forces a server-side validation of the session token.
  // Do not skip this — it's what keeps sessions fresh across page loads.
  await supabase.auth.getUser();

  return supabaseResponse;
}
