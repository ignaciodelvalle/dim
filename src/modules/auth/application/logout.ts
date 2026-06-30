// Use-cases: logoutAction + logoutAndReturnAction (strangler migration 26/61).
//
// @no-auth-required: logout invalidates whatever session exists (or none).

import { safeReturnTo } from "@/lib/role-landing";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// Variant of logoutAction that redirects back to a caller-supplied path
// instead of home. Used by public finder flows so the visitor can continue
// anonymously on the same page after signing out.
//
// @no-auth-required: logout invalidates whatever session exists (or none);
// no user identity is needed to call signOut.
export async function logoutAndReturnAction(returnTo: string) {
  const safePath = safeReturnTo(returnTo);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(safePath ?? "/");
}
