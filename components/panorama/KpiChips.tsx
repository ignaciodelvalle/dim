"use client";

// KpiChips — the v3 KPI CARDS over the map (task #38 item 4). Each metric is a
// slightly larger card carrying: the value + short label (de-dup, item 5), the
// period-over-period delta (from the KPI payload), and a mini-sparkline for the
// window-sensitive metrics that ship one (cobertura / mordeduras / zoonosis —
// same trend plumbing as /gob home). Hover reveals a one-line method note; the
// full methodology lives in the right rail's "Acerca" panel (#49 item 10).
//
// Click still RE-BASES the choropleth (unchanged): a card whose KPI id names a
// BASE-role map layer routes onRebase(layerId) → PanoramaConsole.onToggle → the
// radio-exclusive base swap. KPIs with no base layer render as read-only cards.
//
// The cluster stays COMPACT — bigger cards, but the map still dominates (the PO's
// "MÁS MAPA" ruling). Honesty states (degraded / pending / empty) unchanged.
//
// #49 item 10 (progressive disclosure): the methodology affordance is NOT a text
// link under the cards anymore — it is consolidated into the right rail's
// "Acerca" (i) icon, so the KPI cluster carries only the numbers.
//
// Round-2 review #4 (H8 + a11y, PO-chosen Option C + B's elevation): the
// base-selecting cards are a radio-exclusive picker (exactly one active at a
// time) but used to expose `aria-pressed` (independent-toggle semantics) with
// only a thin border as the selected cue — and read-only reference cards
// looked near-identical to clickable ones (H8). Fixed:
//   - a leading radio dot (empty ring idle / filled when active) marks a card
//     as "one-of-a-set, tap to choose"; placed leading the LABEL line so it
//     never collides with the tone glyph that already rides with the value.
//   - the active card additionally gets a left accent bar + ring + stronger
//     shadow (Option B's elevation), so "selected" is unmistakable beyond the
//     dot alone.
//   - read-only cards carry NO dot at all — the absence IS the "not tappable"
//     signal, resolving the pre-existing ambiguity.
//   - promoted from `aria-pressed` to a true `role="radiogroup"` / role="radio"
//     + aria-checked, with roving-tabindex arrow-key navigation — the exact
//     pattern PresetPanel.tsx already uses for the (also radio-exclusive)
//     preset strip. Read-only cards are plain divs: no role="radio", no
//     aria-checked, no tab stop, excluded from the roving index — they are NOT
//     part of the radiogroup.

import { useRef, useState } from "react";

