"use client";

// PanoramaDock — the v2C floating data dock (docs/design/handoffs/
// 2026-07-11-panorama-v2C, "Dock inferior flotante").
//
// A collapsible panel FLOATING over the map's bottom edge (absolute overlay —
// the MapLibre canvas NEVER resizes when it expands; spec no-negociable #4).
// Collapsed (the default — PO: "MÁS MAPA, la lista es opcional"): a slim bar
// with the tab row (Registros carries a live record count), the board meta
// ("Córdoba · últimos 90 días · 2 capas"), an optional CSV action and the
// expand toggle. Expanded: 42% of the map container's height, growing UP over
// the map, body scrolls internally. Clicking any tab while collapsed expands.
//
// Presentational shell only — the console owns the state (open/tab) and the
// pane contents arrive as slots (Registros = the MapDataTable projection,
// Estadísticas = the RankedUnitsPanel/PanoramaDataTable ranking, Línea de
// tiempo = the real TimeScrubber with its temporal gating).
//
// English identifiers, es-AR user copy (project invariant #4).

import type { ReactNode } from "react";

import { OpButton } from "@/components/ui/dashboard/OpButton";

export type PanoramaDockTab = "registros" | "stats" | "timeline";

const TAB_LABELS: Record<PanoramaDockTab, string> = {
  registros: "Registros",
  stats: "Estadísticas",
  timeline: "Línea de tiempo",
};

const TAB_ORDER: readonly PanoramaDockTab[] = ["registros", "stats", "timeline"];

type Props = {
  /** Expanded (true) or the collapsed slim bar (false — the default state). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The active pane. */
  tab: PanoramaDockTab;
  onTabChange: (tab: PanoramaDockTab) => void;
  /** Live record count shown in the Registros tab badge. */
  recordCount: number;
  /** Board meta line: scope · period · layer count. */
  meta: string;
  /** Optional CSV action rendered in the bar (e.g. a download link). */
  csvAction?: ReactNode;
  /** Pane contents (rendered only while expanded; the active one shows). */
  registros: ReactNode;
  stats: ReactNode;
  timeline: ReactNode;
};

export function PanoramaDock({
  open,
  onOpenChange,
  tab,
  onTabChange,
  recordCount,
  meta,
  csvAction,
  registros,
  stats,
  timeline,
}: Props) {
  const panes: Record<PanoramaDockTab, ReactNode> = { registros, stats, timeline };
  return (
    <section
      aria-label="Datos de la vista"
      data-testid="panorama-dock"
      className="absolute inset-x-3.5 bottom-3.5 z-20 flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card shadow-lg"
      // 42% of the MAP CONTAINER (the positioned ancestor) when expanded; the
      // collapsed bar sizes itself. Height lives here (not a class) because the
      // token ratchet bans new arbitrary values.
      style={open ? { height: "42%" } : undefined}
    >
      <div className="flex h-10 flex-shrink-0 flex-wrap items-center gap-x-2 overflow-hidden border-b border-ln-op-line-2 pl-3 pr-2">
        <span aria-hidden="true" className="text-ln-op-faint">
          ≡
        </span>
        <div role="tablist" aria-label="Paneles de datos" className="flex h-full items-stretch">
          {TAB_ORDER.map((key) => {
            const isActive = key === tab;
            return (
              <button
                key={key}
                id={`pano-dock-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="pano-dock-panel"
                onClick={() => {
                  onTabChange(key);
                  // Spec: clicking any tab while collapsed also expands.
                  if (!open) onOpenChange(true);
                }}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 text-sm transition-colors ${
                  isActive
                    ? "border-ln-op-azul font-semibold text-ln-op-azul"
                    : "border-transparent text-ln-op-ink-2 hover:text-ln-op-ink"
                }`}
              >
                {TAB_LABELS[key]}
                {key === "registros" && (
                  <span className="rounded-full bg-ln-op-azul/10 px-1.5 text-[var(--text-xs)] font-medium tabular-nums text-ln-op-azul">
                    {recordCount.toLocaleString("es-AR")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[var(--text-xs)] tabular-nums text-ln-op-mute md:inline">
            {meta}
          </span>
          {csvAction}
          <OpButton
            size="sm"
            variant="ghost"
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
          >
            {open ? "▾ Colapsar" : "▴ Expandir"}
          </OpButton>
        </div>
      </div>
      {open && (
        <div
          id="pano-dock-panel"
          role="tabpanel"
          aria-labelledby={`pano-dock-tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-3"
        >
          {panes[tab]}
        </div>
      )}
    </section>
  );
}
