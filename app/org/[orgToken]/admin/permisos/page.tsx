// Admin approval queue. Lists pending capability requests for the active org,
// plus the most recent approvals (so an admin can revoke without scrolling
// through the audit trail). Layout gates on capability.grant.

import { db, organizationCapabilityGrants, organizationMemberships, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { CAPABILITY_CATALOG } from "@/lib/capabilities";
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

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Concedido",
  denied: "Denegado",
  revoked: "Revocado",
};

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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            Administración · {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Solicitudes de permisos</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Aprobá o denegá pedidos pendientes. También podés revocar un permiso ya concedido.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Pendientes <span className="text-sm text-neutral-500">({pending.length})</span>
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-neutral-500">No hay solicitudes pendientes.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded border border-neutral-200 dark:border-neutral-800">
              {pending.map((row) => (
                <li key={row.id} className="px-3 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium">
                        {LABEL_BY_CAPABILITY.get(row.capability) ?? row.capability}
                        <span className="ml-2 text-xs text-neutral-500">{row.capability}</span>
                      </p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        {row.requesterDisplayName} ·{" "}
                        {ROLE_LABELS[row.requesterRole] ?? row.requesterRole} ·{" "}
                        {formatDate(row.requestedAt)}
                      </p>
                      {row.requestedReason && (
                        <p className="text-xs italic text-neutral-500">"{row.requestedReason}"</p>
                      )}
                    </div>
                    <span className="text-xs text-amber-700 dark:text-amber-400 shrink-0">
                      {STATUS_LABELS.pending}
                    </span>
                  </div>
                  <DecideForm grantId={row.id} pending={true} approved={false} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Concedidos activos <span className="text-sm text-neutral-500">({approved.length})</span>
          </h2>
          {approved.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Ningún permiso concedido fuera del rol admin.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded border border-neutral-200 dark:border-neutral-800">
              {approved.map((row) => (
                <li key={row.id} className="px-3 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium">
                        {LABEL_BY_CAPABILITY.get(row.capability) ?? row.capability}
                        <span className="ml-2 text-xs text-neutral-500">{row.capability}</span>
                      </p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        {row.requesterDisplayName} ·{" "}
                        {ROLE_LABELS[row.requesterRole] ?? row.requesterRole} · concedido{" "}
                        {row.decidedAt ? formatDate(row.decidedAt) : "—"}
                      </p>
                    </div>
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 shrink-0">
                      {STATUS_LABELS.approved}
                    </span>
                  </div>
                  <DecideForm grantId={row.id} pending={false} approved={true} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href={`/org/${orgToken}`}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver al panel
          </Link>
        </footer>
      </div>
    </main>
  );
}
