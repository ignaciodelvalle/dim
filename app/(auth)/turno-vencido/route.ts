// Where an operator whose 8-hour shift ran out is sent to actually LEAVE (B9).
//
// WHY A ROUTE HANDLER AND NOT A REDIRECT STRAIGHT TO /iniciar-sesion
// ---------------------------------------------------------------------------
// Because the session is still VALID as far as GoTrue is concerned. The shift is
// our policy, not the token's expiry, so at the moment `requireLiveUser` refuses
// a SHIFT_EXPIRED operator the cookie in their browser still authenticates them
// perfectly well.
//
// `/iniciar-sesion` redirects an already-authenticated visitor onward by role
// (see its `pathForRole` call). So bouncing a shift-expired operator there would
// send them to the login page, which would send them back into the portal, which
// would refuse them again — the exact ERR_TOO_MANY_REDIRECTS shape recorded on
// 2026-07-04 and warned about in lib/infra/auth-guards.ts. A guard that refuses
// without ending the session does not end the session.
//
// It also would not do the job even if it worked. The whole point of B9 is a
// shared municipal desk: leaving a live operator session in the browser and
// merely declining to render is precisely the state the control exists to
// prevent. The shift ending has to mean signed out.
//
// A Route Handler is the only place that can do it: cookies are writable here
// and not during a Server Component render, and `redirect()` inside a Server
// Action resolves and is then dropped by the client router (contract N3, and the
// reason the denuncia logout is a handler too).
//
// WHY GET, AND WHY THAT IS NOT A LOGOUT-ANYONE LINK
// ---------------------------------------------------------------------------
// It has to answer GET: `redirect()` from a page guard issues one, and there is
// no form to POST from mid-render.
//
// A GET that ends sessions is normally a CSRF gift — any cross-site page, or a
// prefetch, can force a victim's logout. This one is safe for a structural
// reason rather than a hopeful one: IT RE-DERIVES THE POLICY ITSELF and signs
// out ONLY a session `requireLiveUser` independently reports as SHIFT_EXPIRED.
// A session inside its shift is redirected home with its cookies untouched. So
// the worst an attacker can force is the logout of a session that our own policy
// has already refused — which is the state this endpoint exists to produce.
//
// That check is not defence-in-depth decoration. It is what makes the URL
// harmless to hand out.

import { redirect } from "next/navigation";

import { requireLiveUser } from "@/lib/infra/live-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// @no-auth-required: this is a LOGOUT destination. Requiring a live session to
// reach it would strand the only caller it is for — an operator whose session
// the liveness guard has just refused. It authorizes nothing and discloses
// nothing: every branch ends in a redirect, and the only side effect is ending
// the caller's OWN session, and only when policy already says it is over.
export async function GET() {
  const live = await requireLiveUser();

  // Not a shift problem — do not touch the session. Covers the prefetch, the
  // cross-site auto-navigation, and the operator who simply typed the URL.
  // MAINTENANCE and the account-state refusals have their own destinations and
  // must not be laundered into "your shift ended".
  if (live.ok || live.reason !== "SHIFT_EXPIRED") {
    redirect("/");
  }

  // Global scope so the shift ends everywhere, not just in this browser. An
  // operator's 8 hours are a property of the PERSON, and a shift that ends on
  // the desktop while the same login stays live on a tablet in the same office
  // is the shared-terminal hole with an extra step.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });

  redirect("/iniciar-sesion?motivo=turno");
}
