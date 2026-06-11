import { desc, eq, inArray } from "drizzle-orm";

import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { auditLog, db, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

const ACTION_LABELS: Record<string, string> = {
  request_approved: "Solicitud aprobada",
  request_rejected: "Solicitud rechazada",
  request_viewed: "Solicitud vista",
  revocation_vet: "Revocacion matricula",
  revocation_org: "Revocacion verificacion org",
  revocation_govt_assignment: "Revocacion localidad govt",
  deactivation_govt: "Desactivacion cuenta govt",
  deactivation_admin: "Desactivacion cuenta admin",
  pii_queried: "Busqueda de PII",
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

  // Resolve actor names in one batch. actorUserId is nullable (ARCH-H,
  // migration 0080): rows whose actor was hard-deleted have NULL actor_user_id.
  const actorIds = Array.from(
    new Set(entries.map((e) => e.actorUserId).filter((id): id is string => id !== null)),
  );
  const namesById = new Map<string, string>();
  if (actorIds.length > 0) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, actorIds));
    for (const r of rows) namesById.set(r.id, r.displayName);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Auditoria global</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Ultimas {entries.length} entradas del registro de auditoria (todas las acciones de
          autoridad).
        </p>
      </header>

      <form action="/admin/auditoria" method="get" className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="action"
          defaultValue={actionFilter ?? ""}
          placeholder="Filtrar por accion"
          className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <button
          type="submit"
          className="rounded-[6px] bg-ln-op-azul px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
        >
          Filtrar
        </button>
        {(actionFilter || actorFilter) && (
          <a
            href="/admin/auditoria"
            className="text-[12px] text-ln-op-mute underline underline-offset-4"
          >
            Limpiar filtros
          </a>
        )}
      </form>

      {entries.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">No hay entradas que coincidan.</p>
      ) : (
        <OpCard>
          <OpCardHead
            title="Registro de auditoría"
            actions={<span className="text-[12px] text-ln-op-mute">{entries.length} entradas</span>}
          />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[13px] font-medium text-ln-op-ink">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <p className="text-[12px] text-ln-op-mute">
                      {entry.actorUserId
                        ? (namesById.get(entry.actorUserId) ?? "Desconocido")
                        : "Usuario eliminado"}
                      {entry.approvalRequestId && (
                        <>
                          {" "}
                          {"·"} req:{" "}
                          <span className="font-ln-mono">
                            {entry.approvalRequestId.slice(0, 8)}&#x2026;
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <time className="whitespace-nowrap text-[12px] text-ln-op-mute">
                    {new Date(entry.performedAt).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
      )}
    </div>
  );
}
