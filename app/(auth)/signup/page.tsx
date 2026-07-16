import { db, profiles } from "@/db";
import { getIntentCopy } from "@/lib/domain/auth-intent-copy";
import { safeReturnTo } from "@/lib/infra/role-landing";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "./SignupForm";

// `intent=apply` + `returnTo=/adoptar/{token}/postular` come from the
// adoption listing's startApplyIntentAction. When that intent is present
// we swap the headline copy, skip the first-pet step after signup, and
// drop the visitor onto the postular page.
//
// Item 24.1: intent-aware copy map covers all supported intents (apply,
// foster, and future ones). SignupForm still receives the raw "apply" |
// null value because it drives flow logic (not copy), and today only
// "apply" has a flow branch. Other intents use the same form flow as the
// default path.

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; returnTo?: string }>;
}) {
  const sp = await searchParams;
  // Preserve raw intent for the copy map. SignupForm still gets only
  // "apply" | null because flow-branching is limited to that value today.
  const rawIntent = sp.intent ?? null;
  const intent = rawIntent === "apply" ? "apply" : null;
  const returnTo = safeReturnTo(sp.returnTo);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // An authenticated visitor is USUALLY someone who already signed up and has no
  // business here — bounce them. But signup step 1 authenticates, and step 2
  // (identity) runs client-side on this same page. So between the two steps this
  // guard sees a logged-in user and, on any server re-render — a reload, a back,
  // any navigation — throws them into the app mid-signup.
  //
  // What that costs (confirmed in a real browser run, docs/reviews/results/
  // genesis.md:81): display_name is left as the provisional value the
  // handle_new_user trigger derives from the email local-part, permanently and
  // with nothing forcing completion — which is why operators saw owners named
  // "lucia-gen-mrau2dv1" (QA ronda 5). Worse, complete-identity is the ONLY
  // writer of tos_accepted_at: the visitor ticked the TOS box in step 1, but the
  // acceptance is recorded in step 2, so a skipped step 2 leaves the account with
  // NO provable consent record (Ley 25.326 art. 5) despite consent being given.
  //
  // tos_accepted_at is therefore the exact "identity finished" marker: NULL means
  // step 2 never ran. Resume those visitors at step 2 instead of bouncing them.
  if (user) {
    const [profile] = await db
      .select({ tosAcceptedAt: profiles.tosAcceptedAt })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    if (profile?.tosAcceptedAt) redirect(returnTo ?? "/mis-mascotas");
    // Identity unfinished (or no profile row yet) → fall through to step 2.
  }

  const intentCopy = getIntentCopy(rawIntent);

  // Build the login link — preserve intent + returnTo.
  const loginHref =
    rawIntent && returnTo
      ? `/login?intent=${encodeURIComponent(rawIntent)}&returnTo=${encodeURIComponent(returnTo)}`
      : rawIntent
        ? `/login?intent=${encodeURIComponent(rawIntent)}`
        : "/login";

  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center p-6 bg-[var(--color-ln-paper)]"
    >
      {/* Back link — lean, keeps the centered layout intact */}
      <div className="w-full max-w-sm mb-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-ln-ink-2)] no-underline hover:text-[var(--color-ln-azul)]"
        >
          ← Volver al inicio
        </Link>
      </div>
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          {/* 24.1 Intent-aware heading: contextual label when an intent is present. */}
          <h1
            id="auth-heading"
            className="font-[var(--font-ln-serif)] text-[28px] font-semibold tracking-[-0.02em] text-[var(--color-ln-ink)]"
          >
            {intentCopy ? intentCopy.headline : "Crear cuenta"}
          </h1>
          {/* 24.1 Subcopy: tied to the heading via aria-describedby. */}
          <p className="text-sm text-[var(--color-ln-ink-2)]" aria-describedby="auth-heading">
            {intentCopy ? intentCopy.subcopy : "Creá la libreta digital de tu mascota"}
          </p>
        </div>
        {/* Authenticated + unfinished identity → resume at step 2, never restart
            the account form (the account already exists; it could only fail). */}
        <SignupForm
          intent={intent}
          returnTo={returnTo}
          initialStep={user ? "identity" : "account"}
        />
        <p className="text-center text-sm text-[var(--color-ln-ink-2)]">
          ¿Ya tenés cuenta?{" "}
          <Link
            href={loginHref}
            className="font-medium text-[var(--color-ln-ink)] underline underline-offset-4"
          >
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
