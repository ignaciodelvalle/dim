// /pro/servicios — list of service offerings created by this vet (Fase 2.5).
// Gated by requireVetProviderOrRedirect (role='vet' + matriculaVerified=true).
// When professional.provider lands as an approval-gated capability, update
// requireVetProviderOrRedirect — no changes needed here.

import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { db, serviceOfferings } from "@/db";
import { requireVetProviderOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending_approval: {
    label: "Pendiente",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  approved: {
    label: "Aprobado",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  rejected: {
    label: "Rechazado",
    className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
  paused: {
    label: "Pausado",
    className: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
  },
  archived: {
    label: "Archivado",
    className: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
  },
};

export default async function ProServiciosPage() {
  const { user } = await requireVetProviderOrRedirect();

  const offerings = await db
    .select()
    .from(serviceOfferings)
    .where(eq(serviceOfferings.providerUserId, user.id))
    .orderBy(desc(serviceOfferings.submittedAt));

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Portal profesional</p>
            <h1 className="text-3xl font-semibold">Mis servicios</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {offerings.length === 0
                ? "Todavía no publicaste ningún servicio como veterinario independiente."
                : `${offerings.length} servicio${offerings.length === 1 ? "" : "s"} registrado${offerings.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Link
            href="/pro/servicios/nuevo"
            className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm"
          >
            + Crear servicio
          </Link>
        </header>

        {offerings.length > 0 && (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded border border-neutral-200 dark:border-neutral-800">
            {offerings.map((o) => {
              const kind = findServiceKind(o.serviceKind);
              const badge = STATUS_BADGE[o.status] ?? STATUS_BADGE.pending_approval;
              return (
                <li key={o.id}>
                  <Link
                    href={`/pro/servicios/${o.publicToken}`}
                    className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">{o.displayName}</p>
                      <p className="text-xs text-neutral-500">
                        {kind?.label ?? o.serviceKind}
                        {o.priceArs !== null
                          ? ` · $${Number(o.priceArs).toLocaleString("es-AR")}`
                          : " · Campaña gratuita"}
                        {" · "}
                        {o.durationMinutes} min
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link href="/pro" className="text-sm text-neutral-600 underline dark:text-neutral-400">
            ← Volver al portal profesional
          </Link>
        </footer>
      </div>
    </main>
  );
}
