import { getIntentCopy } from "@/lib/domain/auth-intent-copy";
import { safeReturnTo } from "@/lib/role-landing";
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
  if (user) redirect(returnTo ?? "/mis-mascotas");

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
        <SignupForm intent={intent} returnTo={returnTo} />
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
