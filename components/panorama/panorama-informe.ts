// task #55 — "Informe de situación": the pure projection that shapes the CURRENT
// panorama view into a print-ready operator briefing model.
//
// This is a govt decision-justification artifact, so it is a PURE projection of
// what the console already computed — same `(view, data) → render` discipline as
// the map, the KPI strip, and the ranking. It NEVER fetches, never derives a
// metric, and never touches the k-anon cell pipeline: every number arrives
// pre-computed (and pre-suppressed) from the console. The suppressed-cell COUNT
// is disclosed for audit, but no suppressed VALUE is ever reconstructed here.
//
// Kept framework-free (no React) so the formatting decisions — the "Situación al"
// label, the ranking heading, the value/gap formatting, the per-KPI method note —
// are unit-testable without rendering the client console (mirrors panorama-export.ts
// and domain/reading.ts). The component (PanoramaInformeSituacion.tsx) only renders
// this model.
//
// es-AR user copy, English identifiers (project invariant #4).

import { smallScopeRankingHeading } from "@/components/panorama/panorama-console-helpers";
import { formatAsOfDate } from "@/components/panorama/panorama-export";
import {
  type ViewScopeDescriptor,
  describeViewScope,
  serializeViewScope,
  viewScopeDigest,
} from "@/lib/ui/view-scope-descriptor";

/** One KPI as the console strip renders it (value + estado-actual + delta). */
export type InformeKpiInput = {
  id: string;
  label: string;
  /** Pre-formatted display value (es-AR), e.g. "64%" or "1.204". */
  value: string;
  /** Secondary caption line under the value. */
  sub?: string;
  /** Clearly-labeled secondary figure (e.g. "backlog: 2.202 activas"). */
  secondary?: string;
  /**
   * TRUE for a STOCK / point-in-time KPI (cobertura, esterilización, microchip,
   * pérdidas) whose value does NOT move with the time scrubber — carries the
   * honest "estado actual" tag so the corte's non-effect reads as intentional.
   */
  currentState?: boolean;
  /** Period-over-period delta label with its correct unit (pts vs pct). */
  delta?: { label: string };
  /** The ⓘ tooltip — its first sentence becomes the method footnote. */
  info: { definition: string };
};

/** One ranked unit, exactly as rankWorstUnits produced it (suppressed cells already dropped). */
export type InformeRankInput = {
  key: string;
  label: string;
  /** Rate → a percentage; density → a count. */
  value: number;
  /** pts below the compliance target (rate rankings only), else null. */
  gap: number | null;
};

export type InformeRankingInput = {
  rows: InformeRankInput[];
  /** rate → "% · pts vs objetivo"; density → a count. */
  kind: "rate" | "density";
  /** es-AR label of the ranked measure (e.g. "cobertura antirrábica"). */
  measureLabel: string;
  /** Small-scope fallback: rows is EVERY in-scope unit, not a "worst N". */
  smallScope: boolean;
  /** es-AR plural unit noun for the small-scope header (comunas/departamentos/…). */
  unitNoun: string;
  /** k-anon-suppressed units in the ranking layer (audit disclosure). */
  suppressedCount: number;
  /** The base layer produced no data — never claim "sin unidades bajo meta". */
  unavailable: boolean;
  /**
   * UX audit 2026-07-26 (finding 4): the rows are ordered by raw VOLUME, not by
   * badness — the rate→count coercion below province grain. Same flag
   * PanoramaDataTable takes; the printed informe and the on-screen ranking are
   * the SAME projection and must not disagree about what the order means.
   */
  orderedByVolume?: boolean;
};