import { selectMetricKpis } from "@/components/panorama/PanoramaMetricsColumn";
import { Sparkline } from "@/components/panorama/Sparkline";
import { shortKpiLabel } from "@/components/panorama/panorama-labels";
import type {
  KpiDelta,
  PanoramaKpi,
  PanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { roleOf } from "@/src/modules/panorama/domain/compatibility";
import { PANORAMA_LAYERS } from "@/src/modules/panorama/domain/layers";
import type { PresetId } from "@/src/modules/panorama/domain/presets";
import type { AggregationLevel, LayerId, PanoramaKpiId } from "@/src/modules/panorama/domain/types";

/**
 * Round-3 QA fix 5: the coverage tooltip shown when a `dataType:"rate"` chip
 * is tapped below province grain — the fence-empty overlay's copy
 * (`SituationalMap.tsx` "La cobertura se calcula solo a nivel provincia…"),
 * reworded for the disabled-chip context rather than a post-tap dead end.
 */
const PROVINCE_ONLY_TOOLTIP = "La cobertura se calcula solo a nivel provincial.";

const DELTA_GLYPH: Record<KpiDelta["direction"], string> = {
  up: "▲",
  down: "▼",
  flat: "＝",
};

/** Cap so the overlay never buries the map (presets curate 2-3). */
const MAX_CHIPS = 4;

type Props = {
  kpis: PanoramaKpis;
  /** The active preset's curated metric ids (display order); null = manual. */
  metricIds: readonly PanoramaKpiId[] | null;
  /** Active vista — drives the de-dup short labels. */
  presetId: PresetId | null;
  /** The layer currently painting the choropleth (caption/base layer). */
  activeBaseLayerId: LayerId | null;
  /**
   * Current aggregation level (Round-3 QA fix 5). The 4 `dataType:"rate"`
   * layers (esterilización, microchip, ppp, cobertura) are computed only at
   * province grain (repository "V1 LIMITATION") — below province, tapping
   * them used to rebase the map onto an empty overlay. Threaded from
   * PanoramaConsole so this component can disable them instead. Optional,
   * defaulting to "province" (nothing disabled) so existing callers/tests
   * that don't drill below province are unaffected.
   */
  level?: AggregationLevel;
  /** Re-base the map on this layer (routes to the console's onToggle). */
  onRebase: (layerId: LayerId) => void;
  pending?: boolean;
  degraded?: boolean;
  /**
   * Cowork QA ronda 3 §5 (C2, P2.4): true while a temporal frame is active
   * (the scrubber is off the live edge, `asOf` set). STOCK KPIs (`currentState`)
   * are "estado actual" by the HYBRID design — their big number does NOT move
   * with the scrubber, while the map + label + temporal/signal KPIs do. When a
   * temporal frame is active this EMPHASIZES the "estado actual" tag on those
   * stock cards so the not-tracking reads as intentional, never as a stuck bug.
   * Temporal KPIs carry no `currentState` flag, so they are never tagged here —
   * honoring the hybrid (only stock KPIs get the "no varía" signal).
   */
  temporalFrameActive?: boolean;
};

/** The BASE-role map layer a KPI id can paint, or null (signal/no layer). */
function baseLayerFor(kpiId: PanoramaKpiId): LayerId | null {
  const layer = PANORAMA_LAYERS.find((l) => l.id === kpiId);
  return layer !== undefined && roleOf(layer) === "base" ? layer.id : null;
}

/**
 * Round-3 QA fix 5 — the precise disable predicate: a `dataType:"rate"` base
 * layer (the 4 province-only coverage metrics) tapped below province grain.
 * Density/signal/reference layers have no such gate — they render at every
 * level — so this is false for every other base layer.
 */
function isProvinceOnlyRate(baseId: LayerId): boolean {
  return PANORAMA_LAYERS.find((l) => l.id === baseId)?.dataType === "rate";
}

/** The first sentence of the KPI definition — the hover method note. */
function methodNote(kpi: PanoramaKpi): string {
  const def = kpi.info.definition ?? "";
  const stop = def.indexOf(". ");
  return stop > 0 ? def.slice(0, stop + 1) : def;
}

export function KpiChips({
  kpis,
  metricIds,
  presetId,
  activeBaseLayerId,
  level = "province",
  onRebase,
  pending = false,
  degraded = false,
  temporalFrameActive = false,
}: Props) {
  // Roving tabindex (WAI-ARIA radiogroup pattern, mirrors PresetPanel.tsx).
  // Hooks must run unconditionally, ahead of the degraded/pending/empty early
  // returns below.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (degraded) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-warn">
        No pudimos cargar los indicadores en este momento.
      </p>
    );
  }
  if (pending) {
    return (
      <p
        aria-busy="true"
        className="animate-pulse rounded-[var(--radius-md)] border border-dashed border-ln-op-line bg-ln-op-card px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-mute"
      >
        Cargando indicadores…
      </p>
    );
  }

  const shown = selectMetricKpis(kpis, metricIds).slice(0, MAX_CHIPS);
  if (shown.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line bg-ln-op-card px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-mute">
        Métricas no disponibles para esta vista.
      </p>
    );
  }

  // The selectable (base-layer) subset, in display order — the actual radio
  // set. Read-only KPIs (no base layer) are excluded: no role="radio", no
  // roving tab stop, no arrow-key membership — they are not part of the group.
  // Round-3 QA fix 5: a province-only rate chip tapped below province grain is
  // ALSO excluded here — disabled, not part of the radiogroup, same as a
  // read-only reference card (see the render loop below).
  const selectableKpis = shown
    .map((kpi) => ({ kpi, baseId: baseLayerFor(kpi.id) }))
    .filter((x): x is { kpi: PanoramaKpi; baseId: LayerId } => x.baseId !== null)
    .filter((x) => !(isProvinceOnlyRate(x.baseId) && level !== "province"));
  const activePos = selectableKpis.findIndex((x) => x.baseId === activeBaseLayerId);
  const selectedPos = activePos >= 0 ? activePos : 0;
  const rovingPos = focusIndex ?? selectedPos;

  function focusAt(pos: number) {
    if (selectableKpis.length === 0) return;
    const clamped = (pos + selectableKpis.length) % selectableKpis.length;
    setFocusIndex(clamped);
    btnRefs.current[clamped]?.focus();
  }

  function commitAt(pos: number) {
    const target = selectableKpis[pos];
    if (target && target.baseId !== activeBaseLayerId) onRebase(target.baseId);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, pos: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusAt(pos + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusAt(pos - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(selectableKpis.length - 1);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        commitAt(pos);
        break;
      default:
        break;
    }
  }

  let selPos = -1;

  return (
    <div
      role="radiogroup"
      aria-labelledby="pano-kpi-radiogroup-label"
      className="flex flex-col gap-1.5"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIndex(null);
      }}
    >
      <span id="pano-kpi-radiogroup-label" className="sr-only">
        Indicadores de esta vista
      </span>
      {shown.map((kpi) => {
        const baseId = baseLayerFor(kpi.id);
        const hasBaseLayer = baseId !== null;
        // Round-3 QA fix 5: a rate-type base layer (esterilización, microchip,
        // ppp, cobertura) tapped below province grain used to rebase the map
        // onto an empty overlay (SituationalMap.tsx fence-empty copy). Disable
        // the chip instead — same treatment as a read-only reference card
        // (no role="radio", no roving tab stop, muted, tooltip) — so the
        // operator sees WHY it can't be tapped instead of a dead end.
        const provinceOnlyDisabled =
          hasBaseLayer && isProvinceOnlyRate(baseId) && level !== "province";
        const isSelectable = hasBaseLayer && !provinceOnlyDisabled;
        const active = isSelectable && baseId === activeBaseLayerId;
        const pos = isSelectable ? ++selPos : -1;
        // #49 item 1: floating chrome must read over ANY basemap. Opaque fill +
        // shadow scrim on every card (prev bg-ln-op-card/95 and the active
        // bg-ln-op-azul/10 were translucent — they washed out over busy barrio /
        // bivariate maps). The active card additionally gets a left accent bar +
        // ring + stronger shadow (Round-2 review #4, Option C+B) so "selected"
        // reads without relying on the radio dot alone.
        const cardClass = `flex w-full flex-col gap-0.5 rounded-[var(--radius-md)] border px-3 py-2 text-left shadow-md ${
          active
            ? "border-ln-op-azul border-l-4 bg-ln-op-card shadow-lg ring-2 ring-ln-op-azul/40"
            : "border-ln-op-line bg-ln-op-card"
        }`;
        const title = `${kpi.label} — ${methodNote(kpi)}`;
        if (provinceOnlyDisabled) {
          return (
            <div
              key={kpi.id}
              aria-disabled="true"
              className={`${cardClass} cursor-not-allowed opacity-70`}
              title={`${title} · ${PROVINCE_ONLY_TOOLTIP}`}
            >
              <CardBody
                kpi={kpi}
                presetId={presetId}
                active={false}
                isSelectable={false}
                temporalFrameActive={temporalFrameActive}
              />
            </div>
          );
        }
        return isSelectable ? (
          <button
            key={kpi.id}
            ref={(el) => {
              btnRefs.current[pos] = el;
            }}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: a native <input type="radio"> can't carry this card's rich Tailwind visual (value + delta + sparkline + accent bar) without a hidden-input + styled-label rework — same accepted div/button radiogroup pattern as PresetPanel.tsx:175.
            role="radio"
            aria-checked={active}
            tabIndex={pos === rovingPos ? 0 : -1}
            // Cowork QA ronda 3 §1 (C4, P3.7): the tooltip used to promise "pintar
            // el mapa por esta métrica" flat — but the aggregate can exist while the
            // per-unit detail is k-suppressed, so a click sometimes lands on "Sin
            // datos por unidad" and the promise reads as a lie. State the caveat so
            // the affordance is honest. (The deeper radio-vs-checkbox model fix is
            // WS-4 / ViewState P2 — this only corrects the copy.)
            title={`${title} · Click para pintar el mapa por esta métrica (el detalle por unidad puede estar protegido por k<5).`}
            onClick={() => {
              if (!active) onRebase(baseId);
            }}
            onKeyDown={(e) => handleKeyDown(e, pos)}
            className={`${cardClass} transition-colors hover:border-ln-op-celeste`}
          >
            <CardBody
              kpi={kpi}
              presetId={presetId}
              active={active}
              isSelectable
              temporalFrameActive={temporalFrameActive}
            />
          </button>
        ) : (
          // H8 (cowork QA): a KPI with no BASE map layer (zoonosis, denuncias…) is
          // NOT clickable — but it used to look identical to the clickable base
          // cards. Mark it honestly: a default cursor, no hover affordance, no
          // radio dot (the absence IS the "not tappable" signal — round-2 review
          // #4), and a tooltip stating it does not repaint the map. aria-disabled
          // announces the read-only nature to assistive tech; it carries no
          // role="radio"/aria-checked and is not part of the radiogroup.
          <div
            key={kpi.id}
            aria-disabled="true"
            className={`${cardClass} cursor-default`}
            title={`${title} · Indicador de referencia: no pinta el mapa.`}
          >
            <CardBody
              kpi={kpi}
              presetId={presetId}
              active={active}
              isSelectable={false}
              temporalFrameActive={temporalFrameActive}
            />
          </div>
        );
      })}
    </div>
  );
}

