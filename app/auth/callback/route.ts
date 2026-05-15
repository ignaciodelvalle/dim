// OAuth / email confirmation callback. When a user clicks the magic link in
// their signup confirmation email (or returns from a future OAuth provider),
// they land here. We exchange the one-time `code` for a real session, then
// redirect them onward.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Anything that lands here without a valid code is an error — for now we
  // just bounce to the home page with an error flag. A proper /login page
  // arrives next round and will read this query param.
  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
