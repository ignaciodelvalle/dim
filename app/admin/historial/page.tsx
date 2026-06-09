import { desc, eq } from "drizzle-orm";

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

export default async function AdminHistorialPage() {
  const { user } = await requireAdminOrRedirect();

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

  // Resolve actor display name
  const [actor] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Mi historial</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Ultimas {entries.length} acciones realizadas por{" "}
          <span className="font-semibold">{actor?.displayName ?? user.id}</span>.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">No registraste acciones todavia.</p>
      ) : (
        <OpCard>
          <OpCardHead
            title="Acciones registradas"
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
                    <p className="text-[13px] text-ln-op-ink">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    {entry.approvalRequestId && (
                      <p className="font-ln-mono text-[11px] text-ln-op-mute">
                        req: {entry.approvalRequestId}
                      </p>
                    )}
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
