// Admin approval queue. Lists pending capability requests for the active org,
// plus the most recent approvals (so an admin can revoke without scrolling
// through the audit trail). Layout gates on capability.grant.

import {
  OpCard,
  OpCardBody,
  OpCardHead,
  OpCodeBadge,
  OpCrumbs,
  OpPill,
} from "@/components/ui/dashboard";
import { db, organizationCapabilityGrants, organizationMemberships, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { CAPABILITY_CATALOG } from "@/src/modules/organizations/domain/capabilities";
import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { DecideForm } from "./DecideForm";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador/a",
  coordinator: "Coordinador/a",
  member: "Miembro",
  volunteer: "Voluntario/a",
  foster: "Tránsito",
  vet_individual: "Veterinario/a",
};

const LABEL_BY_CAPABILITY = new Map(
  CAPABILITY_CATALOG.map((entry) => [entry.capability as string, entry.label]),
);

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export default async function PermisosPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization } = await requireOrgAccessByToken(orgToken);

  // Pending requests come first, then the most-recent 20 decisions for context.
  const rows = await db
    .select({
      id: organizationCapabilityGrants.id,
      capability: organizationCapabilityGrants.capability,
      status: organizationCapabilityGrants.status,
      requestedAt: organizationCapabilityGrants.requestedAt,
      requestedReason: organizationCapabilityGrants.requestedReason,
      decidedAt: organizationCapabilityGrants.decidedAt,
      decisionReason: organizationCapabilityGrants.decisionReason,
      requesterUserId: organizationMemberships.userId,
      requesterRole: organizationMemberships.role,
      requesterDisplayName: profiles.displayName,
    })
    .from(organizationCapabilityGrants)
    .innerJoin(
      organizationMemberships,
      eq(organizationMemberships.id, organizationCapabilityGrants.membershipId),
    )
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationCapabilityGrants.organizationId, organization.id),
        inArray(organizationCapabilityGrants.status, ["pending", "approved"]),
      ),
    )
    .orderBy(desc(organizationCapabilityGrants.requestedAt));

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <OpCrumbs
          items={[
            { label: "Panel", href: `/org/${orgToken}` },
            { label: "Administración" },
            { label: "Permisos" },
          ]}
        />
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Solicitudes de permisos</h1>
        <p className="text-[13px] text-ln-op-mute">
          Aprobá o denegá pedidos pendientes. También podés revocar un permiso ya concedido.
        </p>
      </div>

      {/* Pending */}
      <OpCard accent={pending.length > 0 ? "warn" : undefined}>
        <OpCardHead
          title={
            <>
              Pendientes{" "}
              <span className="text-[12px] text-ln-op-mute font-normal">({pending.length})</span>
            </>
          }
        />
        <OpCardBody className="p-0">
          {pending.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ln-op-mute">No hay solicitudes pendientes.</p>
          ) : (
            <ul className="divide-y divide-ln-op-line">
              {pending.map((row) => (
                <li key={row.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-[13px] font-medium text-ln-op-ink">
                        {LABEL_BY_CAPABILITY.get(row.capability) ?? row.capability}{" "}
                        <OpCodeBadge tone="neutral">{row.capability}</OpCodeBadge>
                      </p>
                      <p className="text-[12px] text-ln-op-mute">
                        {row.requesterDisplayName} ·{" "}
                        {ROLE_LABELS[row.requesterRole] ?? row.requesterRole} ·{" "}
                        {formatDate(row.requestedAt)}
                      </p>
                      {row.requestedReason && (
                        <p className="text-[12px] italic text-ln-op-faint">
                          "{row.requestedReason}"
                        </p>
                      )}
                    </div>
                    <OpPill tone="open">Pendiente</OpPill>
                  </div>
                  <DecideForm grantId={row.id} pending={true} approved={false} />
                </li>
              ))}
            </ul>
          )}
        </OpCardBody>
      </OpCard>

      {/* Approved / active grants */}
      <OpCard>
        <OpCardHead
          title={
            <>
              Concedidos activos{" "}
              <span className="text-[12px] text-ln-op-mute font-normal">({approved.length})</span>
            </>
          }
        />
        <OpCardBody className="p-0">
          {approved.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ln-op-mute">
              Ningún permiso concedido fuera del rol admin.
            </p>
          ) : (
            <ul className="divide-y divide-ln-op-line">
              {approved.map((row) => (
                <li key={row.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-[13px] font-medium text-ln-op-ink">
                        {LABEL_BY_CAPABILITY.get(row.capability) ?? row.capability}{" "}
                        <OpCodeBadge tone="neutral">{row.capability}</OpCodeBadge>
                      </p>
                      <p className="text-[12px] text-ln-op-mute">
                        {row.requesterDisplayName} ·{" "}
                        {ROLE_LABELS[row.requesterRole] ?? row.requesterRole} · concedido{" "}
                        {row.decidedAt ? formatDate(row.decidedAt) : "—"}
                      </p>
                    </div>
                    <OpPill tone="ok">Concedido</OpPill>
                  </div>
                  <DecideForm grantId={row.id} pending={false} approved={true} />
                </li>
              ))}
            </ul>
          )}
        </OpCardBody>
      </OpCard>

      <footer className="pt-2">
        <Link href={`/org/${orgToken}`} className="text-[13px] text-ln-op-azul hover:underline">
          ← Volver al panel
        </Link>
      </footer>
    </div>
  );
}
