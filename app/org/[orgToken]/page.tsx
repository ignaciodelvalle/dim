// Org portal landing — operations dashboard (Wave 3 Item 17).
//
// Layout:
//   Header: org name + verification status
//   OrgSetupChecklist (Wave 3 Item 19): guided first-run, auto-hides when complete
//   KPI row (4): Ocupación · Ingresos (semana) · Disponibles · Adopciones en curso
//   OpCard "Requieren acción": prioritized custody queue (overdue health / long-stay)
//   OpCard "Pendientes": casos · transferencias · propuestas (existing 3 KPIs, demoted)
//   Capability action cards
//   Permissions table
//
// Spec: docs/superpowers/specs/2026-06-18-wave3-org-ops-handoff.md (Items 17, 19)
// Depends on Item 16: lib/org-census.ts (fetchOrgCensus, computeOccupancyBreakdown)

import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { Icon } from "@/components/Icon";
import { OrgSetupChecklist } from "@/components/OrgSetupChecklist";
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
  organizationCoverage,
  organizationMemberships,
  serviceOfferings,
} from "@/db";
import { computeOccupancyBreakdown, fetchOrgCensus } from "@/lib/analytics/org-census";
import {
  actionReasonIcon,
  actionReasonLabel,
  fetchActiveAdoptions,
  fetchAvailableForAdoption,
  fetchIntakesLastWeek,
  fetchRequiresAction,
  fetchTodayAgenda,
} from "@/lib/analytics/org-dashboard";
import { requireOrgAccessByToken } from "@/lib/infra/auth-guards";
import { deriveSetupSteps, isSetupComplete } from "@/lib/infra/org-setup-checklist";
import { getProfileCached } from "@/lib/infra/request-cache";
import {
  CAPABILITY_CATALOG,
  capabilityAppliesToOrgType,
} from "@/src/modules/organizations/domain/capabilities";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { RequestCapabilityForm } from "./RequestCapabilityForm";
import { SoloVetAgendaLanding } from "./SoloVetAgendaLanding";

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

// ---------------------------------------------------------------------------
// Occupancy KPI helpers (pure)
// ---------------------------------------------------------------------------

type OccupancyDisplay = {
  value: string;
  sub: string | null;
  tone: "ok" | "warn" | "danger" | "neutral";
};

/**
 * Derive display-safe occupancy value + tone from the occupancy breakdown.
 * Reuses computeOccupancyBreakdown (Item 16) logic — no raw SQL here.
 */
