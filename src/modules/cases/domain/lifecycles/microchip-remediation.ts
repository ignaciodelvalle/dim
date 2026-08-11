// microchip_remediation lifecycle.
//
// Opens: microchip_replaced with reason='fraud_detected' OR 'duplicate_detected'.
// Branching enforced in lib/case-attachment.ts:119.
// Terminal: explicit close by admin/govt (no event opener for close — admin marks
// the case resolved with closed_reason='resolved' | 'cancelled' | 'merged').
// No auto-close cron.
// No reopen — once resolved, a new microchip_replaced opens a fresh case.

import type { CaseLifecycle } from "./types";

export const microchipRemediationLifecycle: CaseLifecycle = {
  kind: "microchip_remediation",
  statusValues: ["open", "escalated", "closed"],
  opensEvents: [
    {
      eventType: "microchip_replaced",
      whenPayload: (p) => p.reason === "fraud_detected" || p.reason === "duplicate_detected",
    },
  ],
  // NO terminal events — and `manualCloseAllowed` below is false, so this kind
  // has NO closing path at all today. The previous comment here said "closed
  // manually via case action", which stopped being true when #41 shipped the
  // manual close gated on `manualCloseAllowed` (2026-08-10). Left as a declared
  // gap rather than a silent one; see L-22 in docs/plans/PENDIENTES.md.
  terminalEvents: [],
  cronCloseRoute: null,
  cronCloseScheduleHours: 24,
  manualOpenAllowed: true,
  // Nadie documentó una política de cierre manual para este kind.  no
  // es una prohibición decidida: es la ausencia de una decisión escrita.
  manualCloseAllowed: false,
  reopenAllowed: false,
};
