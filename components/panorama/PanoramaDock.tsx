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

import { Fragment, type ReactNode, useRef, useState } from "react";

import { OpButton } from "@/components/ui/dashboard/OpButton";

export type PanoramaDockTab = "registros" | "stats" | "referencias" | "timeline";

const TAB_LABELS: Record<PanoramaDockTab, string> = {
  stats: "Estadísticas",
  registros: "Registros",
  referencias: "Referencias",
  timeline: "Línea de tiempo",
};

// PO order: Estadísticas · Registros ‖ Referencias · Línea de tiempo — the DATA
// pair (what happened) then a subtle divider then the TOOLS pair (how to read
// the map / replay it over time). The divider renders between "registros" and
// "referencias" (see the tablist map below); it is decorative only, never a tab.
const TAB_ORDER: readonly PanoramaDockTab[] = ["stats", "registros", "referencias", "timeline"];

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
  /** The map's scale legends (MapLegends) — the "how to read the map" pane. */
  referencias: ReactNode;
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
  referencias,
  timeline,
}: Props) {
  const panes: Record<PanoramaDockTab, ReactNode> = { registros, stats, referencias, timeline };

  // Roving tabindex (WAI-ARIA APG tab pattern, MANUAL activation): only one tab
  // is Tab-stoppable — the active one, or the tab the operator has arrowed to.
  // Left/Right/Home/End move FOCUS between tabs without switching the pane;
  // Enter/Space (native button activation via onClick) commit the switch. This
  // mirrors PresetPanel's radiogroup and gives role="tablist" the arrow-key
  // navigation a screen-reader user expects (WCAG 2.1.1 / ARIA APG conformance).
  const selectedIndex = Math.max(0, TAB_ORDER.indexOf(tab));
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const rovingIndex = focusIndex ?? selectedIndex;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTabAt(index: number) {
    const clamped = (index + TAB_ORDER.length) % TAB_ORDER.length;
    setFocusIndex(clamped);
    tabRefs.current[clamped]?.focus();
  }

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusTabAt(index + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusTabAt(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTabAt(0);
        break;
      case "End":
        e.preventDefault();
        focusTabAt(TAB_ORDER.length - 1);
        break;
      default:
        // Enter/Space fall through to the native button click (onClick), which
        // commits the tab — manual activation (selection does NOT follow focus).
        break;
    }
  }

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
      {/* flex-nowrap + a scrollable tablist (mobile-polish 2026-07): the old
          flex-wrap + overflow-hidden combo silently clipped tabs into
          truncation at 390px ("Línea de…"). The tab row now scrolls
          horizontally inside the bar (op-scroll = the repo's thin visible
          scrollbar affordance, + scroll snap) while the meta/CSV/expand
          cluster stays pinned right. >=md everything fits and nothing scrolls. */}
      <div className="flex h-10 flex-shrink-0 flex-nowrap items-center gap-x-2 overflow-hidden border-b border-ln-op-line-2 pl-3 pr-2">
        <span aria-hidden="true" className="flex-none text-ln-op-faint">
          ≡
        </span>
        <div
          role="tablist"
          aria-label="Paneles de datos"
          className="op-scroll flex h-full min-w-0 flex-1 snap-x items-stretch overflow-x-auto"
          onBlur={(e) => {
            // Focus left the whole tablist → drop the roving position so a later
            // Tab-in lands on the SELECTED tab again (APG).
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIndex(null);
          }}
        >
          {TAB_ORDER.map((key, index) => {
            const isActive = key === tab;
            return (
              <Fragment key={key}>
                {/* DATA | TOOLS boundary: a subtle separator between the data
                    panes (Estadísticas, Registros) and the tool panes
                    (Referencias, Línea de tiempo) — decorative only, not a
                    tab, so it never enters the roving-tabindex/arrow-key nav. */}
                {key === "referencias" && (
                  <span
                    aria-hidden="true"
                    className="my-2 w-px flex-none self-stretch bg-ln-op-line-2"
                  />
                )}
                <button
                  id={`pano-dock-tab-${key}`}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  // The tabpanel is ALWAYS in the DOM now (hidden when collapsed),
                  // so aria-controls is a valid IDREF in both states — completing
                  // the WAI-ARIA tablist/tab/tabpanel contract the APG expects
                  // (prev: panel rendered only while expanded, so the relationship
                  // had to be dropped when collapsed — a11y review round 2).
                  aria-controls="pano-dock-panel"
                  // Roving tabindex: only the active/arrowed tab is Tab-stoppable.
                  tabIndex={index === rovingIndex ? 0 : -1}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                  onClick={() => {
                    onTabChange(key);
                    // Sync the roving position to the clicked tab so a later
                    // Tab-in / arrow-nav starts from where the mouse last acted
                    // (prev: click left focusIndex stale, so mixed mouse+keyboard
                    // could leave tabIndex={0} on the wrong tab — a11y review).
                    setFocusIndex(index);
                    // Spec: clicking any tab while collapsed also expands.
                    if (!open) onOpenChange(true);
                  }}
                  className={`inline-flex flex-none snap-start items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${
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
              </Fragment>
            );
          })}
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
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
      {/* The tabpanel is ALWAYS rendered (hidden while collapsed) so the
          tablist/tab/tabpanel APG contract is complete in both states and
          aria-controls always resolves. `hidden` removes it from the a11y tree
          and the layout when collapsed, so the slim bar keeps its height. */}
      <div
        id="pano-dock-panel"
        role="tabpanel"
        aria-labelledby={`pano-dock-tab-${tab}`}
        hidden={!open}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-3"
      >
        {open ? panes[tab] : null}
      </div>
    </section>
  );
}
