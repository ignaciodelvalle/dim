import Link from "next/link";
import { notFound } from "next/navigation";

import { and, desc, eq, inArray } from "drizzle-orm";

import { ResetCredentialsButton } from "@/app/admin/_components/ResetCredentialsButton";
import { AssignLocalityForm } from "@/app/admin/govts/_components/AssignLocalityForm";
import { DeactivateGovtActions } from "@/app/admin/govts/_components/DeactivateGovtForm";
import { RevokeLocalityRowActions } from "@/app/admin/govts/_components/RevokeLocalityRowActions";
import { OpCard, OpCardBody, OpCardHead, OpCodeBadge, OpPill } from "@/components/ui/dashboard";
import { auditLog, db, govtAssignments, profiles } from "@/db";
import { describeAuditEntry } from "@/lib/audit-entry-view";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";

// Scaling note: auth.admin.getUserById() called once per page load.
// Safe at v1 institutional volume. See ADR-8.

export default async function GovtDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { user: actorUser } = await requireAdminOrRedirect();
  const { userId } = await params;

  // Load govt profile
  const [govt] = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      accountType: profiles.accountType,
      role: profiles.role,
      deactivatedAt: profiles.deactivatedAt,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(and(eq(profiles.id, userId), eq(profiles.role, "govt")))
    .limit(1);

  if (!govt) notFound();

  // Fetch email from auth.users via admin SDK
  const supabase = createAdminClient();
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? "(email no disponible)";

  // Load active and revoked locality assignments
  const allAssignments = await db
    .select({
      id: govtAssignments.id,
      jurisdictionProvince: govtAssignments.jurisdictionProvince,
      jurisdictionLocality: govtAssignments.jurisdictionLocality,
      grantedAt: govtAssignments.grantedAt,
      revokedAt: govtAssignments.revokedAt,
      revocationReason: govtAssignments.revocationReason,
    })
    .from(govtAssignments)
    .where(eq(govtAssignments.userId, userId))
    .orderBy(desc(govtAssignments.grantedAt));

  const activeAssignments = allAssignments.filter((a) => a.revokedAt === null);
  const revokedAssignments = allAssignments.filter((a) => a.revokedAt !== null);

  // Load audit log tail (last 10 entries where this user is the target)
  const auditEntries = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorUserId: auditLog.actorUserId,
      payload: auditLog.payload,
      performedAt: auditLog.performedAt,
    })
    .from(auditLog)
    .where(eq(auditLog.targetUserId, userId))
    .orderBy(desc(auditLog.performedAt))
    .limit(10);

  // Resolve actor display names in one batch query
  const auditActorIds = Array.from(
    new Set(auditEntries.map((e) => e.actorUserId).filter((id): id is string => id !== null)),
  );
  const auditActorNamesById = new Map<string, string>();
  if (auditActorIds.length > 0) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, auditActorIds));
    for (const r of rows) auditActorNamesById.set(r.id, r.displayName);
  }

  const isActive = govt.deactivatedAt === null;

  return (
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Back nav */}
        <p className="text-[12px] text-ln-op-mute">
          <Link href="/admin/govts" className="underline underline-offset-4 hover:text-ln-op-ink-2">
            {"←"} Volver a Gobiernos
          </Link>
        </p>

        {/* Identity card */}
        <OpCard>
          <OpCardHead
            title={govt.displayName}
            actions={
              <OpPill tone={isActive ? "ok" : "neutral"}>
                {isActive ? "Activo" : "Desactivado"}
              </OpPill>
            }
          />
          <OpCardBody>
            <p className="text-[12px] text-ln-op-mute mb-3">{email}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
              <dt className="text-ln-op-mute">Tipo de cuenta</dt>
              <dd className="text-ln-op-ink capitalize">{govt.accountType}</dd>
              <dt className="text-ln-op-mute">Rol</dt>
              <dd className="text-ln-op-ink">Gobierno</dd>
              <dt className="text-ln-op-mute">Creado</dt>
              <dd className="text-ln-op-ink">{govt.createdAt.toLocaleDateString("es-AR")}</dd>
              {!isActive && govt.deactivatedAt && (
                <>
                  <dt className="text-ln-op-mute">Desactivado</dt>
                  <dd className="text-ln-op-danger">
                    {govt.deactivatedAt.toLocaleDateString("es-AR")}
                  </dd>
                </>
              )}
            </dl>
          </OpCardBody>
        </OpCard>

        {/* Active localities */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-semibold text-ln-op-ink">
            Localidades activas ({activeAssignments.length})
          </h2>

          {activeAssignments.length === 0 ? (
            <p className="text-[12px] text-ln-op-mute">Sin localidades activas.</p>
          ) : (
            <ul className="space-y-2">
              {activeAssignments.map((a) => {
                const label = `${a.jurisdictionLocality}, ${a.jurisdictionProvince}`;
                return (
                  <li key={a.id}>
                    <OpCard>
                      <OpCardBody className="flex items-center justify-between gap-3">
                        <span className="text-[13px] text-ln-op-ink">{label}</span>
                        {isActive && (
                          <RevokeLocalityRowActions
                            assignmentId={a.id}
                            localityLabel={label}
                            actorUserId={actorUser.id}
                          />
                        )}
                      </OpCardBody>
                    </OpCard>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Assign locality — PR-C */}
          {isActive && (
            <div className="mt-2">
              <AssignLocalityForm targetUserId={userId} />
            </div>
          )}
        </section>

        {/* Revoked localities (collapsible) */}
        {revokedAssignments.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-[12px] text-ln-op-mute hover:text-ln-op-ink-2 select-none">
              Localidades revocadas ({revokedAssignments.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {revokedAssignments.map((a) => (
                <li key={a.id} className="text-[12px] text-ln-op-mute px-3 space-y-0.5">
                  <span className="text-ln-op-ink-2">
                    {a.jurisdictionLocality}, {a.jurisdictionProvince}
                  </span>
                  {a.revokedAt && (
                    <span className="ml-2 text-ln-op-faint">
                      (revocada {a.revokedAt.toLocaleDateString("es-AR")})
                    </span>
                  )}
                  {a.revocationReason && (
                    <p className="text-ln-op-mute">
                      <span className="text-ln-op-faint">Motivo:</span> {a.revocationReason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Account actions */}
        {isActive && (
          <section className="space-y-3">
            <h2 className="text-[13px] font-semibold text-ln-op-ink">Acciones de cuenta</h2>
            <div className="flex items-start gap-3 flex-wrap">
              <DeactivateGovtActions
                target={{
                  id: govt.id,
                  displayName: govt.displayName,
                  activeLocalityCount: activeAssignments.length,
                }}
                actorUserId={actorUser.id}
              />
              <ResetCredentialsButton
                targetUserId={govt.id}
                displayName={govt.displayName}
                email={email}
                detailPath={`/admin/govts/${govt.id}`}
              />
            </div>
          </section>
        )}

        {/* Audit log tail */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-semibold text-ln-op-ink">
            Audit log (últimas {auditEntries.length} entradas)
          </h2>
          {auditEntries.length === 0 ? (
            <p className="text-[12px] text-ln-op-mute">Sin registros.</p>
          ) : (
            <ul className="divide-y divide-ln-op-line-2">
              {auditEntries.map((entry) => {
                const view = describeAuditEntry(entry.action, entry.payload);
                const actorName = entry.actorUserId
                  ? (auditActorNamesById.get(entry.actorUserId) ?? "Desconocido")
                  : "Sistema";
                return (
                  <li key={entry.id} className="py-2 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-ln-op-ink" title={entry.action}>
                        {view.label}
                      </span>
                      <OpCodeBadge tone="neutral">{entry.action}</OpCodeBadge>
                    </div>
                    <p className="text-[12px] text-ln-op-mute">
                      {actorName}
                      <span className="mx-1 text-ln-op-faint">·</span>
                      <span className="tabular-nums">
                        {entry.performedAt.toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </p>
                    {view.reason && (
                      <p className="text-[12px] text-ln-op-ink-2">
                        <span className="text-ln-op-mute">Motivo:</span> {view.reason}
                      </p>
                    )}
                    {view.evidenceCount !== undefined && (
                      <p className="text-[12px] text-ln-op-mute">
                        {view.evidenceCount} archivo(s) de evidencia
                      </p>
                    )}
                    {view.resetMethod && (
                      <p className="text-[12px] text-ln-op-mute">Método: {view.resetMethod}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
