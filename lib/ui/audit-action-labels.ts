// Single source of truth for audit-log action → human es-AR label.
//
// Admin fresh-sweep A5: /admin/auditoria and /admin/historial each carried their
// OWN inline ACTION_LABELS map. The auditoria one had only 11 entries, so most
// actions (e.g. pet_events_mutation_override) rendered as the raw code. This is
// the union (historial's comprehensive map); both pages import it via
// auditActionLabel(). Add new actions here when they appear in the audit log.

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Approval queue
  request_approved: "Solicitud aprobada",
  request_rejected: "Solicitud rechazada",
  request_viewed: "Solicitud vista",
  evidence_viewed: "Evidencia vista",
  approval_request_withdrawn_by_applicant: "Solicitud retirada por aplicante",
  approval_request_withdrawn_by_system: "Solicitud vencida (sistema)",
  // Revocations
  revocation_vet: "Revocación matrícula",
  revocation_vet_role: "Revocación matrícula veterinaria",
  revocation_org: "Revocación verificación org",
  revocation_org_verified: "Revocación verificación org",
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
  // Admin actions
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
  self_resignation_vet: "Baja voluntaria matrícula veterinaria",
  self_resignation_govt: "Baja voluntaria cuenta gobierno",
  self_resignation_admin: "Baja voluntaria cuenta admin",
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
  welfare_location_viewed: "Ubicación de caso consultada",
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
  gob_dashboard_export_generated: "Exportación CSV de dashboard",
  ppp_export_generated: "Exportación PPP generada",
  // Pet events override
  pet_events_mutation_override: "Mutación forzada de evento de mascota (override)",
  // Subject rights
  subject_data_exported: "Datos del titular exportados",
  subject_erasure: "Datos del titular eliminados",
  // PII
  adopter_pii_viewed: "Datos del adoptante vistos",
};

/** Human es-AR label for an audit action, falling back to the raw code. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
