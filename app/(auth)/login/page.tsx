import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db, organizationMemberships, profiles } from "@/db";
import { pathForRole, resolveVetLanding, safeReturnTo } from "@/lib/role-landing";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./LoginForm";

// Login mirrors signup's `intent=apply` + `returnTo` plumbing so a visitor
// who clicks "¿Ya tenés cuenta?" on the signup-from-adoption flow keeps
// the apply intent through the entire round-trip.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; returnTo?: string }>;
}) {
  const sp = await searchParams;
  const intent = sp.intent === "apply" ? "apply" : null;
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[var(--color-ln-paper)]">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="font-[var(--font-ln-serif)] text-[28px] font-semibold tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Iniciar sesión
          </h1>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
            {intent === "apply"
              ? "Iniciá sesión para continuar con tu postulación."
              : "Bienvenido de vuelta a MiMAR"}
          </p>
        </div>
        <LoginForm returnTo={returnTo} />
        <p className="text-center text-sm text-[var(--color-ln-ink-2)]">
          ¿No tenés cuenta?{" "}
          <Link
            href={
              intent === "apply" && returnTo
                ? `/signup?intent=apply&returnTo=${encodeURIComponent(returnTo)}`
                : "/signup"
            }
            className="font-medium text-[var(--color-ln-ink)] underline underline-offset-4"
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </main>
  );
}