/** The leading radio-choice glyph: empty ring idle, filled dot when active. */
function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
        active ? "border-ln-op-azul bg-ln-op-azul" : "border-ln-op-mute bg-transparent"
      }`}
    />
  );
}

/** The card's inner content (value + delta + short label + sparkline). */
function CardBody({
  kpi,
  presetId,
  active,
  isSelectable,
  temporalFrameActive = false,
}: {
  kpi: PanoramaKpi;
  presetId: PresetId | null;
  active: boolean;
  isSelectable: boolean;
  temporalFrameActive?: boolean;
}) {
  const label = shortKpiLabel(presetId, kpi.id, kpi.label);
  const spark = kpi.sparkline;
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`text-[var(--text-lg)] font-bold tabular-nums ${
            active ? "text-ln-op-azul" : "text-ln-op-ink"
          }`}
        >
          {kpi.value}
        </span>
        {kpi.delta && (
          <span
            className="shrink-0 text-[var(--text-xs)] tabular-nums text-ln-op-faint"
            title={kpi.delta.label}
          >
            <span aria-hidden="true">{DELTA_GLYPH[kpi.delta.direction]}</span>{" "}
            {kpi.delta.pct > 0 ? "+" : ""}
            {kpi.delta.pct.toLocaleString("es-AR")}
            {kpi.delta.unit === "pts" ? " pts" : "%"}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {isSelectable && <RadioDot active={active} />}
          <span className="truncate text-[var(--text-xs)] text-ln-op-mute">{label}</span>
        </span>
        {spark && spark.length > 1 && (
          <Sparkline points={spark} width={64} height={18} ariaLabel={`Tendencia de ${label}`} />
        )}
      </div>
      {/* Coherence hybrid (cowork QA H1 / P2.4): a STOCK KPI does not move with
          the scrubber — say so, so the operator reads the scrubber's non-effect
          as intentional (the map + temporal KPIs move; this snapshot does not).
          While a temporal frame is active the tag is EMPHASIZED (a warn-toned
          pill + an explicit "no varía con la fecha") so the frozen big number is
          never mistaken for a stuck bug — the not-tracking is honest by design. */}
      {kpi.currentState && (
        <span
          className={`text-[var(--text-xs)] font-medium uppercase tracking-[0.06em] ${
            temporalFrameActive
              ? "w-fit rounded-[var(--radius-sm)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-1.5 py-0.5 text-ln-op-warn"
              : "text-ln-op-faint"
          }`}
          title="Valor de estado actual: no cambia con la línea de tiempo (la reproducción mueve el mapa y los indicadores temporales)."
        >
          {temporalFrameActive ? "estado actual · no varía con la fecha" : "estado actual"}
        </span>
      )}
      {/* Coherence hybrid (cowork QA H6): the clearly-labeled secondary figure
          (e.g. denuncias backlog) — visible without masquerading as the primary. */}
      {kpi.secondary && (
        <span className="truncate text-[var(--text-xs)] tabular-nums text-ln-op-faint">
          {kpi.secondary}
        </span>
      )}
    </>
  );
}
