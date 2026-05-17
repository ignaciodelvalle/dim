import Link from "next/link";
import { notFound } from "next/navigation";

import { and, desc, eq, isNull, not } from "drizzle-orm";

import { ResetCredentialsButton } from "@/app/admin/_components/ResetCredentialsButton";
import { AssignLocalityForm } from "@/app/admin/govts/_components/AssignLocalityForm";
import { DeactivateGovtActions } from "@/app/admin/govts/_components/DeactivateGovtForm";
import { RevokeLocalityRowActions } from "@/app/admin/govts/_components/RevokeLocalityRowActions";
import { auditLog, db, govtAssignments, profiles } from "@/db";
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
      payload: auditLog.payload,
      performedAt: auditLog.performedAt,
    })
    .from(auditLog)
    .where(eq(auditLog.targetUserId, userId))
    .orderBy(desc(auditLog.performedAt))
    .limit(10);

  const isActive = govt.deactivatedAt === null;

  return (
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Back nav */}
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          <Link
            href="/admin/govts"
            className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            &larr; Volver a Gobiernos
          </Link>
        </p>

        {/* Identity card */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {govt.displayName}
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-500">{email}</p>
            </div>
            <span
              className={`px-2 py-0.5 rounded uppercase tracking-wider text-[10px] shrink-0 ${
                isActive
                  ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
              }`}
            >
              {isActive ? "Activo" : "Desactivado"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-neutral-500 dark:text-neutral-500">Tipo de cuenta</dt>
            <dd className="text-neutral-900 dark:text-neutral-50 capitalize">{govt.accountType}</dd>
            <dt className="text-neutral-500 dark:text-neutral-500">Rol</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">Gobierno</dd>
            <dt className="text-neutral-500 dark:text-neutral-500">Creado</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">
              {govt.createdAt.toLocaleDateString("es-AR")}
            </dd>
            {!isActive && govt.deactivatedAt && (
              <>
                <dt className="text-neutral-500 dark:text-neutral-500">Desactivado</dt>
                <dd className="text-red-600 dark:text-red-400">
                  {govt.deactivatedAt.toLocaleDateString("es-AR")}
                </dd>
              </>
            )}
          </dl>
        </section>

        {/* Active localities */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Localidades activas ({activeAssignments.length})
          </h2>

          {activeAssignments.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              Sin localidades activas.
            </p>
          ) : (
            <ul className="space-y-2">
              {activeAssignments.map((a) => {
                const label = `${a.jurisdictionLocality}, ${a.jurisdictionProvince}`;
                return (
                  <li
                    key={a.id}
                    className="rounded border border-neutral-200 dark:border-neutral-800 px-3 py-2 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-neutral-900 dark:text-neutral-50">{label}</span>
                      {isActive && (
                        <RevokeLocalityRowActions
                          assignmentId={a.id}
                          localityLabel={label}
                          actorUserId={actorUser.id}
                        />
                      )}
                    </div>
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
            <summary className="cursor-pointer text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 select-none">
              Localidades revocadas ({revokedAssignments.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {revokedAssignments.map((a) => (
                <li key={a.id} className="text-xs text-neutral-500 dark:text-neutral-500 px-3">
                  {a.jurisdictionLocality}, {a.jurisdictionProvince}
                  {a.revokedAt && (
                    <span className="ml-2 text-neutral-400 dark:text-neutral-600">
                      (revocada {a.revokedAt.toLocaleDateString("es-AR")})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Account actions */}
        {isActive && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              Acciones de cuenta
            </h2>
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
          <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Audit log (ultimas {auditEntries.length} entradas)
          </h2>
          {auditEntries.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-500">Sin registros.</p>
          ) : (
            <ul className="space-y-1">
              {auditEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-3"
                >
                  <span className="tabular-nums text-neutral-400 dark:text-neutral-600 shrink-0">
                    {entry.performedAt.toLocaleDateString("es-AR")}
                  </span>
                  <code className="text-[10px] bg-neutral-100 dark:bg-neutral-900 px-1 py-0.5 rounded">
                    {entry.action}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