export type BuildInformeInput = {
  /** es-AR scope label (e.g. "Nacional", "Córdoba", "Palermo · CABA"). */
  scopeLabel: string;
  /** es-AR period label (e.g. "últimos 90 días"). */
  periodLabel: string;
  /** The temporal corte, or null when parked at the live edge. */
  asOf: Date | null;
  /** When the operator generated the informe (null until they trigger it). */
  generatedAt: Date | null;
  /** TRUE when the console is showing the "Datos de demostración" banner. */
  isDemo: boolean;
  /** The one-line ViewState description (explainViewState — the P5 gift). */
  viewSummary: string;
  /** The KPIs the operator sees (the active preset's curated subset). */
  kpis: InformeKpiInput[];
  /**
   * E1 (map plan) — the shareable URL that REPRODUCES this exact view. Printed
   * as text, not a link: a briefing that leaves the screen must still say where
   * it came from, and a reader holding paper cannot click. Null when the caller
   * has no URL yet (SSR/first paint), which prints nothing rather than a lie.
   * Carries scope, period, layer, encoding and CAMERA coordinates (lat/lng
   * rounded to 3 dp ≈ 110 m) — no person, pet, case or free-text param exists on
   * this surface today. That is a property of the current param set, NOT an
   * enforced invariant: this prints `window.location.href` verbatim, so a future
   * `?q=`/`?owner=` would reach paper the day it ships. Whitelisting the params
   * (with a test asserting the set) is the follow-up.
   */
  viewUrl?: string | null;
  /** The KPI fan-out failed — no real numbers; replace conclusions with an honest failure. */
  kpisDegraded: boolean;
  /** The "Peores N" ranking, or null when the active view has no rankable layer. */
  ranking: InformeRankingInput | null;
  /** The plain-language map caption (captionFor / the bivariate copy), or null. */
  caption: string | null;
  /** The active layer labels, in activation order. */
  activeLayerLabels: string[];
  /** Total k-anon-suppressed cells across the active layers (audit disclosure). */
  suppressedTotal: number;
  /**
   * V2 — the SERIALIZABLE scope this briefing was cut from.
   *
   * `scopeLabel` and `viewSummary` above describe the scope in prose, which a
   * reader can understand and nobody can re-execute. This is the same scope as
   * an object: role, mandate, effective view, grain, period, as-of + basis,
   * layers, encoding and the verified filter — everything needed to regenerate
   * the numbers on this page. The informe is the artifact with room to print it
   * in full, so it is the one that carries the whole descriptor rather than a
   * handle to it. Absent → a pre-V2 briefing (prose scope only).
   */
  viewScope?: ViewScopeDescriptor | null;
};

export type InformeKpiModel = {
  id: string;
  label: string;
  value: string;
  sub?: string;
  secondary?: string;
  /** "estado actual" tag copy when the KPI is a stock, else undefined. */
  stateTag?: string;
  deltaLabel?: string;
};

export type InformeRankRowModel = {
  key: string;
  rank: number;
  label: string;
  /** Pre-formatted value ("64%" or "1.204"). */
  value: string;
  /** "−12 pts vs objetivo" for a rate ranking below target, else undefined. */
  gapText?: string;
};

export type InformeRankingModel = {
  heading: string;
  columnLabel: string;
  rows: InformeRankRowModel[];
  /** Honest empty/failure copy when there are no rows. */
  emptyText?: string;
  /** "N unidades protegidas por privacidad (k-anonimato)" when suppressedCount > 0. */
  suppressedNote?: string;
};

export type InformeModel = {
  title: string;
  asOfLabel: string;
  periodLabel: string;
  scopeLabel: string;
  generatedAtLabel: string | null;
  isDemo: boolean;
  /** The always-present honesty banner copy (only rendered when isDemo). */
  demoText: string;
  viewSummary: string;
  kpis: InformeKpiModel[];
  /** Replaces the KPIs with an honest failure line when the fan-out failed. */
  kpisDegradedText?: string;
  ranking: InformeRankingModel | null;
  caption: string | null;
  activeLayerLabels: string[];
  /** The method / footnote block: per-KPI first-sentence definitions. */
  methodNotes: string[];
  /** The k-anon disclosure sentence + the scoped suppressed-cell count. */
  kAnonDisclosure: string;
  /** E1 — the URL that reproduces this view, printed for traceability. */
  viewUrl: string | null;
  /**
   * V2 — the reproducible-scope block, or null for a pre-V2 briefing.
   *
   * Split into what a HUMAN reads and what a MACHINE re-executes, because they
   * have different jobs: `mandate`/`narrowed` answer "whose view is this?" in
   * the same es-AR the screen used (the C3 caption builders, never a second
   * vocabulary), while `json` is the payload a reproduction is run from.
   * `viewId` is the short digest the PNG footer and the CSV block also print, so
   * three artifacts of one board can be shown to belong together.
   */
  scopeDescriptor: {
    /** The operator's mandate — "CABA", "3 localidades · Córdoba", "Nacional". */
    mandate: string;
    /** The active filter's narrowing, ONLY when it sits below the mandate. */
    narrowed: string | null;
    /** Short stable view identity (excludes the generation instant). */
    viewId: string;
    /** The full canonical serialization — what a regeneration reads. */
    json: string;
  } | null;
};

const RANKING_LIMIT = 10;

