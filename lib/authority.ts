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
