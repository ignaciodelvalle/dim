import { getIntentCopy } from "@/lib/domain/auth-intent-copy";
import { isIdentityPending } from "@/lib/domain/identity-completeness";
import { getProfileCached } from "@/lib/infra/request-cache";
import { safeReturnTo } from "@/lib/infra/role-landing";
import { createClient } from "@/lib/supabase/server";
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

  // THE LEAK (staging finding, 2026-08-01) — 60% of owner profiles were stuck
  // on the trigger's provisional, email-derived display_name.
  //
  // This guard used to be an unconditional `if (user) redirect(...)`. Signup
  // step 1 runs as a Server Action ON THIS ROUTE: supabase.auth.signUp writes
  // the session cookie, and Next.js then re-renders this page as part of the
  // same action response. getUser() now returns the brand new user, the guard
  // fired, and the client router navigated to /mis-mascotas BEFORE the form's
  // step-2 effect could ever paint. The account was left with only a
  // provisional name, and nothing ever brought the user back.
  //
  // The step-2 form was never the problem; this line was racing it. The fix is
  // to make the guard identity-aware: an authenticated visitor whose identity
  // is COMPLETE is bounced (unchanged behaviour — no logged-in user should sit
  // on a signup form), but one whose identity is still provisional is kept here
  // and shown step 2 directly. That also turns /signup into the resume surface:
  // close the tab, come back a week later, and the missing step is waiting.
  const identityPending =
    user !== null &&
    isIdentityPending({
      displayName: (await getProfileCached(user.id))?.displayName,
      email: user.email,
    });
  if (user && !identityPending) redirect(returnTo ?? "/mis-mascotas");

  const intentCopy = getIntentCopy(rawIntent);

  // Build the login link — preserve intent + returnTo.
  const loginHref =
    rawIntent && returnTo
      ? `/iniciar-sesion?intent=${encodeURIComponent(rawIntent)}&returnTo=${encodeURIComponent(returnTo)}`
      : rawIntent
        ? `/iniciar-sesion?intent=${encodeURIComponent(rawIntent)}`
        : "/iniciar-sesion";

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
            className="font-ln-serif text-3xl font-semibold tracking-[-0.02em] text-[var(--color-ln-ink)]"
          >
            {identityPending
              ? "Completá tu perfil"
              : intentCopy
                ? intentCopy.headline
                : "Crear cuenta"}
          </h1>
          {/* 24.1 Subcopy: tied to the heading via aria-describedby.
              Resume copy wins over intent copy — telling someone who already
              has an account to "create" one is the confusing part. */}
          <p className="text-sm text-[var(--color-ln-ink-2)]" aria-describedby="auth-heading">
            {identityPending
              ? "Tu cuenta ya está creada. Nos falta tu nombre para completar tu credencial."
              : intentCopy
                ? intentCopy.subcopy
                : "Creá la libreta digital de tu mascota"}
          </p>
        </div>
        <SignupForm
          intent={intent}
          returnTo={returnTo}
          initialStep={identityPending ? "identity" : "account"}
        />
        {/* Meaningless to someone who is already signed in and just finishing
            their profile — they HAVE the account. */}
        {!identityPending && (
          <p className="text-center text-sm text-[var(--color-ln-ink-2)]">
            ¿Ya tenés cuenta?{" "}
            <Link
              href={loginHref}
              className="font-medium text-[var(--color-ln-ink)] underline underline-offset-4"
            >
              Iniciar sesión
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
