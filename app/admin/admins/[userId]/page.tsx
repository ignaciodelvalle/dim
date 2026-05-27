import Link from "next/link";
import { notFound } from "next/navigation";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { ResetCredentialsButton } from "@/app/admin/_components/ResetCredentialsButton";
import { DeactivateAdminActions } from "@/app/admin/admins/_components/DeactivateAdminForm";
import { auditLog, db, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";

// Scaling note: auth.admin.getUserById() called once per page load.
// Safe at v1 institutional volume. See ADR-8.

export default async function AdminDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { user: actorUser } = await requireAdminOrRedirect();
  const { userId } = await params;

  // Load target admin profile
  const [target] = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      accountType: profiles.accountType,
      role: profiles.role,
      deactivatedAt: profiles.deactivatedAt,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(and(eq(profiles.id, userId), eq(profiles.role, "admin")))
    .limit(1);

  if (!target) notFound();

  // Load actor profile for capability check
  const [actorProfile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, actorUser.id))
    .limit(1);

  // Count active admins for last-admin guard
  const [{ activeCount }] = await db
    .select({ activeCount: count(profiles.id) })
    .from(profiles)
    .where(
      and(
        eq(profiles.role, "admin"),
        eq(profiles.accountType, "institutional"),
        isNull(profiles.deactivatedAt),
      ),
    );

  // Fetch email from auth.users via admin SDK
  const supabase = createAdminClient();
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? "(email no disponible)";

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

  const isActive = target.deactivatedAt === null;
  const isSelf = actorUser.id === userId;

  return (
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Back nav */}
        <p className="text-xs text-gob-text-muted">
          <Link
            href="/admin/admins"
            className="underline underline-offset-4 hover:text-gob-text-gray"
          >
            &larr; Volver a Administradores
          </Link>
        </p>

        {/* Identity card */}
        <section className="rounded-lg border border-gob-border p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-gob-text">
                  {target.displayName}
                </h1>
                {isSelf && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-gob-warning/20 text-gob-warning-text rounded">
                    Vos
                  </span>
                )}
              </div>
              <p className="text-sm text-gob-text-muted">{email}</p>
            </div>
            <span
              className={`px-2 py-0.5 rounded uppercase tracking-wider text-[10px] shrink-0 ${
                isActive
                  ? "bg-gob-success/10 text-gob-success"
                  : "bg-gob-surface-alt text-gob-text-gray"
              }`}
            >
              {isActive ? "Activo" : "Desactivado"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-gob-text-muted">Tipo de cuenta</dt>
            <dd className="text-gob-text capitalize">{target.accountType}</dd>
            <dt className="text-gob-text-muted">Rol</dt>
            <dd className="text-gob-text">Administrador</dd>
            <dt className="text-gob-text-muted">Creado</dt>
            <dd className="text-gob-text">{target.createdAt.toLocaleDateString("es-AR")}</dd>
            {!isActive && target.deactivatedAt && (
              <>
                <dt className="text-gob-text-muted">Desactivado</dt>
                <dd className="text-gob-danger">
                  {target.deactivatedAt.toLocaleDateString("es-AR")}
                </dd>
              </>
            )}
          </dl>
        </section>

        {/* Account actions */}
        {isActive && actorProfile && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-gob-text">Acciones de cuenta</h2>
            <div className="flex items-start gap-3 flex-wrap">
              <DeactivateAdminActions
                target={{ id: target.id, displayName: target.displayName }}
                actor={{
                  id: actorProfile.id,
                  role: actorProfile.role as "owner" | "vet" | "govt" | "admin",
                  accountType: actorProfile.accountType as "personal" | "institutional",
                  deactivatedAt: actorProfile.deactivatedAt,
                }}
                activeAdminCount={Number(activeCount)}
              />
              {!isSelf && (
                <ResetCredentialsButton
                  targetUserId={target.id}
                  displayName={target.displayName}
                  email={email}
                  detailPath={`/admin/admins/${target.id}`}
                />
              )}
            </div>
          </section>
        )}

        {/* Audit log tail */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gob-text">
            Audit log (ultimas {auditEntries.length} entradas)
          </h2>
          {auditEntries.length === 0 ? (
            <p className="text-xs text-gob-text-muted">Sin registros.</p>
          ) : (
            <ul className="space-y-1">
              {auditEntries.map((entry) => (
                <li key={entry.id} className="text-xs text-gob-text-gray flex items-center gap-3">
                  <span className="tabular-nums text-gob-text-muted shrink-0">
                    {entry.performedAt.toLocaleDateString("es-AR")}
                  </span>
                  <code className="text-[10px] bg-gob-surface-alt px-1 py-0.5 rounded">
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
