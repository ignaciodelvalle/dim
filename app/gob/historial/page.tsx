import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { OpCard, OpCardBody } from "@/components/ui/dashboard";
import { approvalRequests, auditLog, db, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";

const ACTION_LABELS: Record<string, string> = {
  // Approval queue
  request_approved: "Solicitud aprobada",
  request_rejected: "Solicitud rechazada",
  request_viewed: "Solicitud vista",
  evidence_viewed: "Evidencia vista",
  approval_request_withdrawn_by_applicant: "Solicitud retirada por aplicante",
  approval_request_withdrawn_by_system: "Solicitud vencida (sistema)",
  // Revocations
  revocation_vet: "Revocación matrícula veterinaria",
  revocation_vet_role: "Revocación matrícula veterinaria",
  revocation_org: "Revocación verificación organización",
  revocation_org_verified: "Revocación verificación organización",
  revocation_govt_assignment: "Revocación localidad gobierno",
  revocation_govt_role: "Revocación rol gobierno",
  revocation_admin_role: "Revocación rol admin",
  revocation_scheduling: "Revocación scheduling",
  service_dog_credential_revoked: "Credencial animal de asistencia revocada",
  // Deactivations
  deactivation_govt: "Desactivación cuenta gobierno",
  deactivation_admin: "Desactivación cuenta admin",
  govt_deactivated_by_admin: "Desactivación cuenta gobierno (por admin)",
  admin_deactivated_by_admin: "Desactivación cuenta admin (por admin)",
  govt_self_deactivated: "Baja voluntaria cuenta gobierno",
  self_resignation_govt: "Baja voluntaria cuenta gobierno",
  self_resignation_admin: "Baja voluntaria cuenta admin",
  self_resignation_vet: "Baja voluntaria matrícula veterinaria",
  // Admin / account setup
  pii_queried: "Búsqueda de información personal",
  admin_seeded: "Admin inicializado",
  operator_credentials_reset: "Credenciales de operador reiniciadas",
  institutional_create_orphan_auth_user: "Usuario institucional creado sin perfil",
  institutional_govt_created: "Cuenta gobierno creada",
  institutional_admin_created: "Cuenta admin creada",
  govt_locality_assigned: "Localidad asignada a usuario gobierno",
  // Profile / account
  profile_self_updated: "Perfil actualizado",
  profile_avatar_updated: "Avatar actualizado",
  profile_avatar_upload_failed: "Subida de avatar fallida",
  dni_verified_self: "DNI verificado por el titular",
  // Disputes
  dispute_raised: "Disputa de custodia abierta",
  dispute_party_added: "Parte añadida a disputa",
  dispute_resolved: "Disputa de custodia resuelta",
  dispute_withdrawn: "Disputa de custodia retirada",
  dispute_escalated: "Disputa escalada a vía judicial",
  claim_dispute_submitted: "Reclamo de custodia enviado",
  free_pet_claimed: "Animal sin dueño reclamado",
  // Welfare
  welfare_report_triaged: "Denuncia de maltrato en revisión",
  welfare_report_started: "Seguimiento de denuncia iniciado",
  welfare_report_closed: "Denuncia de maltrato cerrada",
  welfare_report_unflagged: "Denuncia desflagged (moderación)",
  welfare_report_confirmed_spam: "Denuncia marcada como spam",
  welfare_report_submitted_by_org: "Denuncia enviada por organización",
  welfare_report_derived_to_org: "Denuncia derivada a organización",
  welfare_mpf_export_generated: "Exportación MPF generada",
  // Decomisos
  decomiso_executed: "Decomiso ejecutado",
  decomiso_handoff_accepted: "Entrega de decomiso aceptada",
  decomiso_handoff_rejected: "Entrega de decomiso rechazada",
  decomiso_handoff_cancelled: "Entrega de decomiso cancelada",
  // Cross-org transfers
  cross_org_transfer_proposed: "Transferencia entre orgs propuesta",
  cross_org_transfer_accepted: "Transferencia entre orgs aceptada",
  cross_org_transfer_rejected: "Transferencia entre orgs rechazada",
  cross_org_transfer_cancelled_by_sender: "Transferencia entre orgs cancelada",
  cross_org_transfer_auto_expired: "Transferencia entre orgs vencida",
  // Adoption
  adoption_application_submitted: "Solicitud de adopción enviada",
  adoption_application_resolved: "Solicitud de adopción resuelta",
  // Business rules
  govt_business_rule_created: "Regla de negocio creada",
  govt_business_rule_updated: "Regla de negocio actualizada",
  govt_business_rule_deleted: "Regla de negocio eliminada",
  // Org membership
  org_member_added: "Miembro agregado a organización",
  org_member_removed: "Miembro removido de organización",
  org_member_role_changed: "Rol de miembro cambiado",
  org_member_event_write_changed: "Acceso clínico de miembro actualizado",
  org_verified: "Organización verificada",
  org_unverified: "Verificación de organización revocada",
  // Microchip
  "microchip.replace": "Microchip reemplazado",
  microchip_replaced: "Microchip reemplazado",
  // Outbreak
  outbreak_investigation_opened: "Investigación de brote abierta",
  outbreak_investigation_escalated: "Investigación de brote escalada",
  outbreak_investigation_closed_resolved: "Investigación de brote cerrada (resuelta)",
  outbreak_investigation_closed_dismissed: "Investigación de brote cerrada (descartada)",
  outbreak_investigation_note_added: "Nota de investigación de brote añadida",
  // ENO
  eno_notification_emitted: "Notificación ENO emitida",
  eno_backfill_run_completed: "Backfill ENO ejecutado",
  // Pet transfers
  pet_transfer_initiated: "Transferencia de mascota iniciada",
  pet_transfer_accepted: "Transferencia de mascota aceptada",
  pet_transfer_rejected: "Transferencia de mascota rechazada",
  pet_transfer_cancelled: "Transferencia de mascota cancelada",
  pet_transfer_expired: "Transferencia de mascota vencida",
  // Exports
  analytics_export_generated: "Exportación analytics generada",
  ppp_export_generated: "Exportación PPP generada",
  // Subject rights
  subject_data_exported: "Datos del titular exportados",
  subject_erasure: "Datos del titular eliminados",
  // PII
  adopter_pii_viewed: "Datos del adoptante vistos",
  // Misc
  pet_events_mutation_override: "Mutación forzada de evento de mascota (override)",
};

const GOB_HISTORIAL_PAGE_LIMIT = 100;

export default async function GobHistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { user } = await requireAdminOrGovtOrRedirect();
  const { cursor: rawCursor } = await searchParams;
  const cursor = decodeCursor(rawCursor);

  // Entries and actor profile are independent — run in parallel.
  // Fetch limit+1 to detect hasMore for keyset pagination (PERF-5).
  const cursorClause = keysetWhere(auditLog.performedAt, auditLog.id, cursor);
  const whereClause = cursorClause
    ? and(eq(auditLog.actorUserId, user.id), cursorClause)
    : eq(auditLog.actorUserId, user.id);

  const [[actor], rawEntries] = await Promise.all([
    db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        performedAt: auditLog.performedAt,
        approvalRequestId: auditLog.approvalRequestId,
        payload: auditLog.payload,
      })
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.performedAt), desc(auditLog.id))
      .limit(GOB_HISTORIAL_PAGE_LIMIT + 1),
  ]);

  const hasMore = rawEntries.length > GOB_HISTORIAL_PAGE_LIMIT;
  const entries = hasMore ? rawEntries.slice(0, GOB_HISTORIAL_PAGE_LIMIT) : rawEntries;

  const lastEntry = entries.at(-1);
  const olderLink =
    hasMore && lastEntry
      ? olderHref("/gob/historial", {}, { ts: lastEntry.performedAt, id: lastEntry.id })
      : null;
  const newerLink = rawCursor ? newerHref("/gob/historial", {}) : null;

  // Build a lookup from approvalRequestId → publicToken so we can link to the
  // detail page instead of showing raw UUIDs (P2 audit action labels).
  const reqIds = entries.map((e) => e.approvalRequestId).filter((id): id is string => id !== null);
  const tokenByReqId = new Map<string, string>();
  if (reqIds.length > 0) {
    const reqRows = await db
      .select({ id: approvalRequests.id, publicToken: approvalRequests.publicToken })
      .from(approvalRequests)
      .where(inArray(approvalRequests.id, reqIds));
    for (const r of reqRows) tokenByReqId.set(r.id, r.publicToken);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Historial</p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Mi historial</h1>
        <p className="text-[13px] text-ln-op-mute">
          Últimas {entries.length} acciones realizadas por{" "}
          <span className="font-medium text-ln-op-ink">{actor?.displayName ?? user.id}</span>.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">No registraste acciones todavía.</p>
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
                    {entry.action === "pii_queried" &&
                      entry.payload != null &&
                      typeof entry.payload === "object" &&
                      (() => {
                        const p = entry.payload as Record<string, unknown>;
                        const query = typeof p.query === "string" ? p.query : null;
                        const surface = typeof p.surface === "string" ? p.surface : null;
                        const count = typeof p.result_count === "number" ? p.result_count : null;
                        const parts: string[] = [];
                        if (query) parts.push(`"${query}"`);
                        if (surface) parts.push(surface);
                        if (count !== null)
                          parts.push(`${count} resultado${count !== 1 ? "s" : ""}`);
                        return parts.length > 0 ? (
                          <p className="text-[11px] text-ln-op-mute">{parts.join(" · ")}</p>
                        ) : null;
                      })()}
                    {entry.approvalRequestId &&
                      (() => {
                        const token = tokenByReqId.get(entry.approvalRequestId);
                        return token ? (
                          <Link
                            href={`/gob/cola/${token}`}
                            className="font-mono text-[11px] text-ln-op-azul underline underline-offset-2 hover:opacity-80"
                          >
                            Ver solicitud →
                          </Link>
                        ) : (
                          <p className="font-mono text-[11px] text-ln-op-mute">
                            req: {entry.approvalRequestId.slice(0, 8)}…
                          </p>
                        );
                      })()}
                  </div>
                  <time className="text-sm text-ln-op-mute whitespace-nowrap tabular-nums">
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

      {/* Pagination footer */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de historial"
          className="flex items-center justify-between gap-4 border-t border-ln-op-line pt-4"
        >
          <div>
            {newerLink && (
              <Link
                href={newerLink}
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
              >
                ← Más recientes
              </Link>
            )}
          </div>
          <div>
            {olderLink && (
              <Link
                href={olderLink}
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
              >
                Ver más antiguos →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
