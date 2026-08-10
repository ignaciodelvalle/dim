// welfare_denuncia lifecycle (lifecycles spec §7).
//
// Opens: INSERT of a welfare_reports row → cases row created in the same
// transaction. NO direct pet_events opener (the bridge events
// `maltreatment_reported` / `abandonment_reported` / `symptom_observed`
// require the case to exist already — they're `requires-open` per
// attachment spec §7.9).
// Terminal: status transitions of the welfare_reports.status field —
// specifically when it lands on 'closed'. The case action does the
// dual-write.
// Escalation cron: NO auto-close. The cron only emits notifications to
// the assigned officer for in_progress reports with no events >90d.
// Manual open: ALLOWED — admin/govt can open a welfare_denuncia for an
// off-channel report.

import type { CaseLifecycle } from "./types";

export const welfareDenunciaLifecycle: CaseLifecycle = {
  kind: "welfare_denuncia",
  statusValues: ["open", "escalated", "closed", "merged"],
  // The kind is opened atomically with `welfare_reports` row creation,
  // not by a pet_events row. opensEvents stays empty so the attachment
  // helper doesn't try to auto-open from a pet_events insert.
  opensEvents: [],
  // No pet_events row "terminates" the case — the action updates
  // welfare_reports.status, which dual-writes to cases.status.
  terminalEvents: [],
  cronCloseRoute: null,
  cronCloseScheduleHours: 24,
  manualOpenAllowed: true,
  // Nadie documentó una política de cierre manual para este kind.  no
  // es una prohibición decidida: es la ausencia de una decisión escrita.
  manualCloseAllowed: false,
  reopenAllowed: false,
};
