// Placeholder for future integration with Argentine sanitary authority
// systems (SENASA RENSE, provincial public-health dashboards, or whatever
// the integration target turns out to be).
//
// When a death_recorded event lands with is_reportable=true, this function
// is the single hook that will dispatch the structured signal. Today it is
// a no-op — the reportable flag lives in the event payload, so the future
// govt-side dashboard can already query the event log directly without
// this hook firing anything.
//
// When the integration is built, this is the only place to wire it.

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
