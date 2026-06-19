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
import { useCallback, useState } from "react";

import { CaseStatusBadge } from "@/components/ui/dashboard/CaseStatusBadge";
import { type OpBulkAction, OpBulkBar } from "@/components/ui/dashboard/OpBulkBar";
import { OpCodeBadge } from "@/components/ui/dashboard/OpCodeBadge";
import type { CaseStatus } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { type CaseKind, caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaseQueueRow {
  id: string;
  publicCode: string;
  caseKind: CaseKind;
  status: CaseStatus;
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
  /** Empty-state message. */
  emptyMessage?: string;
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
): string {
  const params = new URLSearchParams();
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
  emptyMessage = "No hay casos en esta cola.",
}: CaseQueueProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      <nav aria-label="Filtros de estado" className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = activeStatus === opt.value;
          return (
            <Link
              key={opt.value ?? "all"}
              href={buildFilterHref(filterBase, activeKind, opt.value)}
              aria-pressed={isActive}
              className={[
                "rounded-full border px-3 py-1 text-[12px] font-medium no-underline transition-colors",
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

      {/* Row count */}
      <p aria-live="polite" className="text-[12px] text-ln-op-mute">
        {rows.length === 0
          ? "Sin casos"
          : `${rows.length} caso${rows.length !== 1 ? "s" : ""}${truncated ? " (hay más — refiná los filtros)" : ""}`}
      </p>

      {/* Table */}
      {rows.length === 0 ? (
        <p className="rounded-[4px] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[4px] border border-ln-op-line">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-ln-op-stripe">
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
                  className="px-3 py-2 text-left font-ln-mono text-[10px] font-bold uppercase tracking-[.1em] text-ln-op-mute"
                >
                  Código
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-ln-mono text-[10px] font-bold uppercase tracking-[.1em] text-ln-op-mute"
                >
                  Tipo
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-ln-mono text-[10px] font-bold uppercase tracking-[.1em] text-ln-op-mute"
                >
                  Estado
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-left font-ln-mono text-[10px] font-bold uppercase tracking-[.1em] text-ln-op-mute sm:table-cell"
                >
                  Mascota
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-left font-ln-mono text-[10px] font-bold uppercase tracking-[.1em] text-ln-op-mute md:table-cell"
                >
                  Jurisdicción
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-ln-mono text-[10px] font-bold uppercase tracking-[.1em] text-ln-op-mute"
                >
                  Apertura
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
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
                      {row.primaryPetName ?? "—"}
                    </td>
                    <td className="hidden px-3 py-2 text-ln-op-mute md:table-cell">
                      {row.jurisdictionLocality && row.jurisdictionProvince
                        ? `${row.jurisdictionLocality}, ${row.jurisdictionProvince}`
                        : (row.jurisdictionProvince ?? "—")}
                    </td>
                    <td className="px-3 py-2 text-ln-op-mute">
                      <time dateTime={row.openedAt.toISOString()}>{formatDate(row.openedAt)}</time>
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
