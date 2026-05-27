import { desc, eq, inArray } from "drizzle-orm";

import { auditLog, db, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

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

export default async function AdminAuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; actor?: string }>;
}) {
  await requireAdminOrRedirect();

  const sp = await searchParams;
  const actionFilter = sp.action?.trim() || null;
  const actorFilter = sp.actor?.trim() || null;

  // Build base query with optional filters.
  const query = db
    .select({
      id: auditLog.id,
      actorUserId: auditLog.actorUserId,
      action: auditLog.action,
      approvalRequestId: auditLog.approvalRequestId,
      targetUserId: auditLog.targetUserId,
      performedAt: auditLog.performedAt,
    })
    .from(auditLog)
    .orderBy(desc(auditLog.performedAt))
    .limit(200);

  let entries = await query;

  // Apply JS-side filters (small dataset; avoids dynamic SQL complexity).
  if (actionFilter) {
    entries = entries.filter((e) => e.action.includes(actionFilter));
  }
  if (actorFilter) {
    entries = entries.filter((e) => e.actorUserId === actorFilter);
  }

  // Resolve actor names in one batch.
  const actorIds = Array.from(new Set(entries.map((e) => e.actorUserId)));
  const namesById = new Map<string, string>();
  if (actorIds.length > 0) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, actorIds));
    for (const r of rows) namesById.set(r.id, r.displayName);
  }

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">Auditoría global</h1>
          <p className="text-sm text-gob-text-gray">
            Últimas {entries.length} entradas del registro de auditoría (todas las acciones de
            autoridad).
          </p>
        </header>

        <form action="/admin/auditoria" method="get" className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            name="action"
            defaultValue={actionFilter ?? ""}
            placeholder="Filtrar por acción"
            className="text-sm rounded-md border border-gob-border-strong bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded-md bg-gob-primary text-white hover:opacity-90"
          >
            Filtrar
          </button>
          {(actionFilter || actorFilter) && (
            <a
              href="/admin/auditoria"
              className="text-xs text-gob-text-muted underline underline-offset-4"
            >
              Limpiar filtros
            </a>
          )}
        </form>

        {entries.length === 0 ? (
          <p className="text-sm text-gob-text-muted">No hay entradas que coincidan.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-gob-border px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-gob-text">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </p>
                  <p className="text-xs text-gob-text-muted">
                    {namesById.get(entry.actorUserId) ?? "Desconocido"}
                    {entry.approvalRequestId && (
                      <>
                        {" "}
                        · req:{" "}
                        <span className="font-mono">{entry.approvalRequestId.slice(0, 8)}…</span>
                      </>
                    )}
                  </p>
                </div>
                <time className="text-xs text-gob-text-muted whitespace-nowrap">
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
