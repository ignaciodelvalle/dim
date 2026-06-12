// Org portal landing — shows the active organization, the employee's role,
// and the set of capabilities they currently hold. Non-admins can request any
// non-granted capability inline; admins see a link to the approval queue.

import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";

import {
  OpBreach,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpCodeBadge,
  OpKpi,
  OpPill,
} from "@/components/ui/dashboard";
import {
  type OrganizationCapability,
  cases,
  db,
  fosterProposals,
  organizationCapabilityGrants,
} from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getProfileCached } from "@/lib/request-cache";
import { CAPABILITY_CATALOG } from "@/src/modules/organizations/domain/capabilities";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

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

const STATE_PILL_TONE: Record<CapabilityState["kind"], "ok" | "open" | "danger" | "neutral"> = {
  granted: "ok",
  pending: "open",
  denied: "danger",
  revoked: "danger",
  none: "neutral",
};

const STATE_PILL_LABEL: Record<CapabilityState["kind"], string> = {
  granted: "Concedido",
  pending: "Pendiente",
  denied: "Denegado",
  revoked: "Revocado",
  none: "No concedido",
};

const STATE_DOT: Record<CapabilityState["kind"], string> = {
  granted: "bg-ln-op-ok",
  pending: "bg-ln-op-warn",
  denied: "bg-ln-op-danger",
  revoked: "bg-ln-op-danger",
  none: "bg-ln-op-line",
};

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { user, organization, membership } = await requireOrgAccessByToken(orgToken);

  // getProfileCached is warmed by the org layout's call in the same render pass.
  const profile = await getProfileCached(user.id);
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
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Panel de {ORG_TYPE_LABELS[organization.orgType] ?? "organización"}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">{organization.displayName}</h1>
        <p className="text-[13px] text-ln-op-mute">
          Actuando como{" "}
          <strong className="text-ln-op-ink-2">
            {ROLE_LABELS[membership.role] ?? membership.role}
          </strong>
          {membership.title ? ` — ${membership.title}` : ""}
          {" · "}
          {userRole === "admin" && (
            <Link href="/admin" className="text-ln-op-azul hover:underline">
              Admin
            </Link>
          )}
          {(userRole === "govt" || userRole === "admin") && (
            <>
              {" · "}
              <Link href="/gob" className="text-ln-op-azul hover:underline">
                Gobierno
              </Link>
            </>
          )}
        </p>
        {!organization.verified && (
          <OpBreach
            title="Verificación pendiente"
            detail="Los eventos que registres se marcarán como no verificados hasta que la documentación sea aprobada."
          />
        )}
      </header>

      {/* Sprint 5 PR-047 — live counts surface so admins see pending work
          at a glance. Each KPI links to the surface that resolves it. */}
      <section aria-label="Pendientes del refugio" className="grid grid-cols-3 gap-3">
        <OpKpi
          label="Casos abiertos"
          value={counts.openCases}
          tone={counts.openCases > 0 ? "warn" : "neutral"}
          href={`/org/${orgToken}/casos`}
        />
        <OpKpi
          label="Transferencias pendientes"
          value={counts.pendingTransfers}
          tone={counts.pendingTransfers > 0 ? "warn" : "neutral"}
          href={`/org/${orgToken}/transferencias/recibidas`}
        />
        <OpKpi
          label="Propuestas de tránsito"
          value={counts.pendingFosterProposals}
          tone={counts.pendingFosterProposals > 0 ? "warn" : "neutral"}
          href={`/org/${orgToken}/voluntarios/propuestas`}
        />
      </section>

      {/* Capability action cards */}
      {(canReadHeld || canIntake || canReviewAdoptions || canAssignFoster) && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {canReadHeld && (
            <Link
              href={`/org/${orgToken}/mascotas`}
              className="block rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
            >
              <p className="text-[13px] font-semibold text-ln-op-ink">Animales en custodia</p>
              <p className="text-[12px] text-ln-op-mute mt-1">
                Listado de animales bajo custodia activa de la organización.
              </p>
            </Link>
          )}
          {canIntake && (
            <Link
              href={`/org/${orgToken}/intake`}
              className="block rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
            >
              <p className="text-[13px] font-semibold text-ln-op-ink">Registrar ingreso</p>
              <p className="text-[12px] text-ln-op-mute mt-1">
                Dar de alta un animal que entra a custodia del refugio.
              </p>
            </Link>
          )}
          {canReviewAdoptions && (
            <Link
              href={`/org/${orgToken}/checkins`}
              className="block rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
            >
              <p className="text-[13px] font-semibold text-ln-op-ink">Check-ins post-adopción</p>
              <p className="text-[12px] text-ln-op-mute mt-1">
                Seguimiento de los adoptantes en las ventanas pactadas.
              </p>
            </Link>
          )}
          {canAssignFoster && (
            <>
              <Link
                href={`/org/${orgToken}/voluntarios`}
                className="block rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">Pool de voluntarios</p>
                <p className="text-[12px] text-ln-op-mute mt-1">
                  Buscar voluntarios y proponer tránsitos.
                </p>
              </Link>
              <Link
                href={`/org/${orgToken}/voluntarios/propuestas`}
                className="block rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">Propuestas emitidas</p>
                <p className="text-[12px] text-ln-op-mute mt-1">
                  Estado de las propuestas de tránsito que enviaste.
                </p>
              </Link>
              <Link
                href={`/org/${orgToken}/transitos`}
                className="block rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">Tránsitos activos</p>
                <p className="text-[12px] text-ln-op-mute mt-1">
                  Mascotas con tránsito en curso (pool, miembro o vecino).
                </p>
              </Link>
            </>
          )}
          {canIntake && (
            <Link
              href={`/org/${orgToken}/pets/no-aptas`}
              className="block rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
            >
              <p className="text-[13px] font-semibold text-ln-op-ink">
                Mascotas no aptas para adopción
              </p>
              <p className="text-[12px] text-ln-op-mute mt-1">
                Animales marcados como no aptos, agrupados por motivo.
              </p>
            </Link>
          )}
        </section>
      )}

      {/* Permissions table */}
      <OpCard>
        <OpCardHead
          title="Tus permisos"
          actions={
            <div className="flex items-center gap-2">
              {isAdmin && <OpPill tone="ok">Admin · todos los permisos</OpPill>}
              {canDecideRequests && (
                <Link
                  href={`/org/${orgToken}/admin/permisos`}
                  className="text-[12px] text-ln-op-azul hover:underline no-underline"
                >
                  Revisar solicitudes →
                </Link>
              )}
            </div>
          }
        />
        <OpCardBody className="p-0">
          <ul className="divide-y divide-ln-op-line">
            {CAPABILITY_CATALOG.map((entry) => {
              const state = stateFor(entry.capability);
              const showRequestForm =
                !isAdmin &&
                (state.kind === "none" || state.kind === "denied" || state.kind === "revoked");
              return (
                <li key={entry.capability} className="flex items-start gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${STATE_DOT[state.kind]}`}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[13px] font-medium text-ln-op-ink">
                      {entry.label}
                      <OpCodeBadge tone="neutral">{entry.capability}</OpCodeBadge>
                    </p>
                    <p className="text-[12px] text-ln-op-mute">{entry.description}</p>
                    {(state.kind === "denied" || state.kind === "revoked") && state.reason && (
                      <p className="text-[12px] italic text-ln-op-faint">Motivo: {state.reason}</p>
                    )}
                    {showRequestForm && (
                      <div className="pt-1">
                        <RequestCapabilityForm capability={entry.capability} label={entry.label} />
                      </div>
                    )}
                  </div>
                  <OpPill tone={STATE_PILL_TONE[state.kind]}>{STATE_PILL_LABEL[state.kind]}</OpPill>
                </li>
              );
            })}
          </ul>
        </OpCardBody>
      </OpCard>
    </div>
  );
}
