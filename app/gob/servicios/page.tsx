// /gob/servicios — govt-facing queue of pending service offerings within coverage (Fase 9).
//
// Shows service_offerings with status='pending_approval' in localities the
// current govt user covers (via govt_assignments). Admins see all pending
// offerings (no jurisdiction filter — universal scope).

import { type SQL, and, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { db, organizations, profiles, serviceOfferings } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { jurisdictionPairClause } from "@/lib/metrics/scope";
import { findServiceKind } from "@/lib/reference/service-kinds";
import { portalBase } from "@/lib/ui/portal-base";
import { formatDateShort } from "@/lib/utils/format";

export default async function GobServiciosPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const base = await portalBase();

  // Govt with no assignments: nothing to review. Early-return keeps the query
  // out of the picture entirely (and avoids a sql`false` scan).
  if (profile.role !== "admin" && jurisdictions.length === 0) {
    return (
      <div className="space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            MiMAR Gobierno · Servicios
          </p>
          <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
            Servicios pendientes
          </h1>
        </header>
        <LnEmptyState
          icon="usuarios"
          title="Sin localidades asignadas"
          description="No tenés localidades asignadas. Contactá a un administrador para recibir cobertura jurisdiccional."
        />
      </div>
    );
  }

  // Jurisdiction scope is enforced as a SQL predicate, NOT a JS post-filter —
  // a govt operator must never READ provider PII rows outside their coverage at
  // the DB level (AGENTS.md). Admin = universal (no scope clause); govt = OR of
  // (province,locality) pairs pushed into the WHERE.
  const baseCondition = eq(serviceOfferings.status, "pending_approval");
  const scopeFilter: SQL | undefined =
    profile.role === "admin"
      ? undefined
      : (jurisdictionPairClause(
          jurisdictions,
          sql`${serviceOfferings.jurisdictionProvince}`,
          sql`${serviceOfferings.jurisdictionLocality}`,
        ) ?? sql`false`);

  const whereClause = scopeFilter ? and(baseCondition, scopeFilter) : baseCondition;

  const pendingOfferings = await db
    .select({
      offering: serviceOfferings,
      org: { displayName: organizations.displayName, publicToken: organizations.publicToken },
      provider: { displayName: profiles.displayName, matriculaNumber: profiles.matriculaNumber },
    })
    .from(serviceOfferings)
    .leftJoin(organizations, eq(organizations.id, serviceOfferings.organizationId))
    .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
    .where(whereClause)
    .orderBy(serviceOfferings.submittedAt);

  const subtitle =
    pendingOfferings.length === 0
      ? "No hay servicios pendientes de revisión en tu cobertura."
      : `${pendingOfferings.length} servicio${pendingOfferings.length === 1 ? "" : "s"} pendiente${pendingOfferings.length === 1 ? "" : "s"} de revisión.`;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          MiMAR Gobierno · Servicios
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Servicios pendientes
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">{subtitle}</p>
      </header>

      {pendingOfferings.length === 0 ? (
        <LnEmptyState
          title="No hay servicios pendientes de revisión"
          description="Cuando lleguen nuevas solicitudes vas a verlas acá."
        />
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
                <OpCard>
                  <OpCardBody>
                    <Link
                      href={`${base}/servicios/${offering.publicToken}`}
                      className="flex items-start justify-between gap-3 group no-underline"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[13px] font-medium text-ln-op-ink">
                          {offering.displayName}
                        </p>
                        <p className="text-sm text-ln-op-mute">
                          {providerLabel} · {kindLabel}
                          {location ? ` · ${location}` : ""}
                          {` · Capacidad: ${offering.slotCapacity}`}
                        </p>
                        <p className="text-xs text-ln-op-mute font-mono">
                          {offering.publicToken} · {formatDateShort(offering.submittedAt)}
                        </p>
                      </div>
                      <OpPill tone="open">Pendiente</OpPill>
                    </Link>
                  </OpCardBody>
                </OpCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
