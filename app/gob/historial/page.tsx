import { desc, eq } from "drizzle-orm";

import { OpCard, OpCardBody } from "@/components/ui/dashboard";
import { auditLog, db, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

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
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Historial
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Mi historial</h1>
        <p className="text-[13px] text-ln-op-mute">
          Ultimas {entries.length} acciones realizadas por{" "}
          <span className="font-medium text-ln-op-ink">{actor?.displayName ?? user.id}</span>.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">No registraste acciones todavia.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <OpCard>
                <OpCardBody className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[13px] text-ln-op-ink">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    {entry.approvalRequestId && (
                      <p className="text-[12px] text-ln-op-mute font-mono">
                        req: {entry.approvalRequestId}
                      </p>
                    )}
                  </div>
                  <time className="text-[12px] text-ln-op-mute whitespace-nowrap tabular-nums">
                    {new Date(entry.performedAt).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </OpCardBody>
              </OpCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
