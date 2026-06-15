import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppFooter } from "@/components/layout/AppFooter";
import { AppHeader } from "@/components/layout/AppHeader";
import { PUBLIC_NAV } from "@/components/layout/nav-presets";
import { db, organizationMemberships, profiles } from "@/db";
import { pathForRole, resolveVetLanding } from "@/lib/role-landing";
import { createClient } from "@/lib/supabase/server";

// Marketing landing — handoff P4-1.
//
// Three-CTA hero per D8 (extend, no rediseño): dueño → /signup,
// refugio/vet → /signup (post-signup the user can /cuenta/upgrade),
// gobierno → /login (govts are admin-invited, no self-serve signup).
//
// Below the CTAs:
//   - 3-step "how it works" explainer (kept from sprint 6 / doc 10 §6)
//   - 4 theme blocks (credential, lost, denuncia, adopción)
//   - Quiet links to /denuncias/nueva + /denuncias/buscar
//   - AppFooter (institutional chrome — replaces the one-off footer)
//
// AppHeader + AppFooter are imported directly (not via (public) route group)
// to avoid double-wrapping: app/page.tsx is NOT inside (public)/.

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in users skip the landing and go straight to their portal.
  if (user) {
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
    <div className="flex min-h-screen flex-col bg-ln-paper">
      <AppHeader nav={PUBLIC_NAV} />

      <main className="flex flex-col flex-1">
        {/* Hero */}
        <section className="flex-1 flex flex-col items-center justify-center p-8 pt-20">
          <div className="max-w-3xl text-center space-y-6">
            <h1 className="text-6xl font-bold tracking-tight text-ln-ink font-ln-serif">MiMAR</h1>
            <p className="text-xl text-ln-ink-2">Mi Mascota Argentina</p>
            <p className="text-base text-ln-mute max-w-xl mx-auto leading-relaxed">
              La credencial digital de salud para tu mascota. Para encontrarse, para cuidarse, para
              ayudarnos a cuidar a todas.
            </p>

            {/* 3-CTA hero — segmented by who you are. Each lands the right
                flow on the other side (signup for self-serve, login for
                admin-invited govt accounts). */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 max-w-2xl mx-auto">
              <Link
                href="/signup"
                className="px-5 py-4 rounded-xl bg-ln-azul text-white font-semibold hover:opacity-90 transition-opacity"
              >
                Soy dueño
                <span className="block text-xs font-normal opacity-70 mt-1">Crear mi cuenta</span>
              </Link>
              <Link
                href="/signup"
                className="px-5 py-4 rounded-xl border-2 border-ln-line-strong text-ln-ink font-semibold hover:bg-ln-stripe transition-colors"
              >
                Soy refugio o vet
                <span className="block text-xs font-normal opacity-70 mt-1">
                  Después configurás la org
                </span>
              </Link>
              <Link
                href="/login"
                className="px-5 py-4 rounded-xl border border-ln-line-strong text-ln-ink font-medium hover:bg-ln-stripe transition-colors"
              >
                Soy gobierno
                <span className="block text-xs font-normal text-ln-mute mt-1">Cuenta invitada</span>
              </Link>
            </div>

            <p className="text-xs text-ln-mute pt-2">
              ¿Ya tenés cuenta?{" "}
              <Link href="/login" className="underline underline-offset-4 hover:text-ln-ink-2">
                Iniciá sesión
              </Link>
            </p>

            {/* 3-step explainer (sprint 6 PR-055 / doc 10 §6) */}
            <section
              id="explainer"
              aria-label="Cómo funciona MiMAR"
              className="pt-10 grid grid-cols-1 md:grid-cols-3 gap-4 text-left"
            >
              <div className="rounded-2xl border border-ln-line p-4 space-y-2">
                {/* Icon: paw — tokenized span instead of emoji */}
                <span
                  className="h-10 w-10 rounded-full bg-ln-stripe flex items-center justify-center text-ln-azul"
                  aria-hidden="true"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 15c-2.3 0-4 1.7-4 4s1.7 4 4 4 4-1.7 4-4-1.7-4-4-4zm-7-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm14 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM8.5 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm7 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-ln-ink">1. Cargá tu mascota</p>
                <p className="text-xs text-ln-ink-2 leading-relaxed">
                  Datos básicos, foto, y microchip si tenés. Tarda menos de un minuto.
                </p>
              </div>

              <div className="rounded-2xl border border-ln-line p-4 space-y-2">
                {/* Icon: QR / mobile — tokenized span */}
                <span
                  className="h-10 w-10 rounded-full bg-ln-stripe flex items-center justify-center text-ln-azul"
                  aria-hidden="true"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-ln-ink">2. Imprimí su QR</p>
                <p className="text-xs text-ln-ink-2 leading-relaxed">
                  Pegalo en la chapita del collar. Es la credencial pública que muestra solo lo que
                  decidís compartir.
                </p>
              </div>

              <div className="rounded-2xl border border-ln-line p-4 space-y-2">
                {/* Icon: location pin — tokenized span */}
                <span
                  className="h-10 w-10 rounded-full bg-ln-stripe flex items-center justify-center text-ln-azul"
                  aria-hidden="true"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-ln-ink">
                  3. Si se pierde, todos pueden ayudar
                </p>
                <p className="text-xs text-ln-ink-2 leading-relaxed">
                  Quien la encuentre escanea el QR y ve cómo contactarte. Vecinos pueden reportar
                  dónde la vieron.
                </p>
              </div>
            </section>
          </div>
        </section>

        {/* 4 theme blocks — what MiMAR does beyond the credential.
            Anchored sections so future deeplinks can target them. */}
        <section aria-label="Más sobre MiMAR" className="bg-ln-stripe py-16 px-8">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <ThemeBlock
              id="que-es-la-credencial"
              icon="credential"
              title="¿Qué es la credencial?"
              body="Es la identidad digital de tu mascota. Combina datos básicos (nombre, foto, microchip) con un QR escaneable. Cuando alguien lo escanea, ve solo lo que vos decidiste compartir."
              ctaLabel="Cómo funciona el QR"
              ctaHref="#explainer"
            />
            <ThemeBlock
              id="reportar-perdida"
              icon="lost"
              title="¿Cómo reportar una mascota perdida?"
              body="Desde tu cuenta marcás a la mascota como perdida en 3 pasos. La credencial pública se transforma en alerta visible para cualquiera que escanee el QR o entre al perfil público."
              ctaLabel="Crear cuenta y registrar"
              ctaHref="/signup"
            />
            <ThemeBlock
              id="denunciar-maltrato"
              icon="alert"
              title="¿Cómo denunciar maltrato?"
              body="Denuncia anónima de maltrato animal, online y en minutos. Se enruta automáticamente a la autoridad sanitaria de la jurisdicción. La Ley 14.346 está de tu lado."
              ctaLabel="Hacer una denuncia"
              ctaHref="/denuncias/nueva"
            />
            <ThemeBlock
              id="adoptar"
              icon="heart"
              title="¿Cómo adoptar?"
              body="Mascotas en adopción de refugios verificados de toda Argentina. Filtrás por especie, zona y tamaño; la postulación llega directo al refugio."
              ctaLabel="Ver mascotas en adopción"
              ctaHref="/adoptar"
            />
          </div>
        </section>

        {/* Quiet links — lost listing + denuncia + buscar with code. Anonymous. */}
        <section className="py-10 px-8 text-center bg-ln-paper">
          <div className="max-w-md mx-auto flex flex-col items-center gap-2">
            <Link
              href="/perdidas"
              className="text-sm text-ln-mute underline underline-offset-4 hover:text-ln-ink-2 transition-colors"
            >
              Buscá mascotas perdidas cerca tuyo →
            </Link>
            <Link
              href="/denuncias/nueva"
              className="text-sm text-ln-mute underline underline-offset-4 hover:text-ln-ink-2 transition-colors"
            >
              Denunciar maltrato animal
            </Link>
            <Link
              href="/denuncias/buscar"
              className="text-sm text-ln-mute underline underline-offset-4 hover:text-ln-ink-2 transition-colors"
            >
              Buscar mi denuncia con código →
            </Link>
          </div>
        </section>

        {/* Legal note — kept inline above AppFooter for landing context. */}
        <section className="py-6 px-8 bg-ln-paper border-t border-ln-line">
          <p className="max-w-5xl mx-auto text-[11px] text-ln-mute leading-relaxed">
            MiMAR opera bajo el marco de la <strong>Ley 14.346</strong> (penalización del maltrato
            animal) y la <strong>Ley 25.326</strong> (protección de datos personales). El
            tratamiento de datos personales requiere consentimiento informado; las denuncias
            anónimas no recopilan PII del denunciante.
          </p>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}

type ThemeBlockIcon = "credential" | "lost" | "alert" | "heart";

function ThemeBlockIconSvg({ icon }: { icon: ThemeBlockIcon }) {
  if (icon === "credential") {
    // ID card
    return (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <circle cx="8" cy="12" r="2" />
        <path d="M14 9h4M14 12h4M14 15h2" />
      </svg>
    );
  }
  if (icon === "lost") {
    // Compass
    return (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    );
  }
  if (icon === "alert") {
    // Alert triangle
    return (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  // heart
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ThemeBlock({
  id,
  icon,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  id: string;
  icon: ThemeBlockIcon;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <article id={id} className="rounded-2xl bg-ln-card border border-ln-line p-6 space-y-3">
      <span
        className="h-12 w-12 rounded-full bg-ln-stripe flex items-center justify-center text-ln-azul"
        aria-hidden="true"
      >
        <ThemeBlockIconSvg icon={icon} />
      </span>
      <h2 className="text-lg font-semibold text-ln-ink">{title}</h2>
      <p className="text-sm text-ln-ink-2 leading-relaxed">{body}</p>
      <Link href={ctaHref} className="inline-block text-sm font-medium text-ln-ok hover:underline">
        {ctaLabel} →
      </Link>
    </article>
  );
}
