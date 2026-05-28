// /admin/servicios — admin-facing universal queue of ALL pending service offerings (Fase 9).
//
// Admin sees every pending offering regardless of jurisdiction — acts as both
// primary approver when no govt covers a locality and as monitoring fallback.

import { eq } from "drizzle-orm";
import Link from "next/link";

import { db, organizations, profiles, serviceOfferings } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

export default async function AdminServiciosPage() {
  await requireAdminOrRedirect();

  const pendingOfferings = await db
    .select({
      offering: serviceOfferings,
      org: { displayName: organizations.displayName, publicToken: organizations.publicToken },
      provider: { displayName: profiles.displayName, matriculaNumber: profiles.matriculaNumber },
    })
    .from(serviceOfferings)
    .leftJoin(organizations, eq(organizations.id, serviceOfferings.organizationId))
    .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
    .where(eq(serviceOfferings.status, "pending_approval"))
    .orderBy(serviceOfferings.submittedAt);

  const subtitle =
    pendingOfferings.length === 0
      ? "No hay servicios pendientes de revisión."
      : `${pendingOfferings.length} servicio${pendingOfferings.length === 1 ? "" : "s"} pendiente${pendingOfferings.length === 1 ? "" : "s"} de revisión.`;

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Servicios pendientes
          </h1>
          <p className="text-sm text-gob-text-gray ">{subtitle}</p>
          <p className="text-xs text-gob-text-muted ">
            Vista universal — incluye todas las jurisdicciones.
          </p>
        </header>

        {pendingOfferings.length === 0 ? (
          <p className="text-sm text-gob-text-muted ">
            Cuando lleguen nuevas solicitudes vas a verlas acá.
          </p>
        ) : (
          <ul className="space-y-2">
            {pendingOfferings.map(({ offering, org, provider }) => {
              const providerLabel =
                offering.organizationId && org
                  ? org.displayName
                  : provider
                    ? `Dr/a. ${provider.displayName}${provider.matriculaNumber ? ` · Mat. ${provider.matriculaNumber}` : ""}`
                    : "Profesional independiente";

              const kindLabel =
                findServiceKind(offering.serviceKind)?.label ?? offering.serviceKind;
              const location = [offering.jurisdictionLocality, offering.jurisdictionProvince]
                .filter(Boolean)
                .join(", ");

              return (
                <li key={offering.id} className="rounded-lg border border-gob-border  px-4 py-3">
                  <Link
                    href={`/admin/servicios/${offering.publicToken}`}
                    className="flex items-start justify-between gap-3 group"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-gob-text ">{offering.displayName}</p>
                      <p className="text-xs text-gob-text-muted ">
                        {providerLabel} · {kindLabel}
                        {location ? ` · ${location}` : ""}
                        {` · Capacidad: ${offering.slotCapacity}`}
                      </p>
                      <p className="text-[10px] text-gob-text-muted  font-mono">
                        {offering.publicToken} ·{" "}
                        {new Date(offering.submittedAt).toLocaleDateString("es-AR")}
                      </p>
                    </div>
                    <span
                      className="text-gob-text-muted group-hover:text-gob-text-gray "
                      aria-hidden
                    >
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
