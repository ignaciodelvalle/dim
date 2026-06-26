// /admin/servicios — admin-facing universal queue of ALL pending service offerings (Fase 9).
//
// Admin sees every pending offering regardless of jurisdiction — acts as both
// primary approver when no govt covers a locality and as monitoring fallback.

import { eq } from "drizzle-orm";
import Link from "next/link";

import { OpCard, OpCardBody, OpCodeBadge, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { db, organizations, profiles, serviceOfferings } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { findServiceKind } from "@/lib/service-kinds";

export default async function AdminServiciosPage() {
  await requireAdminOrRedirect();

  // Admin context: global scope, trailing 12m — for DashboardFreshnessFooter.
  const adminCtx = buildProjectionContext({ role: "admin" }, [], windows.trailing12m());

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
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Servicios
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Servicios pendientes</h1>
        <p className="text-[13px] text-ln-op-ink-2">{subtitle}</p>
        <p className="text-[11px] text-ln-op-mute">
          Vista universal — incluye todas las jurisdicciones.
        </p>
      </header>

      <OpKpi
        label="Pendientes de revisión"
        value={pendingOfferings.length}
        tone={pendingOfferings.length > 0 ? "warn" : "neutral"}
        info={{
          definition: "Ofrecimientos de servicios en estado 'pending_approval' en este momento.",
          caveat: "Vista universal — incluye todas las jurisdicciones.",
        }}
      />

      {pendingOfferings.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">
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

            const kindLabel = findServiceKind(offering.serviceKind)?.label ?? offering.serviceKind;
            const location = [offering.jurisdictionLocality, offering.jurisdictionProvince]
              .filter(Boolean)
              .join(", ");

            return (
              <li key={offering.id}>
                <Link
                  href={`/admin/servicios/${offering.publicToken}`}
                  className="block no-underline"
                >
                  <OpCard>
                    <OpCardBody>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[13px] font-medium text-ln-op-ink">
                            {offering.displayName}
                          </p>
                          <p className="text-sm text-ln-op-mute">
                            {providerLabel} {"·"} {kindLabel}
                            {location ? ` · ${location}` : ""}
                            {` · Capacidad: ${offering.slotCapacity}`}
                          </p>
                          <OpCodeBadge tone="neutral">{offering.publicToken}</OpCodeBadge>
                          <span className="ml-2 text-[11px] text-ln-op-mute">
                            {new Date(offering.submittedAt).toLocaleDateString("es-AR")}
                          </span>
                        </div>
                        <span className="text-ln-op-mute" aria-hidden>
                          {">"}
                        </span>
                      </div>
                    </OpCardBody>
                  </OpCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <DashboardFreshnessFooter ctx={adminCtx} />
    </div>
  );
}
