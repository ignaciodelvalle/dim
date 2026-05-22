// Public owner landing.
//
// Per the 2026-05-22 product decision, `/` is now an owner-first marketing
// landing instead of a redirect-to-portal stub. Unauthenticated visitors see
// the pitch + an inline "create your pet" mini-form that drafts to
// localStorage and hands off to /signup. Authenticated visitors see the same
// pitch with a "Continuar al portal" CTA pointing at their role landing —
// no auto-redirect, so they can re-read the marketing copy if they want.
//
// The pet draft pickup happens in app/(auth)/signup/SignupForm.tsx: it reads
// the same localStorage key, pre-fills the step-2 PetForm, and clears the
// draft on success.
//
// Other audience landings (vets, refugios, govt) will live at /vets,
// /refugios-info, /gob-info or similar — this file stays owner-focused.

import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import { PetDraftForm } from "@/app/_components/PetDraftForm";
import { db, organizationMemberships, profiles } from "@/db";
import { pathForRole, resolveVetLanding } from "@/lib/role-landing";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // For authenticated visitors we resolve their portal path so the CTA can
  // link straight to it. No redirect — they get to see the landing too.
  let portalPath: string | null = null;
  let firstName: string | null = null;
  if (user) {
    const [profile] = await db
      .select({ role: profiles.role, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

    firstName = profile?.displayName?.split(" ")[0] ?? null;
    const role = profile?.role ?? "owner";
    if (role === "vet") {
      portalPath = await resolveVetLanding(user.id);
    } else {
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
      portalPath = pathForRole(role, { hasOrgAdminMembership });
    }
  }

  const isAuthenticated = !!user;

  return (
    <>
      {/* Phase 2.2 — auth header band. Visible only when logged in; sits above
          the hero so authenticated users immediately see context without losing
          the marketing content below. */}
      {isAuthenticated && (
        <div className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 py-2 px-6">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex items-center gap-2.5">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-900 dark:bg-neutral-50 flex items-center justify-center">
                <span className="text-sm font-medium text-white dark:text-neutral-900">
                  {(firstName ?? "U")[0].toUpperCase()}
                </span>
              </div>
              <span className="text-sm text-neutral-700 dark:text-neutral-300">
                Hola,{" "}
                <span className="font-medium text-neutral-900 dark:text-neutral-50">
                  {firstName ?? "vos"}
                </span>{" "}
                — ya tenés sesión iniciada
              </span>
            </div>
            <Link
              href={portalPath ?? "/mis-mascotas"}
              className="text-sm font-medium text-gob-azul-link hover:underline underline-offset-4 whitespace-nowrap"
            >
              Ir a mi portal →
            </Link>
          </div>
        </div>
      )}

      <main className="min-h-screen bg-white dark:bg-neutral-950">
        <div className="mx-auto max-w-5xl px-6 py-12 md:py-20">
          {/* Hero */}
          <header className="text-center space-y-4 mb-12 md:mb-16">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              MiMAR
            </h1>
            <p className="text-xl md:text-2xl text-neutral-700 dark:text-neutral-300">
              La credencial digital de tu mascota
            </p>
            <p className="text-base text-neutral-600 dark:text-neutral-400 max-w-xl mx-auto leading-relaxed">
              Si se pierde, cualquiera con un celular puede escanear su QR y avisarte al instante.
            </p>
          </header>

          {/* Action panel — form slot for unauth; soft "sumar otra" panel for auth */}
          {isAuthenticated ? (
            <section className="max-w-md mx-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 md:p-8 shadow-sm mb-12 md:mb-16">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                    Ya tenés una mascota cargada
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                    ¿Querés sumar otra?
                  </h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Podés cargar quien quieras desde Mis mascotas.
                  </p>
                </div>
                <Link
                  href="/mis-mascotas/nueva"
                  className="inline-block w-full px-5 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors text-center"
                >
                  Crear otra mascota →
                </Link>
                <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
                  <Link
                    href={portalPath ?? "/mis-mascotas"}
                    className="font-medium text-neutral-900 dark:text-neutral-50 underline underline-offset-4"
                  >
                    Ver todas mis mascotas
                  </Link>
                </p>
              </div>
            </section>
          ) : (
            <section className="max-w-md mx-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 md:p-8 shadow-sm mb-12 md:mb-16">
              <div className="space-y-5">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                    Empezá ahora
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                    Creá la credencial de tu mascota
                  </h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Es gratis y tarda un minuto. Empezá por los datos básicos.
                  </p>
                </div>
                <PetDraftForm />
                <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
                  ¿Ya tenés cuenta?{" "}
                  <Link
                    href="/login"
                    className="font-medium text-neutral-900 dark:text-neutral-50 underline underline-offset-4"
                  >
                    Iniciar sesión
                  </Link>
                </p>
              </div>
            </section>
          )}

          {/* Benefits grid — asymmetric: lead (2 cols) + two supporting (3 cols split 50/50) */}
          <section className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-6 mb-12 md:mb-16">
            <div className="md:col-span-2">
              <LeadBenefit
                label="Si se pierde"
                title="Cualquiera puede ayudarte a encontrarla"
                body="Su credencial pública tiene un QR. Quien lo escanee ve tu contacto y te avisa al instante — sin instalar nada."
              />
            </div>
            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
              <SupportingBenefit
                icon={<SyringeIcon />}
                title="Libreta digital"
                body="Vacunas, visitas al vet y medicaciones en un solo lugar, siempre con vos."
              />
              <SupportingBenefit
                icon={<ShieldCheckIcon />}
                title="Vos decidís qué se ve"
                body="Tu mascota tiene una credencial pública; vos elegís qué datos compartir."
              />
            </div>
          </section>

          {/* Casos urgentes — danger-tinted block, below benefits, outside conversion path */}
          <section className="mt-12 rounded-2xl bg-gob-danger/10 p-4 md:p-5">
            <div className="flex gap-3 md:gap-4">
              <div className="shrink-0 mt-0.5 text-gob-danger">
                <AlertTriangleIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gob-danger">Casos urgentes</p>
                <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                  No necesitás cuenta para denunciar maltrato animal o buscar el estado de una
                  denuncia ya hecha.
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <Link
                    href="/denuncias/nueva"
                    className="text-sm underline underline-offset-4 text-gob-danger"
                  >
                    Denunciar maltrato →
                  </Link>
                  <Link
                    href="/denuncias/buscar"
                    className="text-sm underline underline-offset-4 text-gob-danger"
                  >
                    Buscar con código →
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400 mt-12 tracking-widest uppercase">
            v0.1.0 · scaffolding · más por venir
          </p>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Benefit components
// ---------------------------------------------------------------------------

function LeadBenefit({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="h-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 flex flex-col gap-3">
      <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-gob-celeste/10 px-2.5 py-1 text-xs font-medium tracking-wide text-gob-azul-link">
        <SearchIcon />
        {label}
      </div>
      <h3 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
        {title}
      </h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{body}</p>
    </div>
  );
}

function SupportingBenefit({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5">
      <div className="text-neutral-500 dark:text-neutral-400 mb-2">{icon}</div>
      <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1">
        {title}
      </h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons (20×20, stroke 1.5, currentColor, aria-hidden)
// ---------------------------------------------------------------------------

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  );
}

function SyringeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 3.75a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H12v1.5h3.75A3.75 3.75 0 0 1 19.5 9.75v.75a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75v-.75A3.75 3.75 0 0 1 8.25 6H12V4.5H8.25a.75.75 0 0 1-.75-.75ZM4.5 12h15v7.5a.75.75 0 0 1-.75.75h-13.5A.75.75 0 0 1 4.5 19.5V12Z"
      />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
      />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  );
}
