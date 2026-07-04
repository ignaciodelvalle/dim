import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { db, organizationMemberships } from "@/db";
import { getIntentCopy } from "@/lib/domain/auth-intent-copy";
import { getProfileCached } from "@/lib/infra/request-cache";
import {
  isDeactivatedInstitutional,
  pathForRole,
  resolveVetLanding,
  safeReturnTo,
} from "@/lib/infra/role-landing";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./LoginForm";

// Login mirrors signup's `intent=apply` + `returnTo` plumbing so a visitor
// who clicks "¿Ya tenés cuenta?" on the signup-from-adoption flow keeps
// the apply intent through the entire round-trip.
//
// Item 24.1: when an `intent` param is present, the page swaps in contextual
// copy (headline + subcopy) so the gate is explained, not just enforced.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; returnTo?: string }>;
}) {
  const sp = await searchParams;
  // Preserve the raw intent value so the copy map can match it (not just "apply").
  const intent = sp.intent ?? null;
  const returnTo = safeReturnTo(sp.returnTo);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Deactivated institutional session (task #39): do NOT redirect by role —
  // the portal guard bounces it back and the redirects loop until the browser
  // gives up (ERR_TOO_MANY_REDIRECTS), leaving the account with no logout
  // surface at all. Render the login page with a notice + "Cerrar sesión".
  const profile = user ? await getProfileCached(user.id) : null;
  const deactivatedSession = isDeactivatedInstitutional(profile);

  if (user && !deactivatedSession) {
    if (returnTo) redirect(returnTo);

    const role = profile?.role ?? "owner";
    if (role === "vet") {
      redirect(await resolveVetLanding(user.id));
    }
    let hasOrgAdminMembership = false;
    if (role === "owner") {
      const [membership] = await db
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.userId, user.id),
            eq(organizationMemberships.role, "admin"),
            isNull(organizationMemberships.leftAt),
          ),
        )
        .limit(1);
      hasOrgAdminMembership = !!membership;
    }
    redirect(pathForRole(role, { hasOrgAdminMembership }));
  }

  const intentCopy = getIntentCopy(intent);

  // Build the signup link — preserve intent + returnTo so the round-trip
  // doesn't lose context if the visitor switches from login to signup.
  const signupHref =
    intent && returnTo
      ? `/signup?intent=${encodeURIComponent(intent)}&returnTo=${encodeURIComponent(returnTo)}`
      : intent
        ? `/signup?intent=${encodeURIComponent(intent)}`
        : "/signup";

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
            {intentCopy ? intentCopy.headline : "Iniciar sesión"}
          </h1>
          {/* 24.1 Subcopy: tied to the heading via aria-labelledby on the form below. */}
          <p className="text-sm text-[var(--color-ln-ink-2)]" aria-describedby="auth-heading">
            {intentCopy ? intentCopy.subcopy : "Bienvenido de vuelta a MiMAR"}
          </p>
        </div>
        {/* Deactivated institutional account: clear notice + a guaranteed
            logout surface (server-action form works even without JS). */}
        {deactivatedSession && (
          <div
            role="alert"
            className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-err-100)] bg-[var(--color-ln-err-bg)] px-4 py-3 text-sm text-[var(--color-ln-ink)]"
          >
            <p className="font-medium text-[var(--color-ln-err)]">
              Tu cuenta institucional está desactivada.
            </p>
            <p>
              No podés acceder al portal. Si creés que se trata de un error, contactá al equipo de
              MiMAR.
            </p>
            <form action={logoutAction}>
              <button
                type="submit"
                className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-[var(--color-ln-azul)] underline underline-offset-2 hover:text-[var(--color-ln-azul-700)]"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        )}
        <LoginForm returnTo={returnTo} />
        <p className="text-center text-sm text-[var(--color-ln-ink-2)]">
          ¿No tenés cuenta?{" "}
          <Link
            href={signupHref}
            className="font-medium text-[var(--color-ln-ink)] underline underline-offset-4"
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </main>
  );
}
