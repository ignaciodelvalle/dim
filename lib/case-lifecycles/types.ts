// Shared types for case lifecycle declarations. Each `lib/case-lifecycles/<kind>.ts`
// exports one `CaseLifecycle` whose shape lets the rest of the system answer:
// "Which events open / close this kind? Which states + phases are admitted?
// Is there an auto-close cron? Is reopen allowed?"

import type { EventType } from "@/db/schema";
import type { CaseKind } from "../case-kinds";

export type CaseStatus = "open" | "escalated" | "closed" | "merged";

export interface OpenTrigger {
  /** The event_type whose INSERT may open this kind of case. */
  eventType: EventType;
  /**
   * Optional payload-guard. The event opens the case only when this
   * predicate is true for its payload. Use to express the
   * "incident_type='bite_inflicted'" branch of `incident_reported`,
   * the "to_status='lost'" branch of `status_changed`, etc.
   *
   * Type the input as `unknown` and narrow inside — server actions
   * already type their payloads via Zod before calling.
   */
  whenPayload?: (payload: Record<string, unknown>) => boolean;
}

export interface CaseLifecycle {
  kind: CaseKind;

  /** Which `status` values the kind is allowed to transition through. */
  statusValues: readonly CaseStatus[];

  /**
   * Phase identifiers observable in the UI. NOT stored — derived from
   * the latest relevant event at read time. Listed here so docs/tests
   * can iterate them and the UI knows the universe.
   */
  phases: readonly string[];

  /** Events that may open a case of this kind (attachment mode `opens`). */
  opensEvents: readonly OpenTrigger[];

  /**
   * Events that close the case at INSERT time. The server action that
   * emits the event also flips `cases.status` and sets `closed_*`.
   */
  terminalEvents: readonly EventType[];

  /** Auto-close cron route, if the kind has one. null = no cron. */
  cronCloseRoute: string | null;

  /**
   * Cron cadence in hours. Most kinds run daily (24); rabies is 12.
   * Ignored when cronCloseRoute is null.
   */
  cronCloseScheduleHours: number;

  /** True for kinds an admin/govt can open without an event (welfare_denuncia). */
  manualOpenAllowed: boolean;

  /** Re-open from closed back to open. Only adoption_listing allows it. */
  reopenAllowed: boolean;
}
