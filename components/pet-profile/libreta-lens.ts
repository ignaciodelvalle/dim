// Pure lens filters for Face 2 (Libreta)'s three lenses — Todo, Vacunas,
// Oficial. Replaces EventTimeline's per-type chip bar (design ADR-3): lenses
// filter the SAME unified future+past ledger, they are not a second nav axis.

import { isLibretaSanitariaEvent } from "@/lib/infra/libreta-sanitaria";
import type { FutureLedgerItem } from "./libreta-future.helpers";

export type LibretaLens = "todo" | "vacunas" | "oficial";

/**
 * Filters a past (historial) event by lens.
 *   todo    — everything.
 *   vacunas — vaccination_administered only.
 *   oficial — the full LIBRETA_SANITARIA_EVENT_TYPES whitelist.
 */
export function pastEventMatchesLens(eventType: string, lens: LibretaLens): boolean {
  if (lens === "todo") return true;
  if (lens === "vacunas") return eventType === "vaccination_administered";
  return isLibretaSanitariaEvent(eventType);
}

/**
 * Filters a future (PRÓXIMO) ledger item by lens.
 *
 * Reminder-kind items always pass — every reminder Face 2 receives is a
 * vaccine reminder (fetchActiveRemindersForPet filters reminderType ===
 * "vaccine"), so they satisfy "vacunas = vaccination + vaccine reminders" by
 * construction. Medication doses and appointments are excluded under
 * `vacunas` (not vaccine-related) but included under `oficial` (both are
 * libreta-sanitaria-relevant record types).
 */
export function futureItemMatchesLens(item: FutureLedgerItem, lens: LibretaLens): boolean {
  if (lens === "todo") return true;
  if (item.kind === "reminder") return true;
  return lens === "oficial";
}
