"use client";

// PanoramaDataTable — panorama-ia-v2 §3.3, the accessible ("Ley 26.653") view,
// and — since the ranking one-list consolidation (PO: "consistente a morir") —
// the DEFAULT (and only) rendering of the "Ranking de unidades" dock section.
//
// A real, sortable <table role="table"> with NO WebGL: the screen-reader path to
// the SAME data the map plots, with header cells that NAME every column
// (Jurisdicción / <métrica> / Brecha vs meta). The map's aria-label is only a
// point count; this table is where assistive tech (and keyboard users) actually
// read the values.
//
// It carries the map linkage the retired headerless list used to own: rows are
// hover-synced with the map (onHover bubbles the unit key up; the console mirrors
// it to the map's feature-state) and aria-current marks the map→row highlight.
//
// Same projection as the map (RankedUnit rows). Suppressed cells never reach here
// — the ranking upstream drops them (privacy invariant §5.1); the console renders
// the k-anon suppressed-count line beneath this table.

import { useEffect, useId, useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { RankedRowPreview } from "@/components/panorama/RankedRowPreview";
import { LnEmptyState } from "@/components/ui/EmptyState";
import type { RankedUnit, RankingKind } from "@/src/modules/panorama/domain/ranking";

type SortKey = "label" | "value" | "gap";
type SortDir = "asc" | "desc";

type Props = {
  rows: RankedUnit[];
  kind: RankingKind;
  /** es-AR label of the ranked measure, used in the heading + the value column header. */
  measureLabel: string;
  onSelect?: (key: string) => void;
  /**
   * trust/safety invariant (2026-07-10): the base layer produced NO data, so an
   * empty table must not read as "sin jurisdicciones bajo meta". Mirrors
   * RankedUnitsPanel.dataUnavailable so both views of the same projection stay
   * honest in lockstep.
   */
  dataUnavailable?: boolean;
  /**
   * C4 (epistemic states) — how many in-scope units the ranking could actually
   * MEASURE, regardless of how many made the worst-N cut.
   *
   * Zero ranked rows means two OPPOSITE things and this table cannot tell them
   * apart on its own: either every measured jurisdiction is at or above target
   * (real good news), or nothing could be measured at all (we are blind). The
   * old copy collapsed both into "Sin jurisdicciones bajo meta en este alcance"
   * — an all-clear printed while the system had no idea. That is the exact
   * "ciego, no tranquilo" failure C4 exists to kill.
   */
  measuredUnits?: number;
  /**
   * How many in-scope units WERE measured but had to be withheld by k-anonymity.
   *
   * Without this the table collapsed "nobody reported" and "everybody reported
   * but privacy forbids showing it" into one blind state — and then said
   * "Ninguna unidad del alcance reportó datos suficientes", which is FALSE in
   * the second case. Found live on Mortalidad (2026-07-25): the dock showed 154
   * records beside an empty ranking claiming nothing had been reported, because
   * every per-unit value (range 2–6) sat under k=5.
   */
  suppressedUnits?: number;
  /** The unit key currently highlighted on the map (hover sync), or null. */
  highlightedKey?: string | null;
  /** Fired on row hover/focus (key) and blur/leave (null) — mirrors to the map. */
  onHover?: (key: string | null) => void;
  /**
   * Small-scope fallback (Cowork QA ronda 3 §4, P2.5): true when the scope holds
   * fewer than a full Worst-N of units, so `rows` is EVERY in-scope unit ordered
   * by the metric (not a "worst 10"). Reframes the heading from "Peores N" to
   * "Tus N {unitNoun}".
   */
  scopeFallback?: boolean;
  /** es-AR plural unit noun for the fallback heading (comunas/localidades/…). */
  unitNoun?: string;
  /**
   * A2 (map plan): rich hover/focus PREVIEW for a row — the unit's key numbers
   * plus the "entrar" hint, so reading the detail costs zero clicks. Omit and
   * the table renders exactly as before.
   *
   * Rendered as a `position: fixed` card anchored to the row rect, OUTSIDE the
   * table markup: a HoverTip-style inline wrapper would be invalid inside a
   * <tr>, would nest a focusable span inside the row's own button
   * (nested-interactive), and would be clipped by the dock's overflow.
   */
  preview?: {
    /** es-AR label of the ranked measure, for the preview body. */
    measureLabel: string;
    /** Whether clicking THIS row drills into the unit (vs opening its detail). */
    drills: (key: string) => boolean;
  };
};

/** Where the preview card sits, in viewport coords, plus the row it describes. */
type PreviewAnchor = { row: RankedUnit; top: number; left: number; source: "hover" | "focus" };

const PREVIEW_W = 256; // matches w-64
const PREVIEW_GAP = 8;

/**
 * Place the card next to the row's LABEL CELL — not the row.
 *
 * a11y review 2026-07-25: anchoring to the <tr> (which spans the full table
 * width) made `rect.right + gap + width > innerWidth` true on every row, so the
 * flip-left branch fired 100% of the time and parked the card against the
 * viewport edge, on top of the left navigation rail, ~270px from the row it
 * describes. Anchoring to the label cell keeps it beside its own row.
 */
function anchorFor(rect: DOMRect, row: RankedUnit, source: "hover" | "focus"): PreviewAnchor {
  const spillsRight = rect.right + PREVIEW_GAP + PREVIEW_W > window.innerWidth;
  const left = spillsRight
    ? Math.max(PREVIEW_GAP, rect.left - PREVIEW_GAP - PREVIEW_W)
    : rect.right + PREVIEW_GAP;
  // Assume a ~132px card; clamping against a generous estimate is enough to keep
  // it on screen without measuring the card before it exists.
  const top = Math.min(Math.max(PREVIEW_GAP, rect.top), window.innerHeight - 140);
  return { row, top, left, source };
}

const ariaSort = (active: boolean, dir: SortDir): "ascending" | "descending" | "none" =>
  active ? (dir === "asc" ? "ascending" : "descending") : "none";

/** Capitalize the first letter so a lower-case measure reads as a column header. */
const asHeader = (label: string): string =>
  label.length === 0 ? label : label.charAt(0).toUpperCase() + label.slice(1);

/**
 * C4 — which epistemic state an EMPTY ranking is in, and the es-AR copy for it.
 *
 * Zero rows means four different things and they must not be collapsed:
 *
 *   failed        the calculation broke — not a result at all
 *   measured-zero units were measured and none is below target (real good news)
 *   protected     units DID report, but every value sits under k-anon
 *   no-signal     nothing reported — the system is blind
 *
 * Pure, and extracted from the JSX because expressing four branches inline
 * produced nested ternaries the complexity lint rightly rejected.
 */
export function rankingEmptyState(input: {
  kind: RankingKind;
  dataUnavailable: boolean;
  measuredUnits?: number;
  suppressedUnits: number;
  unitNoun: string;
}): { nature: "measured-zero" | "no-signal" | "protected"; title: string; description: string } {
  const { kind, dataUnavailable, suppressedUnits, unitNoun } = input;
  const measured = input.measuredUnits ?? 0;

  if (dataUnavailable) {
    return {
      nature: "no-signal",
      title: "No pudimos calcular el ranking",
      description:
        "El cálculo falló en este momento. No es un resultado: no sabemos cómo está el alcance.",
    };
  }
  // An all-clear is claimable only when something was measured AND the metric
  // has a target to be clear of.
  if (kind === "rate" && measured > 0) {
    return {
      nature: "measured-zero",
      title: "Ninguna jurisdicción quedó bajo meta",
      description: `Se midieron ${measured.toLocaleString("es-AR")} ${unitNoun} y ninguna quedó por debajo de la meta.`,
    };
  }
  if (suppressedUnits > 0) {
    return {
      nature: "protected",
      title: "Protegido por k-anonimato",
      description: `${suppressedUnits.toLocaleString("es-AR")} ${unitNoun} SÍ reportaron, pero sus valores son tan bajos que mostrarlos identificaría casos. Hay señal; no se puede publicar al detalle.`,
    };
  }
  return {
    nature: "no-signal",
    title: "Sin señales en este alcance",
    description:
      "Ninguna unidad del alcance reportó datos suficientes para medir. Sin señales no es lo mismo que sin problema.",
  };
}

export function PanoramaDataTable({
  rows,
  kind,
  measureLabel,
  onSelect,
  dataUnavailable = false,
  measuredUnits,
  suppressedUnits = 0,
  highlightedKey = null,
  onHover,
  scopeFallback = false,
  unitNoun = "jurisdicciones",
  preview,
}: Props) {
  const emptyState = rankingEmptyState({
    kind,
    dataUnavailable,
    measuredUnits,
    suppressedUnits,
    unitNoun,
  });
  const [previewAnchor, setPreviewAnchor] = useState<PreviewAnchor | null>(null);
  const previewId = useId();

  // WCAG 2.1 SC 1.4.13 (Dismissible): additional content shown on hover/focus
  // must be dismissible without moving the pointer or focus. Escape is also the
  // ONLY exit on touch, where hover never fires and a tap that keeps focus never
  // blurs — the card otherwise sat over the table indefinitely.
  useEffect(() => {
    if (!previewAnchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewAnchor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewAnchor]);

  /**
   * Hover/focus enter: mirror to the map AND anchor the preview.
   *
   * FOCUS WINS. Both a pointer resting anywhere over the table and the keyboard
   * used to write the same single anchor, last-writer-wins: a screen-reader user
   * tabbing the list got a card describing whatever row the mouse happened to
   * sit on, and the focused button's aria-describedby was handed to an unfocused
   * one (a11y + correctness reviews, 2026-07-25).
   */
  const enterRow = (row: RankedUnit, cellEl: HTMLElement | null, source: "hover" | "focus") => {
    if (source === "hover" && previewAnchor?.source === "focus") return;
    onHover?.(row.key);
    if (preview && cellEl) setPreviewAnchor(anchorFor(cellEl.getBoundingClientRect(), row, source));
  };
  /** Only the anchor's OWN source may retract it — a mouseleave on row 4 must
   *  not erase the description of row 1, which still holds focus. */
  const leaveRow = (row: RankedUnit, source: "hover" | "focus") => {
    if (previewAnchor && (previewAnchor.row.key !== row.key || previewAnchor.source !== source))
      return;
    onHover?.(null);
    setPreviewAnchor(null);
  };
  // Default: worst first — rate by gap desc, density by value desc.
  const [sortKey, setSortKey] = useState<SortKey>(kind === "rate" ? "gap" : "value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const headingId = useId();

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "label") cmp = a.label.localeCompare(b.label, "es");
      else if (sortKey === "gap") cmp = (a.gap ?? 0) - (b.gap ?? 0);
      else cmp = a.value - b.value;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const header = (key: SortKey, label: string) => {
    const active = sortKey === key;
    return (
      <th scope="col" aria-sort={ariaSort(active, sortDir)} className="px-2 py-1 text-left">
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex items-center gap-1 font-bold text-ln-op-ink-2 hover:text-ln-op-ink"
        >
          {label}
          <span aria-hidden="true" className="text-ln-op-mute">
            {active && (
              <Icon name={sortDir === "asc" ? "chevron-up" : "chevron-down"} size="sm" decorative />
            )}
          </span>
        </button>
      </th>
    );
  };

  // P2.5: name the ranking framing + metric in the heading so "peores en qué" is
  // answerable at a glance (Cowork H8). Small scope → "Tus N {unitNoun} · métrica";
  // else "Peores N · métrica". Mirrors the retired RankedUnitsPanel heading.
  const heading = scopeFallback
    ? `Tus ${rows.length} ${unitNoun} · ${measureLabel}`
    : `Peores ${rows.length > 0 ? rows.length : 10} · ${measureLabel}`;

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        {heading}
      </h3>
      {rows.length === 0 ? (
        <LnEmptyState
          variant="dashed"
          // `nature` stays spelled out at the call site rather than riding in
          // the spread: lint:states reads it literally, and a fence that cannot
          // see the classification is a fence that cannot enforce it.
          nature={emptyState.nature}
          title={emptyState.title}
          description={emptyState.description}
          className="text-xs"
        />
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Datos de {measureLabel} por jurisdicción (vista accesible, ordenable).
          </caption>
          <thead>
            <tr className="border-b border-ln-op-line text-xs uppercase tracking-[0.08em]">
              {header("label", "Jurisdicción")}
              {header("value", asHeader(measureLabel))}
              {kind === "rate" && header("gap", "Brecha vs meta")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const highlighted = row.key === highlightedKey;
              return (
                <tr
                  key={row.key}
                  aria-current={highlighted ? "true" : undefined}
                  onMouseEnter={(e) => enterRow(row, e.currentTarget.querySelector("th"), "hover")}
                  onMouseLeave={() => leaveRow(row, "hover")}
                  className={`border-b border-ln-op-line/50 transition-colors ${
                    highlighted ? "bg-ln-op-line/50" : ""
                  }`}
                >
                  <th scope="row" className="px-2 py-1 text-left font-normal text-ln-op-ink">
                    {onSelect ? (
                      <button
                        type="button"
                        onClick={() => onSelect(row.key)}
                        // Keyboard parity: focus reveals the same preview hover
                        // does, and points at it for screen readers.
                        onFocus={(e) => enterRow(row, e.currentTarget.closest("th"), "focus")}
                        onBlur={() => leaveRow(row, "focus")}
                        aria-describedby={
                          previewAnchor?.row.key === row.key ? previewId : undefined
                        }
                        className="text-left underline-offset-2 hover:underline"
                      >
                        {row.label}
                      </button>
                    ) : (
                      row.label
                    )}
                  </th>
                  <td className="px-2 py-1 tabular-nums text-ln-op-ink-2">
                    {/* es-AR thousands separator, matching the hover preview —
                        the same row read "1.234" on hover and "1234" here. */}
                    {kind === "rate"
                      ? `${Math.round(row.value)}%`
                      : row.value.toLocaleString("es-AR")}
                  </td>
                  {kind === "rate" && (
                    <td className="px-2 py-1 tabular-nums text-ln-op-warn">
                      {/* One decimal + the unit: Math.round printed a real
                          sub-half-point gap as "−0", reporting a below-target
                          unit as having none. */}
                      {row.gap !== null ? `−${row.gap.toFixed(1)} pts` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {/* A2 preview card — fixed-position so the dock's overflow can't clip it,
          pointer-events:none so it never steals the hover that spawned it. No
          enter/leave animation, so it is reduced-motion-safe by construction
          (the fade is B3's job, behind the motion query). */}
      {previewAnchor && preview && (
        <div
          role="tooltip"
          id={previewId}
          style={{ top: previewAnchor.top, left: previewAnchor.left, width: PREVIEW_W }}
          className="ln-hovertip-in pointer-events-none fixed z-50 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-card p-3 text-xs shadow-lg"
        >
          <RankedRowPreview
            row={previewAnchor.row}
            measureLabel={preview.measureLabel}
            kind={kind}
            drills={preview.drills(previewAnchor.row.key)}
          />
        </div>
      )}
    </section>
  );
}
