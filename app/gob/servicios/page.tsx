// /gob/servicios — govt-facing queue of pending service offerings within coverage (Fase 9).
//
// Shows service_offerings with status='pending_approval' in localities the
// current govt user covers (via govt_assignments). Admins see all pending
// offerings (no jurisdiction filter — universal scope).

import { eq } from "drizzle-orm";
import Link from "next/link";

import { db, organizations, profiles, serviceOfferings } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

export default async function GobServiciosPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  // Build the filter: govt sees only their localities; admin sees all pending.
  const baseCondition = eq(serviceOfferings.status, "pending_approval");

  let pendingOfferings;

  if (profile.role === "admin") {
    pendingOfferings = await db
      .select({
        offering: serviceOfferings,
        org: { displayName: organizations.displayName, publicToken: organizations.publicToken },
        provider: { displayName: profiles.displayName, matriculaNumber: profiles.matriculaNumber },
      })
      .from(serviceOfferings)
      .leftJoin(organizations, eq(organizations.id, serviceOfferings.organizationId))
      .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
      .where(baseCondition)
      .orderBy(serviceOfferings.submittedAt);
  } else {
    // Govt: scope to assigned localities (requireAdminOrGovtOrRedirect already
    // filters to non-revoked assignments, so jurisdictions is already active).
    if (jurisdictions.length === 0) {
      return (
        <main className="px-6 py-8">
          <div className="max-w-5xl mx-auto space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Servicios pendientes
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              No tenés localidades asignadas. Contactá a un administrador para recibir cobertura
              jurisdiccional.
            </p>
          </div>
        </main>
      );
    }

    // Fetch offerings where locality+province match any of the govt's assignments.
    // Done in JS after a broader query to avoid complex OR conditions.
    const localityPairs = jurisdictions.map((j) => ({
      province: j.province,
      locality: j.locality,
    }));

    const candidates = await db
      .select({
        offering: serviceOfferings,
        org: { displayName: organizations.displayName, publicToken: organizations.publicToken },
        provider: { displayName: profiles.displayName, matriculaNumber: profiles.matriculaNumber },
      })
      .from(serviceOfferings)
      .leftJoin(organizations, eq(organizations.id, serviceOfferings.organizationId))
      .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
      .where(baseCondition)
      .orderBy(serviceOfferings.submittedAt);

    pendingOfferings = candidates.filter((r) =>
      localityPairs.some(
        (lp) =>
          lp.province === r.offering.jurisdictionProvince &&
          lp.locality === r.offering.jurisdictionLocality,
      ),
    );
  }

  const subtitle =
    pendingOfferings.length === 0
      ? "No hay servicios pendientes de revisión en tu cobertura."
      : `${pendingOfferings.length} servicio${pendingOfferings.length === 1 ? "" : "s"} pendiente${pendingOfferings.length === 1 ? "" : "s"} de revisión.`;

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Servicios pendientes
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
        </header>

        {pendingOfferings.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
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
                <li
                  key={offering.id}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
                >
                  <Link
                    href={`/gob/servicios/${offering.publicToken}`}
                    className="flex items-start justify-between gap-3 group"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {offering.displayName}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">
                        {providerLabel} · {kindLabel}
                        {location ? ` · ${location}` : ""}
                        {` · Capacidad: ${offering.slotCapacity}`}
                      </p>
                      <p className="text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
                        {offering.publicToken} ·{" "}
                        {new Date(offering.submittedAt).toLocaleDateString("es-AR")}
                      </p>
                    </div>
                    <span
                      className="text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300"
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