function deriveOccupancyDisplay(
  total: { count: number; capacity: number | null; pct: number | null; overCapacity: boolean },
  noCapacityDeclared: boolean,
): OccupancyDisplay {
  if (total.count === 0 && noCapacityDeclared) {
    return { value: "—", sub: "Sin animales aún", tone: "neutral" };
  }
  if (noCapacityDeclared) {
    return {
      value: String(total.count),
      sub: "en custodia · sin capacidad declarada",
      tone: "neutral",
    };
  }
  const pct = total.pct ?? 0;
  const tone: OccupancyDisplay["tone"] = total.overCapacity ? "danger" : pct >= 80 ? "warn" : "ok";
  const sub = total.overCapacity
    ? `Sobre capacidad (${total.count} / ${total.capacity ?? 0})`
    : `${total.count} / ${total.capacity ?? 0} lugares`;
  return { value: `${pct}%`, sub, tone };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { user, organization, membership } = await requireOrgAccessByToken(orgToken);

  const profile = await getProfileCached(user.id);
  const userRole = profile?.role ?? "owner";

  const granted = await getGrantedCapabilities(membership);
  const isAdmin = membership.role === "admin";
  const orgType = organization.orgType;
  const isShelter = orgType === "shelter";
  const isClinic = orgType === "clinic";
  // Org-type specialization (#43 item 2): a granted capability is only surfaced
  // when it is also relevant to the org_type. This is what stops a clinic ADMIN
  // — who implicitly holds every capability — from seeing refugio modules
  // (Adopciones, Foster/Tránsitos, custodia). See capabilityAppliesToOrgType.
  const showCap = (capability: OrganizationCapability): boolean =>
    granted.has(capability) && capabilityAppliesToOrgType(capability, orgType);
  const isRehoming = orgType === "shelter" || orgType === "rescue_network";
  const canDecideRequests = granted.has("capability.grant");
  const canReadHeld = showCap("pet.read_held");
  const canIntake = showCap("intake.create");
  const canReviewAdoptions = showCap("adoption.review");
  const canAssignFoster = showCap("foster.assign");
  const canWriteEvents = granted.has("event.write");
  const canReportBite = granted.has("bite.report");

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
    if (stateByCapability.has(row.capability)) continue;
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

  const canCreateServices = granted.has("service_offering.create");

  // Setup checklist inputs (Item 19) — run in parallel with dashboard projections.
  const [coverageCountRow, memberCountRow, servicesCountRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(organizationCoverage)
      .where(eq(organizationCoverage.organizationId, organization.id)),
    db
      .select({ n: count() })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, organization.id)),
    canCreateServices
      ? db
          .select({ n: count() })
          .from(serviceOfferings)
          .where(eq(serviceOfferings.organizationId, organization.id))
      : Promise.resolve([{ n: 0 }]),
  ]);

  // Solo-clinic agenda-first landing (four-actor lean IA critique §3): a
  // one-person clinic with scheduling lands on today's agenda — the issuer's
  // daily loop — instead of the shelter-oriented ops dashboard below. Detected
  // by org SHAPE (clinic + single member), not by membership role: vet_individual
  // is a staff role usable inside multi-member clinics, while a real solo
  // practitioner is the sole admin of their own clinic (and thus holds every
  // capability). The org nav rail still exposes every other section.
  if (
    organization.orgType === "clinic" &&
    (memberCountRow[0]?.n ?? 0) === 1 &&
    granted.has("appointment.manage")
  ) {
    const todayAgenda = await fetchTodayAgenda(organization.id);
    return (
      <SoloVetAgendaLanding
        orgToken={orgToken}
        orgName={organization.displayName}
        appointments={todayAgenda}
      />
    );
  }

  const setupSteps = deriveSetupSteps({
    orgType: organization.orgType,
    hasCoverage: (coverageCountRow[0]?.n ?? 0) > 0,
    memberCount: memberCountRow[0]?.n ?? 1,
    canCreateServices,
    hasServices: (servicesCountRow[0]?.n ?? 0) > 0,
    hasCapacityDeclared:
      organization.capacityDogs !== null ||
      organization.capacityCats !== null ||
      organization.capacityOther !== null ||
      organization.capacityTotal !== null,
    isVerified: organization.verified,
  });

  const showChecklist = !isSetupComplete(setupSteps);

  // Dashboard projections — all run in parallel.
  // Occupancy requires fetchOrgCensus + org capacity columns (Item 16).
  const [openCasesRow, pendingTransfersRow, pendingFosterRow, census, actionItems] =
    await Promise.all([
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
      isShelter ? fetchOrgCensus(organization.id) : Promise.resolve(null),
      isShelter ? fetchRequiresAction(organization.id) : Promise.resolve([]),
    ]);

  // Shelter-only KPIs run in parallel.
  const [intakesLastWeek, availableForAdopt, activeAdoptions] = isShelter
    ? await Promise.all([
        fetchIntakesLastWeek(organization.id),
        fetchAvailableForAdoption(organization.id),
        fetchActiveAdoptions(organization.id),
      ])
    : [0, 0, 0];

  const pendingCounts = {
    openCases: openCasesRow[0]?.n ?? 0,
    pendingTransfers: pendingTransfersRow[0]?.n ?? 0,
    pendingFosterProposals: pendingFosterRow[0]?.n ?? 0,
  };

  // Occupancy breakdown — only meaningful for shelters with capacity columns.
  const occupancyBreakdown =
    isShelter && census !== null
      ? computeOccupancyBreakdown(census, {
          capacityDogs: organization.capacityDogs ?? null,
          capacityCats: organization.capacityCats ?? null,
          capacityOther: organization.capacityOther ?? null,
          capacityTotal: organization.capacityTotal ?? null,
        })
      : null;

  const occupancyDisplay = occupancyBreakdown
    ? deriveOccupancyDisplay(occupancyBreakdown.total, occupancyBreakdown.noCapacityDeclared)
    : null;

  // Role-first lead (four-actor lean IA critique §4): land a non-admin member in
  // their primary job, derived from granted capabilities. Admins keep the full
  // ops overview below. Priority follows the daily loop; each surface is one the
  // capability action cards already link to (no new routes).
  const primaryJob: { href: string; label: string; description: string } | null = (() => {
    if (isAdmin) return null;
    if (granted.has("appointment.manage"))
      return {
        href: `/org/${orgToken}/agenda`,
        label: "Agenda de hoy",
        description: "Tus turnos del día para atender.",
      };
    if (canAssignFoster)
      return {
        href: `/org/${orgToken}/transitos`,
        label: "Tránsitos activos",
        description: "Las mascotas en tránsito que coordinás.",
      };
    if (canReviewAdoptions)
      return {
        href: `/org/${orgToken}/checkins`,
        label: "Check-ins post-adopción",
        description: "El seguimiento de adoptantes que te toca.",
      };
    if (canIntake)
      return {
        href: `/org/${orgToken}/intake`,
        label: "Registrar ingreso",
        description: "Dar de alta animales que entran a custodia.",
      };
    if (canReadHeld)
      return {
        href: `/org/${orgToken}/mascotas`,
        label: "Animales en custodia",
        description: "El listado de animales a tu cargo.",
      };
    return null;
  })();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
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

      {/* Role-first lead (critique §4): a non-admin member's primary job, up top. */}
      {primaryJob && (
        <OpCard>
          <OpCardHead title="Tu tarea principal" />
          <OpCardBody className="p-0">
            <Link
              href={primaryJob.href}
              className="block p-4 no-underline transition-colors hover:bg-ln-op-stripe"
            >
              <p className="text-sm font-semibold text-ln-op-ink">{primaryJob.label}</p>
              <p className="mt-1 text-sm text-ln-op-mute">{primaryJob.description}</p>
            </Link>
          </OpCardBody>
        </OpCard>
      )}

      {/* Setup checklist (Item 19) — shown to admins until all steps complete. */}
      {showChecklist && isAdmin && (
        <OrgSetupChecklist steps={setupSteps} orgToken={orgToken} autoFocusFirst />
      )}

      {/* KPI row — shelter operations metrics (Item 17, shelters only) */}
      {isShelter && (
        <section
          aria-label="Métricas de operación"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {/* Ocupación — from Item 16 occupancy projection */}
          <OpKpi
            label="Ocupación"
            value={occupancyDisplay?.value ?? "—"}
            tone={occupancyDisplay?.tone ?? "neutral"}
            sub={occupancyDisplay?.sub ?? undefined}
            href={`/org/${orgToken}/censo`}
            info={{
              definition: "Porcentaje de ocupación sobre la capacidad máxima declarada.",
              formula: "animales en custodia / capacidad total × 100",
              caveat: "Solo disponible cuando la organización declaró su capacidad máxima.",
            }}
          />

          {/* Ingresos (semana) — consolidated: always renders OpKpi, empty-state via value="—" */}
          <OpKpi
            label="Ingresos (semana)"
            value={intakesLastWeek === 0 ? "—" : intakesLastWeek}
            tone={intakesLastWeek === 0 ? "neutral" : "blue"}
            sub={intakesLastWeek === 0 ? "Sin ingresos esta semana" : undefined}
            href={intakesLastWeek > 0 ? `/org/${orgToken}/intake` : undefined}
            info={{
              definition: "Cantidad de animales ingresados a custodia en los últimos 7 días.",
            }}
          />

          {/* Disponibles para adopción — consolidated */}
          <OpKpi
            label="Disponibles"
            value={availableForAdopt === 0 ? "—" : availableForAdopt}
            tone={availableForAdopt === 0 ? "neutral" : "ok"}
            sub={availableForAdopt === 0 ? "Sin animales disponibles" : "para adopción"}
            href={availableForAdopt > 0 ? `/org/${orgToken}/mascotas` : undefined}
            info={{
              definition: "Animales con estado 'disponible para adopción' en este momento.",
            }}
          />

          {/* Adopciones en curso — consolidated */}
          <OpKpi
            label="Adopciones en curso"
            value={activeAdoptions === 0 ? "—" : activeAdoptions}
            tone={activeAdoptions === 0 ? "neutral" : "warn"}
            sub={activeAdoptions === 0 ? "Sin postulaciones activas" : undefined}
            href={activeAdoptions > 0 ? `/org/${orgToken}/adopciones` : undefined}
            info={{
              definition:
                "Procesos de adopción activos (postulaciones en evaluación o seguimiento).",
            }}
          />
        </section>
      )}

      {/* OpCard "Requieren acción" — shelters only */}
      {isShelter && (
        <OpCard accent={actionItems.length > 0 ? "warn" : undefined}>
          <OpCardHead
            title="Requieren acción"
            actions={
              actionItems.length > 0 ? (
                <Link
                  href={`/org/${orgToken}/mascotas`}
                  className="text-sm text-ln-op-azul hover:underline no-underline"
                >
                  Ver todos →
                </Link>
              ) : undefined
            }
          />
          <OpCardBody className={actionItems.length === 0 ? "p-0" : undefined}>
            {actionItems.length === 0 ? (
              /* Positive empty state — no bare 0-count (spec edge/a11y) */
              <div className="flex items-center gap-3 px-4 py-5">
                <Icon name="check-circle" size="md" className="text-ln-op-ok shrink-0" decorative />
                <div>
                  <p className="text-[13px] font-semibold text-ln-op-ink">Todo en orden</p>
                  <p className="text-sm text-ln-op-mute">
                    Ningún animal requiere atención inmediata.
                  </p>
                </div>
              </div>
            ) : (
              <ul
                aria-label="Animales que requieren atención"
                className="divide-y divide-ln-op-line-2"
              >
                {actionItems.map((item) => (
                  <li key={item.petId} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-[13px] font-semibold text-ln-op-ink truncate">
                        <Link
                          href={`/org/${orgToken}/mascotas/${item.petPublicToken}`}
                          className="hover:underline no-underline text-ln-op-ink"
                        >
                          {item.petName}
                        </Link>
                      </p>
                      {/* icon + text for each flag — never color-only (a11y Item 11 pattern) */}
                      <ul className="flex flex-wrap gap-2" aria-label="Motivos">
                        {item.reasons.map((reason) => (
                          <li key={reason} className="flex items-center gap-1">
                            <Icon
                              name={actionReasonIcon(reason)}
                              size="sm"
                              className="text-ln-op-warn shrink-0"
                              decorative
                            />
                            <span className="text-[11px] text-ln-op-warn font-medium">
                              {actionReasonLabel(reason)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <span className="text-[11px] text-ln-op-mute whitespace-nowrap pt-0.5">
                      {item.daysInCustody}d en custodia
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </OpCardBody>
        </OpCard>
      )}

      {/* OpCard "Pendientes" — the original 3 KPIs, demoted to secondary card */}
      <OpCard>
        <OpCardHead title="Pendientes" />
        <OpCardBody className="p-0">
          <ul className="divide-y divide-ln-op-line-2">
            <li className="flex items-center justify-between px-4 py-3">
              <Link
                href={`/org/${orgToken}/casos`}
                className="text-[13px] text-ln-op-ink hover:underline no-underline"
              >
                Casos abiertos
              </Link>
              <OpPill tone={pendingCounts.openCases > 0 ? "open" : "neutral"}>
                {pendingCounts.openCases}
              </OpPill>
            </li>
            <li className="flex items-center justify-between px-4 py-3">
              <Link
                href={`/org/${orgToken}/transferencias/recibidas`}
                className="text-[13px] text-ln-op-ink hover:underline no-underline"
              >
                Transferencias pendientes
              </Link>
              <OpPill tone={pendingCounts.pendingTransfers > 0 ? "open" : "neutral"}>
                {pendingCounts.pendingTransfers}
              </OpPill>
            </li>
            <li className="flex items-center justify-between px-4 py-3">
              <Link
                href={`/org/${orgToken}/voluntarios/propuestas`}
                className="text-[13px] text-ln-op-ink hover:underline no-underline"
              >
                Propuestas de tránsito
              </Link>
              <OpPill tone={pendingCounts.pendingFosterProposals > 0 ? "open" : "neutral"}>
                {pendingCounts.pendingFosterProposals}
              </OpPill>
            </li>
          </ul>
        </OpCardBody>
      </OpCard>

      {/* Capability action cards */}
      {(canReadHeld || canIntake || canReviewAdoptions || canAssignFoster) && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {canReadHeld && (
            <Link
              href={`/org/${orgToken}/mascotas`}
              className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
            >
              <p className="text-[13px] font-semibold text-ln-op-ink">Animales en custodia</p>
              <p className="text-sm text-ln-op-mute mt-1">
                Listado de animales bajo custodia activa de la organización.
              </p>
            </Link>
          )}
          {canIntake && (
            <Link
              href={`/org/${orgToken}/intake`}
              className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
            >
              <p className="text-[13px] font-semibold text-ln-op-ink">Registrar ingreso</p>
              <p className="text-sm text-ln-op-mute mt-1">
                Dar de alta un animal que entra a custodia de la organización.
              </p>
            </Link>
          )}
          {canReviewAdoptions && (
            <Link
              href={`/org/${orgToken}/checkins`}
              className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
            >
              <p className="text-[13px] font-semibold text-ln-op-ink">Check-ins post-adopción</p>
              <p className="text-sm text-ln-op-mute mt-1">
                Seguimiento de los adoptantes en las ventanas pactadas.
              </p>
            </Link>
          )}
          {canAssignFoster && (
            <>
              <Link
                href={`/org/${orgToken}/voluntarios`}
                className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">Pool de voluntarios</p>
                <p className="text-sm text-ln-op-mute mt-1">
                  Buscar voluntarios y proponer tránsitos.
                </p>
              </Link>
              <Link
                href={`/org/${orgToken}/voluntarios/propuestas`}
                className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">Propuestas emitidas</p>
                <p className="text-sm text-ln-op-mute mt-1">
                  Estado de las propuestas de tránsito que enviaste.
                </p>
              </Link>
              <Link
                href={`/org/${orgToken}/transitos`}
                className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">Tránsitos activos</p>
                <p className="text-sm text-ln-op-mute mt-1">
                  Mascotas con tránsito en curso (pool, miembro o vecino).
                </p>
              </Link>
            </>
          )}
          {canIntake && isRehoming && (
            <Link
              href={`/org/${orgToken}/pets/no-aptas`}
              className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
            >
              <p className="text-[13px] font-semibold text-ln-op-ink">
                Mascotas no aptas para adopción
              </p>
              <p className="text-sm text-ln-op-mute mt-1">
                Animales marcados como no aptos, agrupados por motivo.
              </p>
            </Link>
          )}
        </section>
      )}

      {/* UX 3.6 (b): module entry points by org type. The operations panel above
          is shelter-only; clinics and health authorities previously landed on a
          thin panel with no actionable modules. Surface their primary modules
          here, capability-gated so the links never dead-end. */}
      {isClinic &&
        (canWriteEvents ||
          canReportBite ||
          granted.has("appointment.manage") ||
          canCreateServices) && (
          <section
            aria-label="Módulos de la clínica"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {/* Vet home (#43 item 3): the clinic's primary action is signing a
                clinical event — it leads the module grid (accent card). Adoption
                is demoted (hidden entirely for clinics by the org-type filter). */}
            {canWriteEvents && (
              <Link
                href={`/org/${orgToken}/mascotas`}
                className="block rounded-[var(--radius-md)] border border-ln-op-azul bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline sm:col-span-2"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">
                  Registrar / firmar evento clínico
                </p>
                <p className="text-sm text-ln-op-mute mt-1">
                  Cargá una vacuna, cirugía u otro evento clínico. Si tenés matrícula verificada, se
                  firma como verificado por profesional.
                </p>
              </Link>
            )}
            {granted.has("appointment.manage") && (
              <Link
                href={`/org/${orgToken}/agenda`}
                className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">Turnos de hoy</p>
                <p className="text-sm text-ln-op-mute mt-1">
                  La agenda del día: asistencia, ausencias y cancelaciones.
                </p>
              </Link>
            )}
            {canReportBite && (
              <Link
                href={`/org/${orgToken}/mordedura/nuevo`}
                className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">Reportar mordedura</p>
                <p className="text-sm text-ln-op-mute mt-1">
                  Registrar una mordedura e iniciar la observación antirrábica.
                </p>
              </Link>
            )}
            {canCreateServices && (
              <Link
                href={`/org/${orgToken}/servicios`}
                className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">Servicios</p>
                <p className="text-sm text-ln-op-mute mt-1">
                  Publicar y gestionar ofrecimientos de servicios.
                </p>
              </Link>
            )}
          </section>
        )}

      {organization.orgType === "sanitary_authority" && (
        <section
          aria-label="Módulos de la autoridad sanitaria"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <Link
            href={`/org/${orgToken}/casos`}
            className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
          >
            <p className="text-[13px] font-semibold text-ln-op-ink">Casos</p>
            <p className="text-sm text-ln-op-mute mt-1">Expedientes abiertos por la autoridad.</p>
          </Link>
          {granted.has("bite.report") && (
            <Link
              href={`/org/${orgToken}/mordedura/nuevo`}
              className="block rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4 hover:bg-ln-op-stripe transition-colors no-underline"
            >
              <p className="text-[13px] font-semibold text-ln-op-ink">Mordeduras</p>
              <p className="text-sm text-ln-op-mute mt-1">
                Registrar una mordedura e iniciar la observación antirrábica.
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
                  className="text-sm text-ln-op-azul hover:underline no-underline"
                >
                  Revisar solicitudes →
                </Link>
              )}
            </div>
          }
        />
        <OpCardBody className="p-0">
          {/* UX 3.6 (a): nav modules gated by capability disappear silently. This
              line explains the link and points to the request path below, so a
              missing section reads as "ask for access" instead of a dead end. */}
          {!isAdmin && (
            <p className="px-4 pt-3 text-sm text-ln-op-mute">
              Cada permiso habilita su módulo en el menú. Si no ves una sección que esperabas, pedí
              el permiso correspondiente acá abajo y un admin lo aprueba.
            </p>
          )}
          <ul className="divide-y divide-ln-op-line">
            {CAPABILITY_CATALOG.filter((entry) =>
              // Org-type specialization (#43 item 2): hide pure-shelter permissions
              // (foster/adoption/custody) from clinics and health authorities.
              capabilityAppliesToOrgType(entry.capability, orgType),
            ).map((entry) => {
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
                    <p className="text-sm text-ln-op-mute">{entry.description}</p>
                    {(state.kind === "denied" || state.kind === "revoked") && state.reason && (
                      <p className="text-sm italic text-ln-op-faint">Motivo: {state.reason}</p>
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
