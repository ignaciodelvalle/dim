import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppFooter, AppHeader } from "@/components/layout";
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
//
// Chrome: AppHeader (PUBLIC_NAV) + AppFooter imported directly.
// NOT inside (public) route group to avoid double-wrapping the layout.

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

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="flex flex-1 flex-col items-center justify-center p-8 pt-20">
          <div className="max-w-3xl space-y-6 text-center">
            <h1 className="font-ln-serif text-6xl font-bold tracking-tight text-ln-ink">MiMAR</h1>
            <p className="text-xl text-ln-ink-2">Mi Mascota Argentina</p>
            <p className="mx-auto max-w-xl text-base leading-relaxed text-ln-mute">
              La credencial digital de salud para tu mascota. Para encontrarse, para cuidarse, para
              ayudarnos a cuidar a todas.
            </p>

            {/* 3-CTA hero — segmented by who you are. Each lands the right
                flow on the other side (signup for self-serve, login for
                admin-invited govt accounts). */}
            <div className="mx-auto grid max-w-2xl grid-cols-1 gap-3 pt-6 sm:grid-cols-3">
              <Link
                href="/signup"
                className="rounded-xl bg-ln-azul px-5 py-4 font-semibold text-white transition-opacity hover:opacity-90"
              >
                Soy dueño
                <span className="mt-1 block text-xs font-normal opacity-70">Crear mi cuenta</span>
              </Link>
              <Link
                href="/signup"
                className="rounded-xl border-2 border-ln-line-strong px-5 py-4 font-semibold text-ln-ink transition-colors hover:bg-ln-stripe"
              >
                Soy refugio o vet
                <span className="mt-1 block text-xs font-normal opacity-70">
                  Después configurás la org
                </span>
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-ln-line-strong px-5 py-4 font-medium text-ln-ink transition-colors hover:bg-ln-stripe"
              >
                Soy gobierno
                <span className="mt-1 block text-xs font-normal text-ln-mute">Cuenta invitada</span>
              </Link>
            </div>

            <p className="pt-2 text-xs text-ln-mute">
              ¿Ya tenés cuenta?{" "}
              <Link href="/login" className="underline underline-offset-4 hover:text-ln-ink-2">
                Iniciá sesión
              </Link>
            </p>

            {/* 3-step explainer (sprint 6 PR-055 / doc 10 §6) */}
            <section
              id="explainer"
              aria-label="Cómo funciona MiMAR"
              className="grid grid-cols-1 gap-4 pt-10 text-left md:grid-cols-3"
            >
              <div className="space-y-2 rounded-2xl border border-ln-line p-4">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-ln-azul text-white"
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
                    <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-ln-ink">1. Cargá tu mascota</p>
                <p className="text-xs leading-relaxed text-ln-ink-2">
                  Datos básicos, foto, y microchip si tenés. Tarda menos de un minuto.
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-ln-line p-4">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-ln-azul text-white"
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
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <path d="M9 7h6M9 11h6M9 15h4" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-ln-ink">2. Imprimí su QR</p>
                <p className="text-xs leading-relaxed text-ln-ink-2">
                  Pegalo en la chapita del collar. Es la credencial pública que muestra solo lo que
                  decidís compartir.
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-ln-line p-4">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-ln-azul text-white"
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
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4l3 3" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-ln-ink">
                  3. Si se pierde, todos pueden ayudar
                </p>
                <p className="text-xs leading-relaxed text-ln-ink-2">
                  Quien la encuentre escanea el QR y ve cómo contactarte. Vecinos pueden reportar
                  dónde la vieron.
                </p>
              </div>
            </section>
          </div>
        </section>

        {/* 4 theme blocks — what MiMAR does beyond the credential.
            Anchored sections so future deeplinks can target them. */}
        <section aria-label="Más sobre MiMAR" className="bg-ln-stripe px-8 py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
            <ThemeBlock
              id="que-es-la-credencial"
              iconPath="M10 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 0v6h6M8 13h8M8 17h5"
              title="¿Qué es la credencial?"
              body="Es la identidad digital de tu mascota. Combina datos básicos (nombre, foto, microchip) con un QR escaneable. Cuando alguien lo escanea, ve solo lo que vos decidiste compartir."
              ctaLabel="Cómo funciona el QR"
              ctaHref="#explainer"
            />
            <ThemeBlock
              id="reportar-perdida"
              iconPath="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"
              title="¿Cómo reportar una mascota perdida?"
              body="Desde tu cuenta marcás a la mascota como perdida en 3 pasos. La credencial pública se transforma en alerta visible para cualquiera que escanee el QR o entre al perfil público."
              ctaLabel="Crear cuenta y registrar"
              ctaHref="/signup"
            />
            <ThemeBlock
              id="denunciar-maltrato"
              iconPath="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01"
              title="¿Cómo denunciar maltrato?"
              body="Denuncia anónima de maltrato animal, online y en minutos. Se enruta automáticamente a la autoridad sanitaria de la jurisdicción. La Ley 14.346 está de tu lado."
              ctaLabel="Hacer una denuncia"
              ctaHref="/denuncias/nueva"
            />
            <ThemeBlock
              id="adoptar"
              iconPath="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
              title="¿Cómo adoptar?"
              body="Mascotas en adopción de refugios verificados de toda Argentina. Filtrás por especie, zona y tamaño; la postulación llega directo al refugio."
              ctaLabel="Ver mascotas en adopción"
              ctaHref="/adoptar"
            />
          </div>
        </section>

        {/* Quiet links — lost listing + denuncia + buscar with code. Anonymous. */}
        <section className="bg-ln-paper px-8 py-10 text-center">
          <div className="mx-auto flex max-w-md flex-col items-center gap-2">
            <Link
              href="/perdidas"
              className="text-sm text-ln-mute underline underline-offset-4 transition-colors hover:text-ln-ink-2"
            >
              Buscá mascotas perdidas cerca tuyo →
            </Link>
            <Link
              href="/denuncias/nueva"
              className="text-sm text-ln-mute underline underline-offset-4 transition-colors hover:text-ln-ink-2"
            >
              Denunciar maltrato animal
            </Link>
            <Link
              href="/denuncias/buscar"
              className="text-sm text-ln-mute underline underline-offset-4 transition-colors hover:text-ln-ink-2"
            >
              Buscar mi denuncia con código →
            </Link>
          </div>
        </section>

        {/* Legal note — kept above AppFooter for specificity to the landing. */}
        <section className="bg-ln-paper px-8 pb-10 text-center">
          <p className="mx-auto max-w-3xl text-[11px] leading-relaxed text-ln-mute">
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

function ThemeBlock({
  id,
  iconPath,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  id: string;
  iconPath: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <article id={id} className="space-y-3 rounded-2xl border border-ln-line bg-ln-card p-6">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-ln-azul text-white"
        aria-hidden="true"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={iconPath} />
        </svg>
      </span>
      <h2 className="text-lg font-semibold text-ln-ink">{title}</h2>
      <p className="text-sm leading-relaxed text-ln-ink-2">{body}</p>
      <Link href={ctaHref} className="inline-block text-sm font-medium text-ln-ok hover:underline">
        {ctaLabel} →
      </Link>
    </article>
  );
}
