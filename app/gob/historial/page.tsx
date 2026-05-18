import { desc, eq } from "drizzle-orm";

import { auditLog, db, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

const ACTION_LABELS: Record<string, string> = {
  request_approved: "Solicitud aprobada",
  request_rejected: "Solicitud rechazada",
  request_viewed: "Solicitud vista",
  revocation_vet: "Revocación matrícula",
  revocation_org: "Revocación verificación org",
  revocation_govt_assignment: "Revocación localidad govt",
  deactivation_govt: "Desactivación cuenta govt",
  deactivation_admin: "Desactivación cuenta admin",
  pii_queried: "Búsqueda de PII",
  admin_seeded: "Admin inicializado",
  approval_request_withdrawn_by_applicant: "Solicitud retirada por aplicante",
};

export default async function GobHistorialPage() {
  const { user } = await requireAdminOrGovtOrRedirect();

  const entries = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      performedAt: auditLog.performedAt,
      approvalRequestId: auditLog.approvalRequestId,
    })
    .from(auditLog)
    .where(eq(auditLog.actorUserId, user.id))
    .orderBy(desc(auditLog.performedAt))
    .limit(100);

  const [actor] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Mi historial
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Últimas {entries.length} acciones realizadas por{" "}
            <span className="font-medium">{actor?.displayName ?? user.id}</span>.
          </p>
        </header>

        {entries.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            No registraste acciones todavía.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm text-neutral-900 dark:text-neutral-50">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </p>
                  {entry.approvalRequestId && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 font-mono">
                      req: {entry.approvalRequestId}
                    </p>
                  )}
                </div>
                <time className="text-xs text-neutral-400 dark:text-neutral-600 whitespace-nowrap">
                  {new Date(entry.performedAt).toLocaleString("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
