"use client";

// CaseQueue — unified queue component for case (expediente) list surfaces.
//
// Props:
//   rows     — pre-fetched list rows (CaseListItem shape from lib/case-queries)
//   filters  — active filter state (kind, status); drives chip highlights
//   bulk     — optional OpBulkBar config (reuses Item 10's bulk pattern)
//
// The queue owns row-selection state (Set<string>) when bulk is supplied.
// Filter navigation is URL-driven (chips are <a> links); the component is
// purely presentational for filtering.
//
// A11y:
//   - table with <caption> + <th scope="col">
//   - checkbox header with aria-label
//   - selection count announced via aria-live (delegated to OpBulkBar)
//   - "N casos" count announced below the filter chips
//
// Responsive: on narrow screens the table collapses — kind/status stay
// visible; province/locality stack under the code.

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { CaseStatusBadge } from "@/components/ui/dashboard/CaseStatusBadge";
import { type OpBulkAction, OpBulkBar } from "@/components/ui/dashboard/OpBulkBar";
import { OpButton } from "@/components/ui/dashboard/OpButton";
import { OpCodeBadge } from "@/components/ui/dashboard/OpCodeBadge";
import { OpPill } from "@/components/ui/dashboard/OpPill";
import type { CaseStatus, CaseSubjectKind } from "@/db/schema";
import { computeDueInfo, dueDateBadge } from "@/lib/domain/due-state";
import { formatDate, pluralizeEs } from "@/lib/utils/format";
import {
  type CaseKind,
  caseKindLabel,
  caseKindSeverityWeight,
} from "@/src/modules/cases/domain/case-kinds";
import { CASE_SLA_WARNING_DAYS, caseSlaDueAt } from "@/src/modules/cases/domain/case-sla";

// ---------------------------------------------------------------------------
// SLA / age helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Open cases pending for longer than this many days are considered SLA-breached.
 * Visual-only: no auto-close occurs. 14 days aligns with the typical org
 * review window for escalated/unresolved cases.
 */
// The SLA deadline rule lives in a PURE module (src/modules/cases/domain/
// case-sla.ts), not here: the RSC server graph (/gob/acciones' worklist-core.ts)
// must import CASE_SLA_WARNING_DAYS too, and a "use client" export becomes a
// throw-on-coerce Proxy there. Re-exported so this component's own consumers and
// tests keep their import path.
export { CASE_SLA_WARNING_DAYS, caseSlaDueAt };

/**
 * Returns the number of whole days elapsed since the case was opened (floored).
 * Accepts a Date so callers from server components pass Date objects directly.
 */
