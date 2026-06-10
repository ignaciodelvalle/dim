import { desc, eq } from "drizzle-orm";

import { OpCard, OpCardBody } from "@/components/ui/dashboard";
import { auditLog, db, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

const ACTION_LABELS: Record<string, string> = {
  // Approval queue
  request_approved: "Solicitud aprobada",
  request_rejected: "Solicitud rechazada",
  request_viewed: "Solicitud vista",
  approval_request_withdrawn_by_applicant: "Solicitud retirada por aplicante",
  // Revocations
  revocation_vet: "Revocación matrícula veterinaria",
  revocation_vet_role: "Revocación matrícula veterinaria",
  revocation_org: "Revocación verificación organización",
  revocation_org_verified: "Revocación verificación organización",
  revocation_govt_assignment: "Revocación localidad gobierno",
  // Deactivations
  deactivation_govt: "Desactivación cuenta gobierno",
  deactivation_admin: "Desactivación cuenta admin",
  govt_deactivated_by_admin: "Desactivación cuenta gobierno (por admin)",
  admin_deactivated_by_admin: "Desactivación cuenta admin (por admin)",
  govt_self_deactivated: "Baja voluntaria cuenta gobierno",
  // Admin actions
  pii_queried: "Búsqueda de información personal",
  admin_seeded: "Admin inicializado",
  operator_credentials_reset: "Credenciales de operador reiniciadas",
  institutional_create_orphan_auth_user: "Usuario institucional creado sin perfil",
  govt_locality_assigned: "Localidad asignada a usuario gobierno",
  // Disputes
  dispute_raised: "Disputa de custodia abierta",
  dispute_party_added: "Parte añadida a disputa",
  dispute_resolved: "Disputa de custodia resuelta",
  dispute_withdrawn: "Disputa de custodia retirada",
  dispute_escalated: "Disputa escalada a vía judicial",
  // Claims
  claim_dispute_submitted: "Reclamo de custodia enviado",
  free_pet_claimed: "Animal sin dueño reclamado",
  // Decomisos
  decomiso_executed: "Decomiso ejecutado",
  decomiso_handoff_accepted: "Entrega de decomiso aceptada",
  decomiso_handoff_rejected: "Entrega de decomiso rechazada",
  decomiso_handoff_cancelled: "Entrega de decomiso cancelada",
  // Business rules
  govt_business_rule_created: "Regla de negocio creada",
  govt_business_rule_updated: "Regla de negocio actualizada",
  govt_business_rule_deleted: "Regla de negocio eliminada",
  // Profile / account
  profile_self_updated: "Perfil actualizado",
  profile_avatar_updated: "Avatar actualizado",
  self_resignation_vet: "Baja voluntaria matrícula veterinaria",
  // Other
  service_dog_credential_revoked: "Credencial animal de asistencia revocada",
  ppp_export_generated: "Exportación PPP generada",
  microchip_replaced: "Microchip reemplazado",
  "microchip.replace": "Microchip reemplazado",
  dni_verified_self: "DNI verificado por el titular",
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
