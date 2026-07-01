// OAuth / email confirmation callback. When a user clicks the magic link in
// their signup confirmation email (or returns from a future OAuth provider),
// they land here. We exchange the one-time `code` for a real session, then
// redirect them onward.
//
// Landing resolution (UX 0.5 fix):
//   - Explicit ?next=<path>  → honor it unchanged (deep-link preservation).
//   - No ?next= (or bare "/") → resolveUserLanding picks the best default:
//       owner with exactly 1 org → /org/<token>
//       owner with 0 or >1 orgs → /inicio
//       vet/govt/admin          → their role home (via resolveUserLanding)

import { resolveUserLanding } from "@/lib/infra/role-landing";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Honor an explicit deep-link (e.g. from an invite flow). A bare "/"
      // is treated the same as absent — both trigger org-aware resolution.
      const hasExplicitNext = nextParam && nextParam !== "/";
      const landing = hasExplicitNext ? nextParam : await resolveUserLanding(data.user.id);

      return NextResponse.redirect(`${origin}${landing}`);
    }
  }

  // Anything that lands here without a valid code is an error — for now we
  // just bounce to the home page with an error flag. A proper /login page
  // arrives next round and will read this query param.
  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
