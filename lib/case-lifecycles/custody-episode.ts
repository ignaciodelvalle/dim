// custody_episode lifecycle (decomiso spec §4.2 — activated from deferred per DC10).
//
// Represents the period a pet is in temporary institutional custody:
// from shelter_intake_recorded (shelter intake or govt seizure) until the
// custody ends via handoff, adoption, return to owner, or death.
//
// Opens: shelter_intake_recorded (the physical intake moment).
// Terminals: custody_transferred (handoff to another org / return to owner),
//            adoption_finalized (pet adopted while in custody),
//            death_recorded (cascade: animal died in custody).
// No auto-close cron — the expiry cron for decomiso handoffs only emits
// escalation notifications, it does NOT close the episode automatically
// (decomiso spec DC8 + §13.5: cron notifies govt/admin, humans resolve).
// Manual close: allowed (admin/govt can cancel decomiso per DC authority).
// No reopen — each new custody period opens a fresh episode.

import type { CaseLifecycle } from "./types";

export const custodyEpisodeLifecycle: CaseLifecycle = {
  kind: "custody_episode",
  statusValues: ["open", "closed"],
  phases: [
    "intake_pending_acceptance",
    "active_in_custody",
    "closed_handoff_completed",
    "closed_to_adoption",
    "closed_to_owner_return",
    "closed_pet_died",
  ],
  opensEvents: [
    {
      eventType: "shelter_intake_recorded",
    },
  ],
  terminalEvents: ["custody_transferred", "adoption_finalized", "death_recorded"],
  cronCloseRoute: null,
  cronCloseScheduleHours: 24,
  manualOpenAllowed: true,
  reopenAllowed: false,
};
