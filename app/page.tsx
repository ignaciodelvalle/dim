import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

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
//   - Footer with legal references (Ley 14.346, Ley 25.326)

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
    <main className="min-h-screen flex flex-col bg-white dark:bg-neutral-950">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center p-8 pt-20">
        <div className="max-w-3xl text-center space-y-6">
          <h1 className="text-6xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            MiMAR
          </h1>
          <p className="text-xl text-neutral-600 dark:text-neutral-400">Mi Mascota Argentina</p>
          <p className="text-base text-neutral-500 dark:text-neutral-500 max-w-xl mx-auto leading-relaxed">
            La credencial digital de salud para tu mascota. Para encontrarse, para cuidarse, para
            ayudarnos a cuidar a todas.
          </p>

          {/* 3-CTA hero — segmented by who you are. Each lands the right
              flow on the other side (signup for self-serve, login for
              admin-invited govt accounts). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 max-w-2xl mx-auto">
            <Link
              href="/signup"
              className="px-5 py-4 rounded-xl bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-semibold hover:opacity-90 transition-opacity"
            >
              Soy dueño
              <span className="block text-xs font-normal opacity-70 mt-1">Crear mi cuenta</span>
            </Link>
            <Link
              href="/signup"
              className="px-5 py-4 rounded-xl border-2 border-neutral-900 dark:border-neutral-50 text-neutral-900 dark:text-neutral-50 font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
            >
              Soy refugio o vet
              <span className="block text-xs font-normal opacity-70 mt-1">
                Después configurás la org
              </span>
            </Link>
            <Link
              href="/login"
              className="px-5 py-4 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-50 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
            >
              Soy gobierno
              <span className="block text-xs font-normal text-neutral-500 mt-1">
                Cuenta invitada
              </span>
            </Link>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-500 pt-2">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="underline underline-offset-4 hover:text-neutral-700">
              Iniciá sesión
            </Link>
          </p>

          {/* 3-step explainer (sprint 6 PR-055 / doc 10 §6) */}
          <section
            aria-label="Cómo funciona MiMAR"
            className="pt-10 grid grid-cols-1 md:grid-cols-3 gap-4 text-left"
          >
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
              <div
                className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-xl"
                aria-hidden="true"
              >
                🐾
              </div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                1. Cargá tu mascota
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Datos básicos, foto, y microchip si tenés. Tarda menos de un minuto.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
              <div
                className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-xl"
                aria-hidden="true"
              >
                📱
              </div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                2. Imprimí su QR
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Pegalo en la chapita del collar. Es la credencial pública que muestra solo lo que
                decidís compartir.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
              <div
                className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-xl"
                aria-hidden="true"
              >
                📍
              </div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                3. Si se pierde, todos pueden ayudar
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Quien la encuentre escanea el QR y ve cómo contactarte. Vecinos pueden reportar
                dónde la vieron.
              </p>
            </div>
          </section>
        </div>
      </section>

      {/* 4 theme blocks — what MiMAR does beyond the credential.
          Anchored sections so future deeplinks can target them. */}
      <section
        aria-label="Más sobre MiMAR"
        className="bg-gob-surface-alt dark:bg-neutral-900/50 py-16 px-8"
      >
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <ThemeBlock
            id="que-es-la-credencial"
            icon="🪪"
            title="¿Qué es la credencial?"
            body="Es la identidad digital de tu mascota. Combina datos básicos (nombre, foto, microchip) con un QR escaneable. Cuando alguien lo escanea, ve solo lo que vos decidiste compartir."
            ctaLabel="Cómo funciona el QR"
            ctaHref="#explainer"
          />
          <ThemeBlock
            id="reportar-perdida"
            icon="🧭"
            title="¿Cómo reportar una mascota perdida?"
            body="Desde tu cuenta marcás a la mascota como perdida en 3 pasos. La credencial pública se transforma en alerta visible para cualquiera que escanee el QR o entre al perfil público."
            ctaLabel="Crear cuenta y registrar"
            ctaHref="/signup"
          />
          <ThemeBlock
            id="denunciar-maltrato"
            icon="🚨"
            title="¿Cómo denunciar maltrato?"
            body="Denuncia anónima de maltrato animal, online y en minutos. Se enruta automáticamente a la autoridad sanitaria de la jurisdicción. La Ley 14.346 está de tu lado."
            ctaLabel="Hacer una denuncia"
            ctaHref="/denuncias/nueva"
          />
          <ThemeBlock
            id="adoptar"
            icon="❤"
            title="¿Cómo adoptar?"
            body="Mascotas en adopción de refugios verificados de toda Argentina. Filtrás por especie, zona y tamaño; la postulación llega directo al refugio."
            ctaLabel="Ver mascotas en adopción"
            ctaHref="/adoptar"
          />
        </div>
      </section>

      {/* Quiet links — denuncia + buscar with code. Both anonymous flows. */}
      <section className="py-10 px-8 text-center bg-white dark:bg-neutral-950">
        <div className="max-w-md mx-auto flex flex-col items-center gap-2">
          <Link
            href="/denuncias/nueva"
            className="text-sm text-neutral-500 dark:text-neutral-500 underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            Denunciar maltrato animal
          </Link>
          <Link
            href="/denuncias/buscar"
            className="text-sm text-neutral-500 dark:text-neutral-500 underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            Buscar mi denuncia con código →
          </Link>
        </div>
      </section>

      {/* Footer with legal references */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-8 px-8 bg-white dark:bg-neutral-950">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-500">
            <p>© {new Date().getFullYear()} MiMAR — Mi Mascota Argentina</p>
            <div className="flex gap-4">
              <Link
                href="/privacidad"
                className="underline underline-offset-4 hover:text-neutral-700"
              >
                Privacidad
              </Link>
              <Link
                href="/terminos"
                className="underline underline-offset-4 hover:text-neutral-700"
              >
                Términos
              </Link>
              <a
                href="https://github.com/ignaciodelvalle/dim"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-neutral-700"
              >
                GitHub
              </a>
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-500 leading-relaxed">
            MiMAR opera bajo el marco de la <strong>Ley 14.346</strong> (penalización del maltrato
            animal) y la <strong>Ley 25.326</strong> (protección de datos personales). El
            tratamiento de datos personales requiere consentimiento informado; las denuncias
            anónimas no recopilan PII del denunciante.
          </p>
        </div>
      </footer>
    </main>
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
  icon: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <article
      id={id}
      className="rounded-2xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-6 space-y-3"
    >
      <div
        className="h-12 w-12 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-2xl"
        aria-hidden
      >
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{body}</p>
      <Link
        href={ctaHref}
        className="inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
      >
        {ctaLabel} →
      </Link>
    </article>
  );
}