export function ageCaseDays(openedAt: Date): number {
  const diffMs = Date.now() - openedAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Urgency score (PO interview 2026-07-23, item 6) — age-days × kind-severity
// weight (CASE_KIND_SEVERITY_WEIGHT, src/modules/cases/domain/case-kinds.ts).
// A closed case scores 0 regardless of age — it is resolved, never urgent —
// so it always sinks below every open row under the default sort.
// ---------------------------------------------------------------------------

export function caseUrgencyScore(
  row: Pick<CaseQueueRow, "caseKind" | "openedAt" | "closedAt">,
): number {
  if (row.closedAt !== null) return 0;
  return ageCaseDays(row.openedAt) * caseKindSeverityWeight(row.caseKind);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaseQueueRow {
  id: string;
  publicCode: string;
  caseKind: CaseKind;
  status: CaseStatus;
  /**
   * Optional: only producers backed by the `cases` table set this (case-queries.ts).
   * Rows synthesized from a different table (e.g. DisputasScreen's custody
   * disputes, which always join a pet — petId is NOT NULL there) omit it, since
   * their `primaryPetName` is never null and the fallback never triggers.
   */
  primarySubjectKind?: CaseSubjectKind;
  primaryPetName: string | null;
  primaryPetPublicToken: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  openedAt: Date;
  closedAt: Date | null;
  /** Optional href for the detail link. Defaults to /casos/[publicCode]. */
  detailHref?: string;
}

export interface CaseQueueFilters {
  kind?: CaseKind | null;
  status?: "open" | "closed" | null;
}

export interface CaseQueueBulkConfig {
  /** Actions passed to OpBulkBar. */
  actions: (selectedIds: Set<string>) => OpBulkAction[];
  /** Called when the selection is cleared. */
  onClear?: () => void;
}

export interface CaseQueueProps {
  rows: CaseQueueRow[];
  filters?: CaseQueueFilters;
  bulk?: CaseQueueBulkConfig;
  /**
   * Base URL for filter chip links.
   * Chips append ?kind=… and ?status=… to this base.
   * Defaults to the current path (empty string).
   */
  filterBase?: string;
  /** Optional caption for the table (defaults to "Cola de casos"). */
  caption?: string;
  /** When true, shows a "Truncated — hay más resultados" note. */
  truncated?: boolean;
  /**
   * The TRUE total behind a capped list (M4). When set and larger than the
   * rendered rows, the count reads "Mostrando los N más recientes de M" instead
   * of a bare "N casos" that hides how many exist. Omit on uncapped lists.
   */
  totalCount?: number;
  /** Empty-state message. */
  emptyMessage?: string;
  /**
   * When false, the built-in status filter chips (Todos / Abiertos / Cerrados)
   * are not rendered. Use this on surfaces that own a richer external filter
   * form (e.g. /admin/casos, which filters status alongside kind + province)
   * to avoid a duplicate status control. Defaults to true.
   */
  showStatusChips?: boolean;
  /**
   * Extra query params ALWAYS carried on every chip link, on top of kind/
   * status (F6, 2026-07-22). Needed when `filterBase` points at a TABBED HUB
   * route rather than a dedicated page — e.g. the Casos hub's "Disputas"
   * expediente (filterBase="/gob/casos") must keep `expediente=disputas` on
   * every chip click, or the chip would silently drop the viewer back onto
   * the hub's default "casos" tab. Omit on non-hub, single-purpose routes
   * (existing behavior, unchanged).
   */
  extraFilterParams?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Status chip links
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: Array<{ value: "open" | "closed" | null; label: string }> = [
  { value: null, label: "Todos" },
  { value: "open", label: "Abiertos" },
  { value: "closed", label: "Cerrados" },
];

function buildFilterHref(
  base: string,
  kind: CaseKind | null | undefined,
  status: "open" | "closed" | null | undefined,
  extraParams?: Record<string, string>,
): string {
  const params = new URLSearchParams();
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) params.set(key, value);
  }
  if (kind) params.set("kind", kind);
  if (status) params.set("status", status);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base || "/";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Unified case queue table with filter chips + optional bulk-action bar.
 * Consumes the CaseListItem shape from lib/case-queries.
 */
export function CaseQueue({
  rows,
  filters,
  bulk,
  filterBase = "",
  caption = "Cola de casos",
  truncated = false,
  totalCount,
  emptyMessage = "No hay casos en esta cola.",
  showStatusChips = true,
  extraFilterParams,
}: CaseQueueProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Default sort: urgency (age-days × kind-severity) — the old "recientes"
  // (openedAt desc, as returned by the query) stays reachable via the toggle
  // below (PO interview 2026-07-23, item 6: "no debe perderse el orden viejo").
  const [sortMode, setSortMode] = useState<"urgencia" | "recientes">("urgencia");

  const sortedRows = useMemo(() => {
    if (sortMode === "recientes") return rows;
    return [...rows].sort((a, b) => {
      const scoreDiff = caseUrgencyScore(b) - caseUrgencyScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      // Tie-break (equal score, incl. both 0/closed): older-opened first, so
      // the longest-unresolved row of a tied group still surfaces first.
      return a.openedAt.getTime() - b.openedAt.getTime();
    });
  }, [rows, sortMode]);

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }, [rows]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  const activeKind = filters?.kind ?? null;
  const activeStatus = filters?.status ?? null;

  const bulkActions = bulk ? bulk.actions(selected) : [];

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      {showStatusChips && (
        <nav aria-label="Filtros de estado" className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const isActive = activeStatus === opt.value;
            return (
              <Link
                key={opt.value ?? "all"}
                href={buildFilterHref(filterBase, activeKind, opt.value, extraFilterParams)}
                aria-pressed={isActive}
                className={[
                  "rounded-full border px-3 py-1 text-sm font-medium no-underline transition-colors",
                  isActive
                    ? "border-ln-op-azul bg-ln-op-azul text-white"
                    : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:bg-ln-op-stripe",
                ].join(" ")}
              >
                {opt.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Sort toggle (PO interview 2026-07-23, item 6): "Urgencia" (age-days ×
          kind-severity, see caseUrgencyScore) is the default so the queue
          leads with what most needs action, not just what's newest. The old
          "Recientes" (openedAt desc, as fetched) stays one click away. Uses
          the shared OpButton primitive rather than a raw button element —
          the design-system consolidation ratchet (scripts/check-raw-
          buttons.mjs) requires new toggles to go through LnButton/OpButton. */}
      {rows.length > 1 && (
        <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0 text-sm">
          <legend className="text-ln-op-mute">Ordenar por:</legend>
          {(
            [
              { value: "urgencia", label: "Urgencia" },
              { value: "recientes", label: "Recientes" },
            ] as const
          ).map((opt) => {
            const isActive = sortMode === opt.value;
            return (
              <OpButton
                key={opt.value}
                type="button"
                size="sm"
                variant={isActive ? "primary" : "ghost"}
                aria-pressed={isActive}
                onClick={() => setSortMode(opt.value)}
              >
                {opt.label}
              </OpButton>
            );
          })}
        </fieldset>
      )}

      {/* Row count — suppressed when empty: the empty-state box below already
          carries the message, so "Sin casos" + emptyMessage was a double. */}
      {rows.length > 0 && (
        <p aria-live="polite" className="text-sm text-ln-op-mute">
          {totalCount !== undefined && totalCount > rows.length
            ? `Mostrando los ${rows.length.toLocaleString("es-AR")} más recientes de ${totalCount.toLocaleString("es-AR")}`
            : `${rows.length} ${pluralizeEs(rows.length, "caso")}${truncated ? " (hay más — refiná los filtros)" : ""}`}
        </p>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-sm)] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
          {emptyMessage}
        </p>
      ) : (
        // Q2 (sticky headers): the header sticks to THIS wrapper, so the
        // wrapper must be the scrolling element — `position: sticky` fails
        // silently when the scroll happens on an ancestor the sticky can't
        // see (the old `overflow-x-auto` made this div a scroll container
        // that never scrolled vertically, which is exactly that trap). Same
        // structure as MapDataTable: max-height + overflow-auto on the
        // container, sticky + opaque bg + z on the thead.
        <div className="max-h-[70vh] overflow-auto rounded-[var(--radius-sm)] border border-ln-op-line">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 z-10 bg-ln-op-stripe">
              <tr>
                {bulk && (
                  <th scope="col" className="w-10 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      aria-label={allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-ln-op-line accent-ln-op-azul"
                    />
                  </th>
                )}
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-ln-mono text-xs font-bold uppercase tracking-[.1em] text-ln-op-mute"
                >
                  Código
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-ln-mono text-xs font-bold uppercase tracking-[.1em] text-ln-op-mute"
                >
                  Tipo
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-ln-mono text-xs font-bold uppercase tracking-[.1em] text-ln-op-mute"
                >
                  Estado
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-left font-ln-mono text-xs font-bold uppercase tracking-[.1em] text-ln-op-mute sm:table-cell"
                >
                  Mascota
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-left font-ln-mono text-xs font-bold uppercase tracking-[.1em] text-ln-op-mute md:table-cell"
                >
                  Jurisdicción
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-ln-mono text-xs font-bold uppercase tracking-[.1em] text-ln-op-mute"
                >
                  Apertura
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => {
                const href = row.detailHref ?? `/casos/${row.publicCode}`;
                const isSelected = selected.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={[
                      "border-t border-ln-op-line transition-colors",
                      isSelected
                        ? "bg-ln-op-blue-bg"
                        : idx % 2 === 0
                          ? "bg-ln-op-card hover:bg-ln-op-stripe"
                          : "bg-transparent hover:bg-ln-op-stripe",
                    ].join(" ")}
                  >
                    {bulk && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar caso ${row.publicCode}`}
                          checked={isSelected}
                          onChange={() => toggleRow(row.id)}
                          className="h-4 w-4 rounded border-ln-op-line accent-ln-op-azul"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <Link
                        href={href}
                        className="no-underline"
                        aria-label={`Ver caso ${row.publicCode}`}
                      >
                        <OpCodeBadge tone="blue">{row.publicCode}</OpCodeBadge>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-ln-op-ink-2">{caseKindLabel(row.caseKind)}</td>
                    <td className="px-3 py-2">
                      <CaseStatusBadge status={row.status} />
                    </td>
                    <td className="hidden px-3 py-2 text-ln-op-mute sm:table-cell">
                      {row.primaryPetName ??
                        (row.primarySubjectKind === "unowned_animal"
                          ? "Animal sin registrar"
                          : "—")}
                    </td>
                    <td className="hidden px-3 py-2 text-ln-op-mute md:table-cell">
                      {row.jurisdictionLocality && row.jurisdictionProvince
                        ? `${row.jurisdictionLocality}, ${row.jurisdictionProvince}`
                        : (row.jurisdictionProvince ?? "—")}
                    </td>
                    <td className="px-3 py-2 text-ln-op-mute">
                      <div className="flex flex-col gap-1">
                        <time dateTime={row.openedAt.toISOString()}>
                          {formatDate(row.openedAt)}
                        </time>
                        {/* SLA badge: only shown on non-closed cases past the warning
                            threshold (due-state "overdue" — the deadline is
                            caseSlaDueAt, same rule /gob/acciones ranks by). Label,
                            day count and tone come from the shared dueDateBadge so
                            this queue can never disagree with the worklist on what
                            "vencido" means. title stays the badge's legend (PO
                            interview 2026-07-23, item 6) — the label alone doesn't
                            say which deadline it counts against. */}
                        {row.closedAt === null &&
                          (() => {
                            const due = computeDueInfo(caseSlaDueAt(row.openedAt));
                            if (due.state !== "overdue") return null;
                            const badge = dueDateBadge(due);
                            return (
                              <span
                                title={`${badge.label} — plazo SLA de ${CASE_SLA_WARNING_DAYS} días desde la apertura del caso`}
                                aria-label={badge.label}
                              >
                                <OpPill tone={badge.tone}>{badge.label}</OpPill>
                              </span>
                            );
                          })()}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk bar — only rendered when bulk is configured and count > 0 */}
      {bulk && (
        <OpBulkBar
          count={selected.size}
          actions={bulkActions}
          onClear={() => {
            setSelected(new Set());
            bulk.onClear?.();
          }}
        />
      )}
    </div>
  );
}
