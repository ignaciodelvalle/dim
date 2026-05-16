import { eq } from "drizzle-orm";
import Link from "next/link";

import { db, profiles } from "@/db";
import { getActiveMemberships } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { OrgCreateForm } from "./OrgCreateForm";
import { VetUpgradeForm } from "./VetUpgradeForm";

export default async function UpgradePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // layout guards this

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  const memberships = await getActiveMemberships(user.id);
  const adminMembership = memberships.find((m) => m.membership.role === "admin");

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Tu rol en DIM
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Ampliá tus permisos registrando tu matrícula profesional o creando una organización.
          </p>
        </header>

        {/* Card A — Profesional veterinario */}
        {profile?.role !== "vet" && (
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Profesional veterinario
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Registrá tu matrícula para que el equipo de DIM la verifique. Una vez aprobada, tu
                rol será actualizado a veterinario.
              </p>
            </div>

            {profile?.matriculaNumber ? (
              <p className="text-sm rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Solicitud enviada — pendiente de revisión. Tu matrícula:{" "}
                <strong>{profile.matriculaNumber}</strong>
              </p>
            ) : (
              <VetUpgradeForm />
            )}
          </section>
        )}

        {profile?.role === "vet" && (
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              Profesional veterinario
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Ya sos veterinario verificado en DIM.
            </p>
          </section>
        )}

        {/* Card B — Crear Organización */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              Crear Organización
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Refugios, clínicas y redes de rescate pueden crear su panel organizacional en DIM.
            </p>
          </div>

          {adminMembership ? (
            <Link
              href="/refugio"
              className="flex items-center justify-between rounded border border-neutral-200 dark:border-neutral-800 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
            >
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                  Ya administrás una organización
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                  {adminMembership.organization.displayName}
                </p>
              </div>
              <span className="text-neutral-400 dark:text-neutral-600" aria-hidden>
                →
              </span>
            </Link>
          ) : (
            <OrgCreateForm />
          )}
        </section>

        <div className="pt-2">
          <Link
            href="/mis-mascotas"
            className="text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            ← Volver a mis mascotas
          </Link>
        </div>
      </div>
    </main>
  );
}
