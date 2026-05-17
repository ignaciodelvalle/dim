// Org portal landing — shows the active organization, the employee's role,
// and the set of capabilities they currently hold. Non-admins can request any
// non-granted capability inline; admins see a link to the approval queue.

import { type OrganizationCapability, db, organizationCapabilityGrants } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { CAPABILITY_CATALOG, getGrantedCapabilities } from "@/lib/capabilities";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { RequestCapabilityForm } from "./RequestCapabilityForm";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador/a",
  coordinator: "Coordinador/a",
  member: "Miembro",
  volunteer: "Voluntario/a",
  foster: "Tránsito",
  vet_individual: "Veterinario/a",
};

const ORG_TYPE_LABELS: Record<string, string> = {
  clinic: "Clínica",
  shelter: "Refugio",
  rescue_network: "Red de rescate",
  sanitary_authority: "Autoridad sanitaria",
  other: "Organización",
};

type CapabilityState =
  | { kind: "granted" }
  | { kind: "pending" }
  | { kind: "denied"; reason: string | null }
  | { kind: "revoked"; reason: string | null }
  | { kind: "none" };

const STATE_BADGE: Record<CapabilityState["kind"], { label: string; className: string }> = {
  granted: {
    label: "Concedido",
    className: "text-emerald-700 dark:text-emerald-400",
  },
  pending: {
    label: "Pendiente",
    className: "text-amber-700 dark:text-amber-400",
  },
  denied: {
    label: "Denegado",
    className: "text-red-700 dark:text-red-400",
  },
  revoked: {
    label: "Revocado",
    className: "text-red-700 dark:text-red-400",
  },
  none: {
    label: "No concedido",
    className: "text-neutral-500",
  },
};

const STATE_DOT: Record<CapabilityState["kind"], string> = {
  granted: "bg-emerald-500",
  pending: "bg-amber-500",
  denied: "bg-red-500",
  revoked: "bg-red-500",
  none: "bg-neutral-300 dark:bg-neutral-700",
};

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);

  const granted = await getGrantedCapabilities(membership);
  const isAdmin = membership.role === "admin";
  const canDecideRequests = granted.has("capability.grant");
  const canReadHeld = granted.has("pet.read_held");
  const canIntake = granted.has("intake.create");
  const canReviewAdoptions = granted.has("adoption.review");

  // Load the most recent grant per capability for this membership so the row
  // shows the current state (pending / denied / revoked) when there's no
  // active approved grant. Admins skip this query — every capability is granted.
  const grantHistory = isAdmin
    ? []
    : await db
        .select({
          capability: organizationCapabilityGrants.capability,
          status: organizationCapabilityGrants.status,
          decisionReason: organizationCapabilityGrants.decisionReason,
          requestedAt: organizationCapabilityGrants.requestedAt,
        })
        .from(organizationCapabilityGrants)
        .where(eq(organizationCapabilityGrants.membershipId, membership.id))
        .orderBy(desc(organizationCapabilityGrants.requestedAt));

  const stateByCapability = new Map<string, CapabilityState>();
  for (const row of grantHistory) {
    if (stateByCapability.has(row.capability)) continue; // keep most-recent
    if (row.status === "approved") {
      stateByCapability.set(row.capability, { kind: "granted" });
    } else if (row.status === "pending") {
      stateByCapability.set(row.capability, { kind: "pending" });
    } else if (row.status === "denied") {
      stateByCapability.set(row.capability, { kind: "denied", reason: row.decisionReason });
    } else if (row.status === "revoked") {
      stateByCapability.set(row.capability, { kind: "revoked", reason: row.decisionReason });
    }
  }

  function stateFor(capability: OrganizationCapability): CapabilityState {
    if (granted.has(capability)) return { kind: "granted" };
    return stateByCapability.get(capability) ?? { kind: "none" };
  }

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            Panel de {ORG_TYPE_LABELS[organization.orgType] ?? "organización"}
          </p>
          <h1 className="text-3xl font-semibold">{organization.displayName}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Estás actuando como <strong>{ROLE_LABELS[membership.role] ?? membership.role}</strong>
            {membership.title ? ` — ${membership.title}` : ""}.
          </p>
          {!organization.verified && (
            <p className="text-sm rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Organización pendiente de verificación. Los eventos que registres se marcarán como no
              verificados hasta que la documentación sea aprobada.
            </p>
          )}
        </header>

        {(canReadHeld || canIntake || canReviewAdoptions) && (
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {canReadHeld && (
              <Link
                href={`/org/${orgToken}/mascotas`}
                className="rounded border border-neutral-200 dark:border-neutral-800 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
              >
                <p className="text-sm font-semibold">Animales en custodia</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Listado de animales bajo custodia activa de la organización.
                </p>
              </Link>
            )}
            {canIntake && (
              <Link
                href={`/org/${orgToken}/intake`}
                className="rounded border border-neutral-200 dark:border-neutral-800 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
              >
                <p className="text-sm font-semibold">Registrar ingreso</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Dar de alta un animal que entra a custodia del refugio.
                </p>
              </Link>
            )}
            {canReviewAdoptions && (
              <Link
                href={`/org/${orgToken}/checkins`}
                className="rounded border border-neutral-200 dark:border-neutral-800 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
              >
                <p className="text-sm font-semibold">Check-ins post-adopción</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Seguimiento de los adoptantes en las ventanas pactadas.
                </p>
              </Link>
            )}
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">Tus permisos</h2>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <span className="text-xs rounded-full bg-neutral-900 px-2 py-0.5 text-white dark:bg-white dark:text-neutral-900">
                  Admin · todos los permisos
                </span>
              )}
              {canDecideRequests && (
                <Link
                  href={`/org/${orgToken}/admin/permisos`}
                  className="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Revisar solicitudes
                </Link>
              )}
            </div>
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded border border-neutral-200 dark:border-neutral-800">
            {CAPABILITY_CATALOG.map((entry) => {
              const state = stateFor(entry.capability);
              const badge = STATE_BADGE[state.kind];
              const showRequestForm =
                !isAdmin &&
                (state.kind === "none" || state.kind === "denied" || state.kind === "revoked");
              return (
                <li key={entry.capability} className="flex items-start gap-3 px-3 py-3">
                  <span
                    aria-hidden
                    className={`mt-1 inline-block h-2 w-2 rounded-full ${STATE_DOT[state.kind]}`}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium">
                      {entry.label}
                      <span className="ml-2 text-xs text-neutral-500">{entry.capability}</span>
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {entry.description}
                    </p>
                    {(state.kind === "denied" || state.kind === "revoked") && state.reason && (
                      <p className="text-xs italic text-neutral-500">Motivo: {state.reason}</p>
                    )}
                    {showRequestForm && (
                      <div className="pt-1">
                        <RequestCapabilityForm capability={entry.capability} label={entry.label} />
                      </div>
                    )}
                  </div>
                  <span className={`text-xs shrink-0 ${badge.className}`}>{badge.label}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href="/mis-mascotas"
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver a mis mascotas
          </Link>
        </footer>
      </div>
    </main>
  );
}
