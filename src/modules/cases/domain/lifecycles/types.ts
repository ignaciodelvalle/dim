// Shared types for case lifecycle declarations. Each
// `src/modules/cases/domain/lifecycles/<kind>.ts` exports one `CaseLifecycle`
// whose shape lets the rest of the system answer:
// "Which events open / close this kind? Which states are admitted?
// Is there an auto-close cron? Is reopen allowed?"

import type { EventType } from "@dim/contract/events";
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

  /**
   * True for kinds an admin/govt can CLOSE by hand, without waiting for a
   * terminal event.
   *
   * Added 2026-08-10, y vale explicar por qué era necesario. `custody-episode.ts`
   * decía en prosa "Manual close: allowed (admin/govt can cancel decomiso per DC
   * authority)" — una frase correcta que ningún código podía leer. Cuando el
   * detalle de caso ganó su botón de cerrar, la regla de la casa era que las
   * acciones se DERIVAN del ciclo de vida y no se inventan; con la política
   * viviendo en un comentario, "derivar" habría sido imposible y el botón habría
   * quedado apoyado en que alguien se acuerde.
   *
   * Arranca en `true` SÓLO para `custody_episode`, que es el único de los doce
   * cuya política estaba documentada. Los otros once son `false` no porque se
   * haya decidido prohibirlo, sino porque nadie lo escribió — y un cierre manual
   * cierra un expediente legal. Habilitar uno nuevo es una línea acá más la
   * razón al lado, que es exactamente la fricción que corresponde.
   */
  manualCloseAllowed: boolean;

  /** Re-open from closed back to open. Only adoption_listing allows it. */
  reopenAllowed: boolean;
}
