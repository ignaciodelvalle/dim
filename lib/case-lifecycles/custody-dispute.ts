// custody_dispute lifecycle (lifecycles spec §10).
//
// Opens: custody_dispute_raised (admin/govt only). Linked to a
// custody_disputes row.
// Terminal: custody_dispute_resolved (admin/govt only).
// Escalation cron: NO auto-close. Cron emits notifications for disputes
// open >365 days (escalation visible, not status change).
// No reopen — resolved disputes stay resolved.

import type { CaseLifecycle } from "./types";

export const custodyDisputeLifecycle: CaseLifecycle = {
  kind: "custody_dispute",
  statusValues: ["open", "escalated", "closed"],
  phases: [
    "dispute_open",
    "dispute_escalated_stale",
    "closed_ownership_confirmed",
    "closed_ownership_transferred",
    "closed_case_dismissed",
    "closed_other",
  ],
  opensEvents: [
    {
      eventType: "custody_dispute_raised",
    },
  ],
  terminalEvents: ["custody_dispute_resolved"],
  cronCloseRoute: null,
  cronCloseScheduleHours: 24,
  manualOpenAllowed: false,
  reopenAllowed: false,
};
