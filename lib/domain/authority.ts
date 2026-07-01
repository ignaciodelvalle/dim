// lib/authority.ts
//
// Placeholder for future integrations with Argentine authority systems.
//
// signalAuthorityReport — dispatches a structured disease/death signal to
// SENASA RENSE, provincial public-health dashboards, or equivalent. Today
// a no-op; the reportable flag in the event payload lets future dashboards
// query directly. Wire here when the integration target is decided.
//
// signalWelfareReport — dispatches an animal-welfare denuncia to the real
// authority channel (Ley Nacional 14.346 denuncia pipeline, brigada ambiental,
// fiscalía especializada, NGO partner triage queue, or wherever the integration
// target is decided). Today a no-op.

export type AuthorityReportInput = {
  eventId: string;
  petId: string;
  diseaseCode: string;
  confirmedByLab: boolean;
  occurredAt: Date;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
};

export async function signalAuthorityReport(_input: AuthorityReportInput): Promise<void> {
  // TODO(authority-integration): dispatch the report to the real authority
  // system (SENASA / provincial portal / HL7 FHIR endpoint / etc.) when
  // the destination is decided. Today: no-op.
  return;
}

export type WelfareReportSignalInput = {
  reportId: string;
  kind: string;
  severity: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  hasContact: boolean;
};

export async function signalWelfareReport(_input: WelfareReportSignalInput): Promise<void> {
  // TODO(authority-integration): dispatch the welfare report to the real
  // animal-welfare authority channel (Ley Nacional 14.346 denuncia pipeline,
  // brigada ambiental, fiscalía especializada, NGO partner triage queue,
  // or wherever the integration target is decided). Today: no-op.
  return;
}

// ---------------------------------------------------------------------------
// Outbreak investigation — ENO external notification (SNVS/SENASA/zoonosis)
// ---------------------------------------------------------------------------
//
// Legal obligation: Ley 15.465/60 + Decreto 3640/64 (enfermedades de
// notificación obligatoria). Today a no-op with v1_noop marker for
// auditability. The marker lets future dashboards identify undelivered
// notifications and replay them once the integration target is confirmed.

export type OutbreakInvestigationNotifyInput = {
  casePublicCode: string;
  caseId: string;
  diseaseCode: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  openedByUserId: string;
};

export type OutbreakInvestigationNotifyResult = {
  /** True when the notification was delivered to an external system. */
  delivered: boolean;
  /**
   * Present when no integration is wired. Lets future audits identify
   * cases that need replay once the integration target is confirmed.
   */
  v1_noop?: true;
  /** Target system identifier (future use). */
  target?: string;
};

export async function notifyOutbreakInvestigationOpened(
  _input: OutbreakInvestigationNotifyInput,
): Promise<OutbreakInvestigationNotifyResult> {
  // v1: no-op. Wire SNVS/SENASA/zoonosis endpoint here when the integration
  // target is confirmed. The v1_noop marker persists in caller audit rows
  // so future automation can identify cases that need replay.
  return { delivered: false, v1_noop: true };
}
