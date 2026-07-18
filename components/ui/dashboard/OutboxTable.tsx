// OutboxTable — shared presentational table for the event-notification outbox
// list surfaces (/admin/outbox + /gob/outbox), which were ~90% duplicated
// (Wave B systemic — shared-component adoption).
//
// The two pages differ only in their QUERY (admin is unscoped and resolves
// source-event → pet links; govt adds a jurisdiction WHERE and hides the
// admin-only detail link). Those differences are injected here as props:
//   - petTokenBySourceEventId — when provided, the "Evento origen" cell links
//     to the pet public page; when omitted the cell is plain mono text (govt).
//   - detailHrefFor — returns the row's detail href, or null to render "—"
//     (govt non-admin has no scoped detail page yet).
//
// This is a Server Component (no interactivity) — safe to receive function
// props from the parent server page.

import Link from "next/link";

import { OpPill } from "@/components/ui/dashboard/OpPill";
import type { OutboxStatus } from "@/db";
import { type BreachCue, buildBreachCue, buildStatusLabel } from "@/lib/infra/outbox-list";
import { AR_TIME_ZONE } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Shared filter/presentation constants (previously duplicated in both pages)
// ---------------------------------------------------------------------------

export const OUTBOX_TARGET_KIND_LABEL: Record<string, string> = {
  govt_webhook: "Webhook govt",
  eno_authority: "Autoridad ENO",
  audit_export: "Exportación auditoría",
  internal_dashboard: "Dashboard interno",
};

export const OUTBOX_TARGET_KIND_VALUES = [
  "govt_webhook",
  "eno_authority",
  "audit_export",
  "internal_dashboard",
] as const;

export const OUTBOX_STATUS_VALUES = ["pending", "delivered", "failed"] as const;

type PillTone = "ok" | "neutral" | "danger" | "escalated";

const BREACH_PILL_TONE: Record<BreachCue, PillTone> = {
  delivered: "ok",
  ok: "neutral",
  breach: "danger",
  failed: "escalated",
};

const BREACH_PILL_LABEL: Record<BreachCue, string> = {
  delivered: "Entregado",
  ok: "En SLA",
  breach: "Incumplimiento",
  failed: "Fallido",
};

// Re-export so filter <option> labels stay in sync across pages.
export { buildStatusLabel };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutboxTableRow {
  id: string;
  status: OutboxStatus;
  slaDueAt: Date;
  targetKind: string;
  targetJurisdictionProvince: string | null;
  targetJurisdictionLocality: string | null;
  sourceEventId: string;
  attempts: number;
  createdAt: Date;
}

export interface OutboxTableProps {
  rows: OutboxTableRow[];
  caption: string;
  /**
   * sourceEventId → pet publicToken. When a row's sourceEventId is present the
   * "Evento origen" cell links to /p/[token]; otherwise it renders plain text.
   * Omit entirely to disable event→pet linking (govt scope).
   */
  petTokenBySourceEventId?: Map<string, string>;
  /** Returns the detail href for a row, or null to render an inert "—" cell. */
  detailHrefFor: (row: OutboxTableRow) => string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TH_CLS = "px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute";

function formatDateTime(value: Date): string {
  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: AR_TIME_ZONE,
  });
}

export function OutboxTable({
  rows,
  caption,
  petTokenBySourceEventId,
  detailHrefFor,
}: OutboxTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ln-op-line">
            <th scope="col" className={TH_CLS}>
              SLA
            </th>
            <th scope="col" className={TH_CLS}>
              Destino
            </th>
            <th scope="col" className={TH_CLS}>
              Jurisdicción
            </th>
            <th scope="col" className={TH_CLS}>
              Evento origen
            </th>
            <th scope="col" className={TH_CLS}>
              Intentos
            </th>
            <th scope="col" className={TH_CLS}>
              Creado
            </th>
            <th scope="col" className={TH_CLS}>
              SLA vence
            </th>
            <th scope="col" className={TH_CLS}>
              Acción
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cue: BreachCue = buildBreachCue(row.status, row.slaDueAt);
            const jurisdiction = [row.targetJurisdictionLocality, row.targetJurisdictionProvince]
              .filter(Boolean)
              .join(", ");
            const petToken = petTokenBySourceEventId?.get(row.sourceEventId);
            const detailHref = detailHrefFor(row);

            return (
              <tr
                key={row.id}
                className={`border-t border-ln-op-line ${cue === "breach" ? "bg-ln-op-danger-bg" : "hover:bg-ln-op-stripe"}`}
              >
                <td className="py-2 px-3 whitespace-nowrap">
                  <OpPill tone={BREACH_PILL_TONE[cue]}>{BREACH_PILL_LABEL[cue]}</OpPill>
                </td>
                <td className="py-2 px-3 whitespace-nowrap text-sm text-ln-op-ink-2">
                  {OUTBOX_TARGET_KIND_LABEL[row.targetKind] ?? row.targetKind}
                </td>
                <td className="py-2 px-3 text-[11px] text-ln-op-ink-2">{jurisdiction || "—"}</td>
                <td className="py-2 px-3">
                  {petToken ? (
                    <Link
                      href={`/p/${petToken}`}
                      className="font-mono text-[11px] text-ln-op-azul underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
                    >
                      {row.sourceEventId.slice(0, 8)}
                      {"…"}
                    </Link>
                  ) : (
                    <span className="font-mono text-[11px] text-ln-op-mute">
                      {row.sourceEventId.slice(0, 8)}
                      {"…"}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-sm text-ln-op-ink-2 text-center">
                  {/* W3: attempts=0 means the drainer never touched this row yet.
                      Rendering a bare "0" on a delivered/breached row read as a
                      real (confusing) attempt count. Show an em dash for
                      never-attempted; the number only once there is one. */}
                  {row.attempts === 0 ? (
                    <span className="text-ln-op-mute" title="Sin intentos de entrega todavía">
                      —
                    </span>
                  ) : (
                    row.attempts
                  )}
                </td>
                <td className="py-2 px-3 text-[11px] text-ln-op-mute whitespace-nowrap">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="py-2 px-3 text-[11px] text-ln-op-mute whitespace-nowrap">
                  {formatDateTime(row.slaDueAt)}
                </td>
                <td className="py-2 px-3">
                  {detailHref ? (
                    // Plain <a> (not next/link) — operator-trust T2. The row →
                    // detail click soft-nav-dropped on this dense list (Next 15.5
                    // client-router defect, see lib/ui/sheet-nav.ts): the link
                    // focused but the page stayed. A real anchor hard-navigates,
                    // so the click always lands on the detail page.
                    <a
                      href={detailHref}
                      className="text-sm font-semibold text-ln-op-azul no-underline underline-offset-2 hover:underline whitespace-nowrap"
                    >
                      {"Detalle ->"}
                    </a>
                  ) : (
                    <span className="text-[11px] text-ln-op-mute">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
