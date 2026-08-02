// case-queue-csv — the CSV projection of CaseQueue rows (Q1, CSV export
// parity). Server-safe (no "use client"): both casos twins (/gob/casos and
// /admin/casos) call this from their server components and hand the result to
// <CsvExportLink>, so the two queues can never drift into different exports
// of the same table.
//
// Cell vocabulary mirrors CaseQueue's own cells exactly — caseKindLabel,
// caseStatusDisplay, the "Animal sin registrar" fallback for unowned
// subjects, the "locality, province" join — because the export's contract is
// "exactly what the screen shows", not a second rendering.
//
// ORDER NOTE: rows are exported in the SERVER order (openedAt desc). The
// on-screen queue may re-sort its page client-side ("Urgencia" default —
// CaseQueue.sortMode); callers declare that divergence in a `#` context line
// (see CASE_QUEUE_CSV_ORDER_NOTE) instead of silently exporting an order the
// file does not carry the inputs to verify.

import type { CaseQueueRow } from "@/components/ui/dashboard/CaseQueue";
import { caseStatusDisplay } from "@/components/ui/dashboard/CaseStatusBadge";
import { formatDate } from "@/lib/utils/format";
import { caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

export const CASE_QUEUE_CSV_COLUMNS = [
  "Código",
  "Tipo",
  "Estado",
  "Mascota",
  "Jurisdicción",
  "Apertura",
  "Cierre",
];

export const CASE_QUEUE_CSV_ORDER_NOTE =
  "# Orden del archivo: apertura más reciente primero (en pantalla la cola puede ordenar por urgencia)";

/** One CSV row per queue row, cell-for-cell what CaseQueue renders. */
export function caseQueueCsvRows(rows: CaseQueueRow[]): string[][] {
  return rows.map((row) => [
    row.publicCode,
    caseKindLabel(row.caseKind),
    caseStatusDisplay(row.status).label,
    row.primaryPetName ??
      (row.primarySubjectKind === "unowned_animal" ? "Animal sin registrar" : "—"),
    row.jurisdictionLocality && row.jurisdictionProvince
      ? `${row.jurisdictionLocality}, ${row.jurisdictionProvince}`
      : (row.jurisdictionProvince ?? "—"),
    formatDate(row.openedAt),
    row.closedAt ? formatDate(row.closedAt) : "",
  ]);
}
