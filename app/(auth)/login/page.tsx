import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db, organizationMemberships, profiles } from "@/db";
import { getIntentCopy } from "@/lib/domain/auth-intent-copy";
import { pathForRole, resolveVetLanding, safeReturnTo } from "@/lib/role-landing";
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

  if (user) {
    if (returnTo) redirect(returnTo);
    const [profile] = await db
      .select({ role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

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
