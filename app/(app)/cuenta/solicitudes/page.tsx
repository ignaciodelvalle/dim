// Mis solicitudes — Libreta Nacional redesign.
// Data fetching unchanged.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";

import { LnCard, LnCardBody } from "@/components/ui/Card";
import { LnSectionHead } from "@/components/ui/DocElements";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { approvalRequests, db, organizationInvitations, organizations } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils/format";
import { WithdrawButton } from "./WithdrawButton";

const REQUEST_TYPE_LABELS: Record<string, string> = {
  role_upgrade_vet: "Upgrade a veterinario/a",
  role_upgrade_govt: "Upgrade a gobierno",
  role_upgrade_admin: "Upgrade a administrador/a",
  organization_verification: "Verificación de organización",
  govt_assignment_grant: "Asignación de localidad",
};

const INVITED_ROLE_LABELS: Record<string, string> = {
  admin: "Administrador/a",
  coordinator: "Coordinador/a",
  member: "Miembro",
  volunteer: "Voluntario/a",
  foster: "Transitante",
  vet_individual: "Veterinario/a individual",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
};

type StatusVariant = "pending" | "approved" | "rejected" | "withdrawn";

type StatusStyle = { bg: string; text: string; border: string };

const STATUS_STYLES: Record<StatusVariant, StatusStyle> = {
  pending: {
    bg: "bg-[var(--color-ln-warn-050)]",
    text: "text-[var(--color-ln-warn)]",
    border: "border-[var(--color-ln-warn-100)]",
  },
  approved: {
    bg: "bg-[var(--color-ln-ok-050)]",
    text: "text-[var(--color-ln-ok)]",
    border: "border-[var(--color-ln-ok-100)]",
  },
  rejected: {
    bg: "bg-[var(--color-ln-err-050)]",
    text: "text-[var(--color-ln-err)]",
    border: "border-[var(--color-ln-err-100)]",
  },
  withdrawn: {
    bg: "bg-[var(--color-ln-stripe)]",
    text: "text-[var(--color-ln-mute)]",
    border: "border-[var(--color-ln-line-strong)]",
  },
};

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const { filter } = await searchParams;

  // Fetch the user's email to match org invitations (sent to email, not userId).
  let userEmail = "";
  try {
    const adminClient = createAdminClient();
    const { data } = await adminClient.auth.admin.getUserById(user.id);
    userEmail = data?.user?.email?.toLowerCase().trim() ?? "";
  } catch {
    // Non-critical — invitations section gracefully empty.
  }

  const allRequests = await db
    .select({
      id: approvalRequests.id,
      type: approvalRequests.type,
      status: approvalRequests.status,
      createdAt: approvalRequests.createdAt,
      decidedAt: approvalRequests.decidedAt,
      decisionNotes: approvalRequests.decisionNotes,
    })
    .from(approvalRequests)
    .where(eq(approvalRequests.applicantUserId, user.id))
    .orderBy(desc(approvalRequests.createdAt));

  // Pending org invitations — matched by email (case-insensitive, same as
  // findActiveInvite), not yet accepted, revoked, or expired.
  const pendingInvitations =
    userEmail.length > 0
      ? await db
          .select({
            invitationToken: organizationInvitations.invitationToken,
            invitedRole: organizationInvitations.invitedRole,
            expiresAt: organizationInvitations.expiresAt,
            createdAt: organizationInvitations.createdAt,
            orgDisplayName: organizations.displayName,
          })
          .from(organizationInvitations)
          .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
          .where(
            and(
              sql`lower(${organizationInvitations.email}) = lower(${userEmail})`,
              isNull(organizationInvitations.acceptedAt),
              isNull(organizationInvitations.revokedAt),
              sql`${organizationInvitations.expiresAt} > now()`,
            ),
          )
          .orderBy(desc(organizationInvitations.createdAt))
      : [];

  const activeFilter = filter ?? "all";
  const filtered = allRequests.filter((r) => {
    if (activeFilter === "all") return true;
    return r.status === activeFilter;
  });

  const totalCount = allRequests.length;

  return (
    <div className="mx-auto max-w-2xl px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-5 inline-block font-ln-mono text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-baseline gap-3.5">
        <h1 className="m-0 font-ln-serif text-3xl font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Mis solicitudes
        </h1>
        <span className="font-ln-mono text-sm text-[var(--color-ln-mute)]">
          {totalCount === 0
            ? "ninguna"
            : totalCount === 1
              ? "1 solicitud"
              : `${totalCount} solicitudes`}
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Pending org invitations                                            */}
      {/* ------------------------------------------------------------------ */}
      {pendingInvitations.length > 0 && (
        <div className="mb-8">
          <LnSectionHead num="01" title="Invitaciones a organizaciones" className="mb-3.5" />
          <div className="flex flex-col gap-2.5">
            {pendingInvitations.map((inv) => (
              <LnCard key={inv.invitationToken}>
                <LnCardBody>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-ln-serif text-[14.5px] font-semibold leading-tight text-[var(--color-ln-ink)] truncate">
                        {inv.orgDisplayName}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-[var(--radius-xs)] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-[7px] py-0.5 font-ln-mono text-[9px] uppercase tracking-[.1em] text-[var(--color-ln-azul)]">
                          {INVITED_ROLE_LABELS[inv.invitedRole] ?? inv.invitedRole}
                        </span>
                        <span className="font-ln-mono text-[10.5px] text-[var(--color-ln-mute)]">
                          Expira {formatDate(inv.expiresAt)}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/r/invite/${inv.invitationToken}`}
                      className="flex-shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-ln-azul)] px-[13px] py-[7px] font-ln-sans text-sm font-semibold text-white no-underline hover:bg-[var(--color-ln-azul-700)]"
                    >
                      Ver invitación
                    </Link>
                  </div>
                </LnCardBody>
              </LnCard>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Upgrade requests                                                    */}
      {/* ------------------------------------------------------------------ */}
      <LnSectionHead
        num={pendingInvitations.length > 0 ? "02" : "01"}
        title="Solicitudes de rol"
        className="mb-3.5"
      />

      {/* Empty state */}
      {totalCount === 0 && (
        <LnEmptyState variant="dashed" title="No mandaste solicitudes todavía." />
      )}

      {/* Filter chips */}
      {totalCount > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          <FilterChip href="/cuenta/solicitudes" label="Todas" active={activeFilter === "all"} />
          <FilterChip
            href="/cuenta/solicitudes?filter=pending"
            label="Pendientes"
            active={activeFilter === "pending"}
          />
          <FilterChip
            href="/cuenta/solicitudes?filter=approved"
            label="Aprobadas"
            active={activeFilter === "approved"}
          />
          <FilterChip
            href="/cuenta/solicitudes?filter=rejected"
            label="Rechazadas"
            active={activeFilter === "rejected"}
          />
        </div>
      )}

      {/* No results for filter */}
      {totalCount > 0 && filtered.length === 0 && (
        <p className="text-[13px] text-[var(--color-ln-mute)]">
          No hay solicitudes con ese filtro.
        </p>
      )}

      {/* Requests list */}
      {filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          {filtered.map((req) => {
            const statusVariant = (
              ["pending", "approved", "rejected", "withdrawn"].includes(req.status)
                ? req.status
                : "pending"
            ) as StatusVariant;
            const style = STATUS_STYLES[statusVariant];

            return (
              <LnCard key={req.id}>
                <LnCardBody>
                  {/* Type + status */}
                  <div className="mb-2.5 flex flex-wrap items-center gap-[7px]">
                    <span className="inline-flex items-center rounded-[var(--radius-xs)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] px-2 py-0.5 font-ln-mono text-[9.5px] uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
                      {REQUEST_TYPE_LABELS[req.type] ?? req.type}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-[var(--radius-xs)] border px-2 py-0.5 font-ln-mono text-[9.5px] font-semibold uppercase tracking-[.1em] ${style.bg} ${style.text} ${style.border}`}
                    >
                      {STATUS_LABELS[req.status]}
                    </span>
                  </div>

                  {/* Dates */}
                  <div className="mb-2.5 flex flex-col gap-0.5 font-ln-mono text-[11px] text-[var(--color-ln-mute)]">
                    <span>Enviada el {formatDate(req.createdAt)}</span>
                    {req.decidedAt && <span>Decidida el {formatDate(req.decidedAt)}</span>}
                  </div>

                  {/* Rejection reason */}
                  {req.status === "rejected" && req.decisionNotes && (
                    <div className="mb-2.5 rounded-[var(--radius-sm)] border border-[var(--color-ln-err-100)] bg-[var(--color-ln-err-050)] px-3 py-2">
                      <p className="text-sm text-[var(--color-ln-err)]">
                        <span className="font-semibold">Motivo:</span> {req.decisionNotes}
                      </p>
                    </div>
                  )}

                  {/* Withdraw */}
                  {req.status === "pending" && <WithdrawButton requestId={req.id} />}
                </LnCardBody>
              </LnCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex cursor-pointer items-center rounded-full border px-[11px] py-[5px] font-ln-sans text-sm font-medium transition-colors no-underline",
        active
          ? "border-[var(--color-ln-azul)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]"
          : "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink-2)] hover:bg-[var(--color-ln-stripe)]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </Link>
  );
}
