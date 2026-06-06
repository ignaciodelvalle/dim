// foster_proposal lifecycle (attachment spec §7.10 + foster-volunteers-pool spec §4.5).
//
// Two-phase foster-pool flow (org → volunteer):
//   Phase 1 (Proposal): org emits foster_proposed → opens the case.
//   Phase 2 (Resolution): foster_proposal_resolved closes the case.
//     outcome='accepted'  → cascade emits foster_assigned → opens foster_placement.
//     outcome='rejected'  → closed_reason='resolved', no cascade.
//     outcome='cancelled' → org cancelled their own proposal, closed_reason='cancelled'.
//     outcome='expired'   → cron auto-expires after 7 days, closed_reason='auto_expired'.
//
// Phases (lifecycles spec L1): phases are subdivisions of status='open'. The
// only open phase is pending_response. The outcomes (accepted / rejected /
// cancelled / expired) are discriminated by closed_reason/payload — they are
// NOT phases; they describe a closed case.
//
// Cron close: /api/cron/expire-foster-proposals. proposeFosterAction opens a
// cases row and writes its id to foster_proposals.case_id (migration 0068).
// The expirer cron resolves case_id from the proposal row (or falls back to
// findOpenCaseForPetAndKind) and calls closeCase with reason='auto_expired'.
//
// No reopen — if a volunteer declines, the org opens a new proposal.

import type { CaseLifecycle } from "./types";

export const fosterProposalLifecycle: CaseLifecycle = {
  kind: "foster_proposal",
  statusValues: ["open", "closed"],
  // pending_response is the only genuine open phase (lifecycles spec L1: phases
  // are subdivisions of status='open'). accepted / rejected / cancelled / expired
  // are closed outcomes — discriminated by closed_reason/payload, not phases.
  phases: ["pending_response"],
  opensEvents: [
    {
      eventType: "foster_proposed",
    },
  ],
  terminalEvents: ["foster_proposal_resolved"],
  cronCloseRoute: "/api/cron/expire-foster-proposals",
  cronCloseScheduleHours: 24,
  manualOpenAllowed: false,
  reopenAllowed: false,
};
