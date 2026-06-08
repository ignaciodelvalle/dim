// Org portal — service offerings list. Shows every offering for the org
// (pending, approved, rejected) ordered by submission date descending.
// Members with service_offering.create can create new ones.

import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { db, serviceOfferings } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending_approval: {
    label: "Pendiente",
    className: "bg-gob-warning/10 text-gob-warning-text  ",
  },
  approved: {
    label: "Aprobado",
    className: "bg-gob-success/10 text-gob-success  ",
  },
  rejected: {
    label: "Rechazado",
    className: "bg-gob-danger/10 text-gob-danger  ",
  },
  paused: {
    label: "Pausado",
    className: "bg-gob-surface-alt text-gob-text  ",
  },
  archived: {
    label: "Archivado",
    className: "bg-gob-surface-alt text-gob-text  ",
  },
};

export default async function ServiciosPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  const canCreate = granted.has("service_offering.create");

  const offerings = await db
    .select()
    .from(serviceOfferings)
    .where(eq(serviceOfferings.organizationId, organization.id))
    .orderBy(desc(serviceOfferings.submittedAt));

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-gob-text-muted">
              {organization.displayName}
            </p>
            <h1 className="text-3xl font-semibold">Mis servicios</h1>
            <p className="text-sm text-gob-text-gray ">
              {offerings.length === 0
                ? "Todavía no hay servicios registrados."
                : `${offerings.length} servicio${offerings.length === 1 ? "" : "s"} registrado${offerings.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          {canCreate && (
            <Link
              href={`/org/${orgToken}/servicios/nuevo`}
              className="px-4 py-2 rounded bg-gob-primary text-white   text-sm"
            >
              + Crear servicio
            </Link>
          )}
        </header>

        {!canCreate && offerings.length === 0 && (
          <p className="text-sm rounded border border-gob-warning bg-gob-warning/10 px-3 py-2 text-gob-warning-text   ">
            Para crear servicios necesitás el permiso{" "}
            <code className="text-xs">service_offering.create</code>. Pedíselo a un administrador
            desde el panel.
          </p>
        )}

        {offerings.length > 0 && (
          <ul className="divide-y divide-gob-border  rounded border border-gob-border ">
            {offerings.map((o) => {
              const kind = findServiceKind(o.serviceKind);
              const badge = STATUS_BADGE[o.status] ?? STATUS_BADGE.pending_approval;
              return (
                <li key={o.id}>
                  <Link
                    href={`/org/${orgToken}/servicios/${o.publicToken}`}
                    className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-gob-surface-alt  transition"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">{o.displayName}</p>
                      <p className="text-xs text-gob-text-muted">
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

        <footer className="pt-4 border-t border-gob-border ">
          <Link href={`/org/${orgToken}`} className="text-sm text-gob-text-gray underline ">
            ← Volver al panel
          </Link>
        </footer>
      </div>
    </main>
  );
}