/** es-AR datetime for the generation stamp — "12/07/2026 14:30". */
function formatGeneratedAt(now: Date): string {
  return now.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The "situación al" header line. A temporal corte reads "Situación al {fecha}";
 * the live edge reads honestly as live data with no corte (never a fake date).
 */
export function informeAsOfLabel(asOf: Date | null): string {
  return asOf ? `Situación al ${formatAsOfDate(asOf)}` : "Datos en vivo (sin corte temporal)";
}

/** Format a ranked value for display — mirrors RankedUnitsPanel.formatValue. */
function formatRankValue(value: number, kind: "rate" | "density"): string {
  return kind === "rate" ? `${Math.round(value)}%` : value.toLocaleString("es-AR");
}

/** The first sentence of a KPI definition — the method footnote (mirrors KpiChips.methodNote). */
function firstSentence(definition: string): string {
  const def = definition ?? "";
  const stop = def.indexOf(". ");
  return stop > 0 ? def.slice(0, stop + 1) : def;
}

function buildRanking(ranking: InformeRankingInput): InformeRankingModel {
  // Header mirrors PanoramaDataTable: small scope → "N {unitNoun}" (T5.2 —
  // shared helper, singular/plural agreement, no possessive), a volume
  // order → "Mayor volumen N", else "Peores N" — all suffixed with the metric so
  // "peores en qué" is answerable.
  const rankedCount = ranking.rows.length > 0 ? ranking.rows.length : RANKING_LIMIT;
  const heading = ranking.smallScope
    ? smallScopeRankingHeading(ranking.rows.length, ranking.unitNoun, ranking.measureLabel)
    : ranking.orderedByVolume
      ? `Mayor volumen ${rankedCount} · ${ranking.measureLabel}`
      : `Peores ${rankedCount} · ${ranking.measureLabel}`;

  const columnLabel =
    ranking.kind === "rate" ? `${ranking.measureLabel} · pts vs objetivo` : ranking.measureLabel;

  const rows: InformeRankRowModel[] = ranking.rows.map((row, i) => ({
    key: row.key,
    rank: i + 1,
    label: row.label,
    value: formatRankValue(row.value, ranking.kind),
    gapText:
      ranking.kind === "rate" && row.gap !== null
        ? `−${Math.round(row.gap)} pts vs objetivo`
        : undefined,
  }));

  // Honest empty states — a failed/empty layer must never read as an all-clear.
  let emptyText: string | undefined;
  if (rows.length === 0) {
    emptyText = ranking.unavailable
      ? "No pudimos calcular el ranking en este momento."
      : ranking.kind === "rate"
        ? "Sin unidades bajo meta en este alcance."
        : "Sin datos suficientes en este alcance.";
  }

  const suppressedNote =
    ranking.suppressedCount > 0
      ? `${ranking.suppressedCount.toLocaleString("es-AR")} ${
          ranking.suppressedCount === 1 ? "unidad protegida" : "unidades protegidas"
        } por privacidad (k-anonimato).`
      : undefined;

  return { heading, columnLabel, rows, emptyText, suppressedNote };
}

/**
 * Build the informe model from the current view. Pure — every value is already
 * computed and privacy-suppressed by the console; this only formats + arranges.
 */
export function buildInformeModel(input: BuildInformeInput): InformeModel {
  const kpis: InformeKpiModel[] = input.kpis.map((k) => ({
    id: k.id,
    label: k.label,
    value: k.value,
    sub: k.sub,
    secondary: k.secondary,
    stateTag: k.currentState ? "estado actual" : undefined,
    deltaLabel: k.delta?.label,
  }));

  // The method footnotes: the first sentence of each shown KPI's definition —
  // the SAME wording as the KPI strip's ⓘ tooltip (dashboard parity). Deduped so
  // two KPIs sharing a lead sentence don't repeat it.
  const methodNotes = [...new Set(input.kpis.map((k) => firstSentence(k.info.definition)))].filter(
    (s) => s.length > 0,
  );

  // The k-anon disclosure — the SAME treatment the map + Registros apply, stated
  // once with the scoped suppressed-cell count for audit.
  const kAnonBase =
    "Las unidades con menos de 5 casos se muestran como «Protegido» — nunca con un número (k-anonimato).";
  const kAnonDisclosure =
    input.suppressedTotal > 0
      ? `${kAnonBase} En esta vista, ${input.suppressedTotal.toLocaleString("es-AR")} ${
          input.suppressedTotal === 1 ? "celda oculta" : "celdas ocultas"
        } por privacidad.`
      : kAnonBase;

  return {
    title: `Informe de situación · ${input.scopeLabel}`,
    asOfLabel: informeAsOfLabel(input.asOf),
    periodLabel: input.periodLabel,
    scopeLabel: input.scopeLabel,
    generatedAtLabel: input.generatedAt ? formatGeneratedAt(input.generatedAt) : null,
    isDemo: input.isDemo,
    viewUrl: input.viewUrl ?? null,
    demoText:
      "Datos de demostración. El dataset cargado es sintético (densidad ponderada por Censo 2022); no representa casos reales.",
    viewSummary: input.viewSummary,
    kpis: input.kpisDegraded ? [] : kpis,
    kpisDegradedText: input.kpisDegraded
      ? "No pudimos calcular los indicadores para esta vista. Reintentá en unos segundos."
      : undefined,
    ranking: input.ranking ? buildRanking(input.ranking) : null,
    caption: input.caption,
    activeLayerLabels: input.activeLayerLabels,
    methodNotes,
    kAnonDisclosure,
    scopeDescriptor: input.viewScope
      ? {
          ...describeViewScope(input.viewScope),
          viewId: viewScopeDigest(input.viewScope),
          json: serializeViewScope(input.viewScope),
        }
      : null,
  };
}
