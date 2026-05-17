import Link from "next/link";
import { notFound } from "next/navigation";

import { and, count, desc, eq, isNull } from "drizzle-orm";

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
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          <Link
            href="/admin/admins"
            className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            &larr; Volver a Administradores
          </Link>
        </p>

        {/* Identity card */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                  {target.displayName}
                </h1>
                {isSelf && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 rounded">
                    Vos
                  </span>
                )}
              </div>
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
            <dd className="text-neutral-900 dark:text-neutral-50 capitalize">
              {target.accountType}
            </dd>
            <dt className="text-neutral-500 dark:text-neutral-500">Rol</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">Administrador</dd>
            <dt className="text-neutral-500 dark:text-neutral-500">Creado</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">
              {target.createdAt.toLocaleDateString("es-AR")}
            </dd>
            {!isActive && target.deactivatedAt && (
              <>
                <dt className="text-neutral-500 dark:text-neutral-500">Desactivado</dt>
                <dd className="text-red-600 dark:text-red-400">
                  {target.deactivatedAt.toLocaleDateString("es-AR")}
                </dd>
              </>
            )}
          </dl>
        </section>

        {/* Account actions */}
        {isActive && actorProfile && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              Acciones de cuenta
            </h2>
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
              {/* Reset credentials — disabled in PR-B (coming PR-C) */}
              <button
                type="button"
                disabled
                className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
                title="Disponible en la proxima version"
              >
                Resetear credentials
              </button>
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
