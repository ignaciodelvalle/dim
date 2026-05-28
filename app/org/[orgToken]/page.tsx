// Org portal landing — shows the active organization, the employee's role,
// and the set of capabilities they currently hold. Non-admins can request any
// non-granted capability inline; admins see a link to the approval queue.

import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";

import {
  type OrganizationCapability,
  cases,
  db,
  fosterProposals,
  organizationCapabilityGrants,
  profiles,
} from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { CAPABILITY_CATALOG, getGrantedCapabilities } from "@/lib/capabilities";

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
    className: "text-gob-success ",
  },
  pending: {
    label: "Pendiente",
    className: "text-gob-warning-text ",
  },
  denied: {
    label: "Denegado",
    className: "text-gob-danger ",
  },
  revoked: {
    label: "Revocado",
    className: "text-gob-danger ",
  },
  none: {
    label: "No concedido",
    className: "text-gob-text-muted",
  },
};

const STATE_DOT: Record<CapabilityState["kind"], string> = {
  granted: "bg-gob-success",
  pending: "bg-gob-warning",
  denied: "bg-gob-danger",
  revoked: "bg-gob-danger",
  none: "bg-gob-border-strong ",
};

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { user, organization, membership } = await requireOrgAccessByToken(orgToken);

  // Fetch profile role for the cross-portal nav rail.
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const userRole = profile?.role ?? "owner";

  const granted = await getGrantedCapabilities(membership);
  const isAdmin = membership.role === "admin";
  const canDecideRequests = granted.has("capability.grant");
  const canReadHeld = granted.has("pet.read_held");
  const canIntake = granted.has("intake.create");
  const canReviewAdoptions = granted.has("adoption.review");
  const canAssignFoster = granted.has("foster.assign");

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

  // Sprint 5 PR-047 — surface live counts so admins land on the panel and
  // immediately see what needs attention. Queries run in parallel.
  //
  // Note: the original plan included 'Check-ins pendientes' but the
  // reminders table is owner-scoped (no organization_id column today), so
  // counting checkins per-org would require joining against the adoption
  // chain. Deferred — the existing 'Check-ins post-adopción' link in the
  // capability grid below still surfaces the page.
  const [openCasesRow, pendingTransfersRow, pendingFosterRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(cases)
      .where(and(eq(cases.openedByOrganizationId, organization.id), eq(cases.status, "open"))),
    db
      .select({ n: count() })
      .from(cases)
      .where(
        and(
          eq(cases.caseKind, "custody_transfer_handshake"),
          eq(cases.receiverOrganizationId, organization.id),
          eq(cases.status, "open"),
        ),
      ),
    db
      .select({ n: count() })
      .from(fosterProposals)
      .where(
        and(
          eq(fosterProposals.organizationId, organization.id),
          eq(fosterProposals.status, "pending"),
        ),
      ),
  ]);
  const counts = {
    openCases: openCasesRow[0]?.n ?? 0,
    pendingTransfers: pendingTransfersRow[0]?.n ?? 0,
    pendingFosterProposals: pendingFosterRow[0]?.n ?? 0,
  };

  return (
    <main className="min-h-screen bg-white ">
      {/* Cross-portal nav rail */}
      <nav className="border-b border-gob-border  px-6 py-2">
        <div className="max-w-3xl mx-auto flex items-center gap-4 text-sm text-gob-text-gray ">
          <Link href="/mis-mascotas" className="hover:text-gob-text  transition-colors">
            Mis mascotas
          </Link>
          <span className="text-gob-border-strong " aria-hidden>
            ·
          </span>
          <Link href="/cuenta" className="hover:text-gob-text  transition-colors">
            Mi cuenta
          </Link>
          {userRole === "admin" && (
            <>
              <span className="text-gob-border-strong " aria-hidden>
                ·
              </span>
              <Link href="/admin" className="hover:text-gob-text  transition-colors">
                Admin
              </Link>
            </>
          )}
          {(userRole === "govt" || userRole === "admin") && (
            <>
              <span className="text-gob-border-strong " aria-hidden>
                ·
              </span>
              <Link href="/gob" className="hover:text-gob-text  transition-colors">
                Gobierno
              </Link>
            </>
          )}
        </div>
      </nav>

      <div className="p-6">
        <div className="max-w-3xl mx-auto space-y-8">
          <header className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-gob-text-muted">
              Panel de {ORG_TYPE_LABELS[organization.orgType] ?? "organización"}
            </p>
            <h1 className="text-3xl font-semibold">{organization.displayName}</h1>
            <p className="text-sm text-gob-text-gray ">
              Estás actuando como <strong>{ROLE_LABELS[membership.role] ?? membership.role}</strong>
              {membership.title ? ` — ${membership.title}` : ""}.
            </p>
            {!organization.verified && (
              <p className="text-sm rounded border border-gob-warning bg-gob-warning/10 px-3 py-2 text-gob-warning-text   ">
                Organización pendiente de verificación. Los eventos que registres se marcarán como
                no verificados hasta que la documentación sea aprobada.
              </p>
            )}
          </header>

          {/* Sprint 5 PR-047 — live counts surface so admins see pending work
              at a glance. Each card links to the surface that resolves it. */}
          <section aria-label="Pendientes del refugio" className="grid grid-cols-3 gap-3">
            <Link
              href={`/org/${orgToken}/casos`}
              className="rounded-lg border border-gob-border  p-3 text-center hover:bg-gob-surface-alt  transition"
            >
              <p className="text-2xl font-semibold tabular-nums">{counts.openCases}</p>
              <p className="text-xs text-gob-text-gray  mt-1">Casos abiertos</p>
            </Link>
            <Link
              href={`/org/${orgToken}/transferencias/recibidas`}
              className="rounded-lg border border-gob-border  p-3 text-center hover:bg-gob-surface-alt  transition"
            >
              <p className="text-2xl font-semibold tabular-nums">{counts.pendingTransfers}</p>
              <p className="text-xs text-gob-text-gray  mt-1">Transferencias pendientes</p>
            </Link>
            <Link
              href={`/org/${orgToken}/voluntarios/propuestas`}
              className="rounded-lg border border-gob-border  p-3 text-center hover:bg-gob-surface-alt  transition"
            >
              <p className="text-2xl font-semibold tabular-nums">{counts.pendingFosterProposals}</p>
              <p className="text-xs text-gob-text-gray  mt-1">Propuestas de tránsito</p>
            </Link>
          </section>

          {(canReadHeld || canIntake || canReviewAdoptions || canAssignFoster) && (
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {canReadHeld && (
                <Link
                  href={`/org/${orgToken}/mascotas`}
                  className="rounded border border-gob-border  p-4 hover:bg-gob-surface-alt  transition"
                >
                  <p className="text-sm font-semibold">Animales en custodia</p>
                  <p className="text-xs text-gob-text-gray  mt-1">
                    Listado de animales bajo custodia activa de la organización.
                  </p>
                </Link>
              )}
              {canIntake && (
                <Link
                  href={`/org/${orgToken}/intake`}
                  className="rounded border border-gob-border  p-4 hover:bg-gob-surface-alt  transition"
                >
                  <p className="text-sm font-semibold">Registrar ingreso</p>
                  <p className="text-xs text-gob-text-gray  mt-1">
                    Dar de alta un animal que entra a custodia del refugio.
                  </p>
                </Link>
              )}
              {canReviewAdoptions && (
                <Link
                  href={`/org/${orgToken}/checkins`}
                  className="rounded border border-gob-border  p-4 hover:bg-gob-surface-alt  transition"
                >
                  <p className="text-sm font-semibold">Check-ins post-adopción</p>
                  <p className="text-xs text-gob-text-gray  mt-1">
                    Seguimiento de los adoptantes en las ventanas pactadas.
                  </p>
                </Link>
              )}
              {canAssignFoster && (
                <>
                  <Link
                    href={`/org/${orgToken}/voluntarios`}
                    className="rounded border border-gob-border  p-4 hover:bg-gob-surface-alt  transition"
                  >
                    <p className="text-sm font-semibold">Pool de voluntarios</p>
                    <p className="text-xs text-gob-text-gray  mt-1">
                      Buscar voluntarios y proponer tránsitos.
                    </p>
                  </Link>
                  <Link
                    href={`/org/${orgToken}/voluntarios/propuestas`}
                    className="rounded border border-gob-border  p-4 hover:bg-gob-surface-alt  transition"
                  >
                    <p className="text-sm font-semibold">Propuestas emitidas</p>
                    <p className="text-xs text-gob-text-gray  mt-1">
                      Estado de las propuestas de tránsito que enviaste.
                    </p>
                  </Link>
                  <Link
                    href={`/org/${orgToken}/transitos`}
                    className="rounded border border-gob-border  p-4 hover:bg-gob-surface-alt  transition"
                  >
                    <p className="text-sm font-semibold">Tránsitos activos</p>
                    <p className="text-xs text-gob-text-gray  mt-1">
                      Mascotas con tránsito en curso (pool, miembro o vecino).
                    </p>
                  </Link>
                </>
              )}
              {canIntake && (
                <Link
                  href={`/org/${orgToken}/pets/no-aptas`}
                  className="rounded border border-gob-border  p-4 hover:bg-gob-surface-alt  transition"
                >
                  <p className="text-sm font-semibold">Mascotas no aptas para adopción</p>
                  <p className="text-xs text-gob-text-gray  mt-1">
                    Animales marcados como no aptos, agrupados por motivo.
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
                  <span className="text-xs rounded-full bg-gob-primary px-2 py-0.5 text-white  ">
                    Admin · todos los permisos
                  </span>
                )}
                {canDecideRequests && (
                  <Link
                    href={`/org/${orgToken}/admin/permisos`}
                    className="text-xs px-2 py-1 rounded border border-gob-border-strong  hover:bg-gob-surface-alt "
                  >
                    Revisar solicitudes
                  </Link>
                )}
              </div>
            </div>
            <ul className="divide-y divide-gob-border  rounded border border-gob-border ">
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
                        <span className="ml-2 text-xs text-gob-text-muted">{entry.capability}</span>
                      </p>
                      <p className="text-xs text-gob-text-gray ">{entry.description}</p>
                      {(state.kind === "denied" || state.kind === "revoked") && state.reason && (
                        <p className="text-xs italic text-gob-text-muted">Motivo: {state.reason}</p>
                      )}
                      {showRequestForm && (
                        <div className="pt-1">
                          <RequestCapabilityForm
                            capability={entry.capability}
                            label={entry.label}
                          />
                        </div>
                      )}
                    </div>
                    <span className={`text-xs shrink-0 ${badge.className}`}>{badge.label}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
