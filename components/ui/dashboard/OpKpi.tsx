"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { ReactNode } from "react";

import { Icon } from "@/components/Icon";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { KPI_CATALOG, type KpiId, formatKpiTarget, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import {
  UNSTABLE_DELTA_BASE_NOTE,
  guardRatioTone,
  shouldSuppressDelta,
} from "@/lib/metrics/presentation-guards";
import { formatPercent } from "@/lib/utils/format";

/**
 * OpKpi v2 — backward-compatible KPI tile with optional new props.
 *
 * New optional props (existing callers unaffected):
 *  - info       — ⓘ tooltip: definition, formula, caveat (k-anon note)
 *  - delta      — delta vs período previo con flecha y tono (up/down)
 *  - sparkline  — mini serie inline sin ejes (recharts AreaChart)
 *  - drillHref  — KPI clickeable → lista de registros que lo componen
 *  - descriptorId / guardInput — C1 metric-contract path (see below)
 *
 * The existing `delta` prop (text + up) is preserved for backward compat.
 * The new `delta` (value + period) is additive when `info`/`sparkline` are also used.
 * To avoid collision with the existing `delta` prop shape, the new props use
 * distinct key names that don't exist in the v1 type.
 *
 * C1 METRIC CONTRACT (docs/reviews/results/2026-07-22-plan-maestro-integridad.md):
 * `descriptorId` is OPTIONAL and purely additive — every existing OpKpi caller
 * without it renders EXACTLY as before (the ratchet's grandfathered baseline;
 * see scripts/check-metric-contract.ts). When a caller DOES pass it:
 *  - `info` auto-resolves from the catalog's `getKpiInfo()` if not explicitly
 *    given, and always gets the descriptor's `target`/`confidence` appended
 *    as extra popover lines (the contract's "meta + fuente" and "confianza").
 *  - `guardInput.n` (the ratio's sample size/denominator) routes `value`/
 *    `tone` through `guardRatioTone` — the zero-denominator ("—") and
 *    small-N (forced-neutral + note) guards from the descriptor's `guards`.
 *  - `guardInput.priorBase` (the prior period's raw count) suppresses
 *    `deltaV2` when the descriptor's `guards.unstableDeltaBase` floor isn't
 *    met (the "−95% MoM on an unstable base" class).
 * Semaphore-tone resolution (never painting a "legal verdict" color for a
 * `semaphore: {paintAgainst: "none"}` KPI) is NOT auto-applied here — it
 * composes differently per KPI's own no-data branching (e.g. PPP's
 * flaggedCount===0 "neutral" vs a real value's "blue"), so call sites import
 * `resolveSemaphoreTone` from lib/metrics/presentation-guards directly and
 * pass the resolved `tone` prop, same as any other computed tone.
 */

type Tone = "neutral" | "danger" | "warn" | "ok" | "blue";

/** v1 delta (backward compat) */
type DeltaV1 = { text: string; up: boolean };

/**
 * v2 delta — numeric value + period label.
 * `unit` defaults to "percent" (existing callers unaffected). Use "count" for
 * a raw net-change value (e.g. queue size delta) so the chip doesn't render a
 * misleading "%" on a plain integer (demo-review M5).
 * `valence` controls the COLOR semantics (dataviz review 2026-07-23): the
 * default "goodWhenUp" keeps the existing green-up/red-down; "goodWhenDown"
 * inverts it for bad-when-up metrics (deaths, bites, no-shows, open rabies
 * observations) — a rising death count must never scan green; "neutral"
 * renders the muted no-verdict treatment (same posture as PanoramaKpiTile's
 * never-valence delta line).
 */
type DeltaV2 = {
  value: number;
  period: string;
  unit?: "percent" | "count";
  valence?: "goodWhenUp" | "goodWhenDown" | "neutral";
};

type InfoTooltip = {
  definition: string;
  formula?: string;
  caveat?: string;
  /** C1 contract extra — "meta X% (fuente)" line, appended when a
   *  `descriptorId` resolves a catalog entry with a `target`. */
  target?: string;
  /** C1 contract extra — "confianza: …" line, appended when a
   *  `descriptorId` resolves a catalog entry with `confidence.inputs`. */
  confidence?: string;
  /** FORECAST-A-META contract extra — the "proyección lineal simple…"
   *  methodology sentence, appended when a `descriptorId` resolves a catalog
   *  entry carrying `forecast` (see kpi-catalog.ts's KpiForecast). */
  methodology?: string;
  /** K8 contract extra — "Metodología v{n}" footer line, appended when a
   *  `descriptorId` resolves a catalog entry carrying `methodologyVersion`
   *  (see kpi-catalog.ts's KpiDefinition). Distinct from `methodology` above
   *  (the forecast sentence) — this is the numerator/label/target version stamp. */
  methodologyVersion?: string;
};

type Props = {
  label: string;
  value: ReactNode;
  /**
   * Optional NUMERIC value for the count-up animation (front-end delight): when
   * provided (and the resolved `value` isn't a guard dash), the headline eases
   * from its previous value to this one on change, via <AnimatedNumber>. `value`
   * stays the required SSR/reduced-motion/guard-dash fallback. `animatedFormat`
   * is a SERIALIZABLE kind (a string, NOT a function — OpKpi is a Client
   * Component reached from Server Components, which cannot pass functions across
   * the RSC boundary): "integer" → rounded es-AR; "percent" → formatPercent.
   */
  animatedValue?: number;
  animatedFormat?: "integer" | "percent";
  /** Optional mount-reveal start for the count-up (e.g. 0). SSR renders this — client-reveal only. */
  animatedStartAt?: number;
  tone?: Tone;
  /** v1 delta: { text, up } — kept for backward compat */
  delta?: DeltaV1;
  bar?: number;
  sub?: ReactNode;
  /**
   * red-team-admin #20: TRUE for a STOCK / point-in-time KPI (esterilización,
   * microchip, total registradas) whose value does NOT vary with a page-level
   * period control. Renders a small "no varía con el período" tag so an adjacent
   * period picker never implies it moves this number — mirrors the panorama
   * KpiChips "estado actual · no varía con la fecha" idiom.
   */
  periodInvariant?: boolean;
  /** v1 href — wraps the whole card in <a> */
  href?: string;
  size?: "default" | "sm";

  // --- New v2 optional props ---

  /**
   * Información sobre qué mide el KPI.
   * Muestra un botón ⓘ que despliega un tooltip con definición + fórmula + nota.
   */
  info?: InfoTooltip;

  /**
   * Delta numérico vs período previo (↑/↓ con tono de color).
   * Si se provee junto al `delta` v1 (text/up), ambos se muestran.
   * Uso: `deltaV2={{ value: 12.5, period: "vs mes anterior" }}`
   */
  deltaV2?: DeltaV2;

  /**
   * Mini-serie de puntos para el sparkline inline (últimos N períodos).
   * Se renderiza como un AreaChart sin ejes, sin tooltip, altura fija 32px.
   * No requiere keys ni labels — solo los valores numéricos en orden cronológico.
   */
  sparkline?: number[];

  /**
   * Si se provee, el KPI muestra un link "Ver detalle →" que lleva a la lista
   * de registros que componen el valor. Distinto de `href` (que wrappea el tile).
   */
  drillHref?: string;

  /**
   * FORECAST-A-META: the metric's forecast-to-target line (lib/metrics/
   * forecast-to-target.ts's `.line`), rendered as a muted, small line under
   * the tile's value/sub — the SAME tile, zero extra clicks, no new screen.
   * Pass the engine's raw `.line` output verbatim (already null-safe: pass
   * `undefined`/the engine's `null` result and nothing renders).
   */
  forecast?: string | null;

  /**
   * C1 metric-contract id (lib/metrics/kpi-catalog.ts). Purely additive —
   * see the module-level comment above. Omit for descriptor-less tiles (the
   * grandfathered baseline scripts/check-metric-contract.ts ratchets down).
   */
  descriptorId?: KpiId;

  /**
   * Raw inputs the guard engine needs when `descriptorId` is set — see the
   * module-level comment above for exactly which guard each field feeds.
   * Both optional: pass only the ones this tile's descriptor actually guards.
   */
  guardInput?: {
    /** Sample size / denominator the ratio is computed over. */
    n?: number;
    /** The PRIOR period's raw count, for delta-suppression. */
    priorBase?: number;
    /**
     * FORECAST-A-META: number of real trend points backing this render's
     * forecast — feeds the auto-appended methodology sentence's "últimos N
     * meses" when the descriptor carries `forecast`. Omit to fall back to a
     * generic (N-less) methodology sentence.
     */
    trendMonths?: number;
  };
};

// ---------------------------------------------------------------------------
// Tone glyph + accessible label maps (WCAG 1.4.1 — color not sole means)
//
// Reuses the icon-per-state pattern from OpStateBadge.tsx.
// Rendered only for warn/danger/ok tones; neutral/blue have no meaningful
// non-chromatic state to convey and are left unchanged.
// ---------------------------------------------------------------------------

const TONE_ICONS: Partial<Record<Tone, ReactNode>> = {
  danger: <Icon name="alerta" size={13} decorative />,
  warn: <Icon name="alerta" size={13} decorative />,
  ok: <Icon name="circle-dot" size={13} decorative />,
};

/** sr-only label appended after the icon so screen readers announce the state. */
const TONE_LABELS: Partial<Record<Tone, string>> = {
  danger: "Peligro",
  warn: "Atención",
  ok: "Normal",
};

// ---------------------------------------------------------------------------
// Token maps
// ---------------------------------------------------------------------------

// Status tones use st-* tokens — resolved to ln-op-* values via .op-surface
// cascade (zero visual diff; see globals.css .op-surface block).
const toneCard: Record<Tone, string> = {
  neutral: "bg-ln-op-card border-ln-op-line",
  danger: "bg-[var(--color-st-err-bg)] border-[var(--color-st-err-bd)]",
  warn: "bg-[var(--color-st-warn-bg)] border-[var(--color-st-warn-bd)]",
  ok: "bg-[var(--color-st-ok-bg)] border-[var(--color-st-ok-bd)]",
  blue: "bg-ln-op-blue-bg border-ln-op-blue-bd",
};

const toneValue: Record<Tone, string> = {
  neutral: "text-ln-op-ink",
  danger: "text-[var(--color-st-err)]",
  warn: "text-[var(--color-st-warn)]",
  ok: "text-[var(--color-st-ok)]",
  blue: "text-ln-op-azul",
};

// ---------------------------------------------------------------------------
// InfoTooltip sub-component
// ---------------------------------------------------------------------------

function InfoButton({ info }: { info: InfoTooltip }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-label="Información sobre este indicador"
        aria-expanded={open}
        onClick={(e) => {
          // preventDefault is load-bearing, not just stopPropagation: when the
          // whole tile is wrapped in <a href> (KPI cards on /gob/programa), the
          // ⓘ button is a descendant of that anchor, so a bare click still
          // triggers the anchor's NATIVE navigation. stopPropagation only stops
          // React bubbling; it does not cancel the ancestor <a> default. Without
          // this, clicking ⓘ navigated away instead of opening the tooltip
          // (Cowork B6). Navigation stays on the explicit tile/"Ver detalle" link.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="ml-1 inline-flex items-center align-middle text-ln-op-mute hover:text-ln-op-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul rounded-sm"
      >
        {/* PO directive: no loose glyphs. The ⓘ literal is replaced by the app's
            Icon registry (b026716c standardized all glyphs on it). */}
        <Icon name="info" size={14} decorative />
      </button>

      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Cerrar información"
            onClick={(e) => {
              // Same anchor-descendant hazard as the ⓘ trigger: this backdrop
              // covers the viewport and sits inside the tile's <a href>, so a
              // dismiss click must cancel the native navigation too.
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          {/* Popover aligned to the LN card system (rounded-lg / border-ln-line /
              bg-ln-card / shadow-lg) — the same surface tokens the panorama drawer
              and LN callouts use. Consistent vertical rhythm (space-y-1.5) and a
              leading-snug definition so it reads as one system, not a bespoke box. */}
          <div
            role="tooltip"
            className="absolute z-50 bottom-full left-0 mb-2 w-72 space-y-1.5 rounded-lg border border-ln-line bg-ln-card p-3 text-[var(--text-sm)] leading-snug text-ln-ink shadow-lg"
          >
            <p className="font-medium text-ln-ink-2">{info.definition}</p>
            {info.formula && (
              <p className="rounded bg-ln-stripe px-2 py-1 font-mono text-xs text-ln-ink-3">
                {info.formula}
              </p>
            )}
            {info.caveat && <p className="text-xs text-[var(--color-st-warn)]">{info.caveat}</p>}
            {/* C1 contract extras — target+source and confidence, appended
                when descriptorId resolved a catalog entry carrying them. */}
            {info.target && <p className="text-xs text-ln-ink-3">{info.target}</p>}
            {info.confidence && <p className="text-xs text-ln-ink-3">{info.confidence}</p>}
            {/* FORECAST-A-META: the "proyección lineal simple…" methodology
                sentence, appended when descriptorId resolved a catalog entry
                carrying `forecast`. */}
            {info.methodology && <p className="text-xs text-ln-ink-3">{info.methodology}</p>}
            {/* K8: "Metodología v{n}" footer, appended when descriptorId
                resolved a catalog entry carrying `methodologyVersion`. */}
            {info.methodologyVersion && (
              <p className="text-xs text-ln-op-mute">{info.methodologyVersion}</p>
            )}
          </div>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sparkline sub-component (bundle-size #22: dynamic-imported — recharts is
// only fetched when a caller actually passes `sparkline`, not on every OpKpi
// tile across every /gob, /admin, /org page that imports this module).
// ---------------------------------------------------------------------------

const Sparkline = dynamic(() => import("./OpKpiSparkline").then((m) => m.OpKpiSparkline), {
  ssr: false,
  loading: () => <div className="mt-2 h-8 w-full" aria-hidden="true" />,
});

// ---------------------------------------------------------------------------
// C1 metric-contract resolution (extracted — keeps OpKpi's own cognitive
// complexity under the lint budget; this function owns ALL of the
// descriptorId/guardInput branching in one place).
// ---------------------------------------------------------------------------

type ContractResolution = {
  value: ReactNode;
  tone: Tone;
  deltaV2: DeltaV2 | undefined;
  guardNote: string | undefined;
  info: InfoTooltip | undefined;
};

/** "Meta: X% (fuente)" / "Confianza: …" / methodology popover extras from a
 *  resolved descriptor. `trendMonths` is the live render's real trend-point
 *  count (guardInput.trendMonths) — undefined falls back to an N-less
 *  sentence rather than inventing a number. */
function contractInfoExtras(
  descriptor: ReturnType<typeof resolveDescriptor>,
  trendMonths: number | undefined,
) {
  // C1 fix (claim #6, cursor red-team 2026-07-23): render via formatKpiTarget
  // so a law-sourced but non-statutory target (e.g. rabies coverage's 80%)
  // never reads as "the law set this number" — see KpiTargetSourceKind.
  const target = descriptor?.target
    ? formatKpiTarget(descriptor.target, descriptor.unit)
    : undefined;
  const confidence = descriptor?.confidence
    ? `Confianza: ${descriptor.confidence.inputs.join(" · ")}`
    : undefined;
  // FORECAST-A-META: the methodology sentence lives HERE (auto-appended),
  // not as static catalog prose — it names the actual window this render
  // used, same spirit as target/confidence being computed, not typed once.
  const methodology = descriptor?.forecast
    ? `Proyección lineal simple sobre los últimos ${trendMonths !== undefined ? `${trendMonths} meses` : "meses disponibles"} — extrapolación, no promesa.`
    : undefined;
  // K8: "Metodología v{n}" footer — only descriptors whose numerator/label/
  // target changed on a dated basis carry `methodologyVersion` (omitted = v1,
  // no footer line at all — v1 is the silent default, not announced).
  const methodologyVersion = descriptor?.methodologyVersion
    ? `Metodología v${descriptor.methodologyVersion}`
    : undefined;
  return { target, confidence, methodology, methodologyVersion };
}

function resolveDescriptor(descriptorId: KpiId | undefined) {
  return descriptorId ? KPI_CATALOG[descriptorId] : undefined;
}

/**
 * Resolve the C1 metric-contract path — see the module-level comment. No-op
 * (identical to the raw props) when `descriptorId` is omitted, so every
 * existing OpKpi caller renders byte-identical output.
 */
function resolveOpKpiContract(
  descriptorId: KpiId | undefined,
  guardInput: Props["guardInput"],
  rawValue: ReactNode,
  rawTone: Tone,
  rawDeltaV2: DeltaV2 | undefined,
  rawInfo: InfoTooltip | undefined,
): ContractResolution {
  const descriptor = resolveDescriptor(descriptorId);

  let value = rawValue;
  let tone = rawTone;
  let deltaV2 = rawDeltaV2;
  let guardNote: string | undefined;

  if (descriptor && guardInput?.n !== undefined && typeof rawValue === "string") {
    const guarded = guardRatioTone(descriptor, {
      n: guardInput.n,
      computedTone: rawTone,
      formattedValue: rawValue,
    });
    value = guarded.value;
    tone = guarded.tone;
    guardNote = guarded.note;
  }

  if (
    descriptor &&
    deltaV2 &&
    guardInput?.priorBase !== undefined &&
    shouldSuppressDelta(descriptor, guardInput.priorBase)
  ) {
    deltaV2 = undefined;
    guardNote = guardNote ? `${guardNote} ${UNSTABLE_DELTA_BASE_NOTE}` : UNSTABLE_DELTA_BASE_NOTE;
  }

  // Auto-resolve `info` from the catalog when descriptorId is set and the
  // caller didn't pass an explicit one, then append the contract extras
  // (target+source, confidence, forecast methodology) regardless of which
  // info source won.
  const baseInfo = rawInfo ?? (descriptorId ? getKpiInfo(descriptorId) : undefined);
  const info = baseInfo
    ? { ...baseInfo, ...contractInfoExtras(descriptor, guardInput?.trendMonths) }
    : undefined;

  return { value, tone, deltaV2, guardNote, info };
}

// ---------------------------------------------------------------------------
// OpKpi — full-size tile
// ---------------------------------------------------------------------------

/**
 * Full-size KPI tile. min-h-[112px], serif value, optional delta/bar/sub.
 * v2: adds info tooltip, deltaV2, sparkline, drillHref (all optional).
 */
export function OpKpi({
  label,
  value: rawValue,
  animatedValue,
  animatedFormat,
  animatedStartAt,
  tone: rawTone = "neutral",
  delta,
  bar,
  sub,
  periodInvariant,
  href,
  info: rawInfo,
  deltaV2: rawDeltaV2,
  sparkline,
  drillHref,
  forecast,
  descriptorId,
  guardInput,
}: Props) {
  const { value, tone, deltaV2, guardNote, info } = resolveOpKpiContract(
    descriptorId,
    guardInput,
    rawValue,
    rawTone,
    rawDeltaV2,
    rawInfo,
  );

  const cardCls = [
    "flex flex-col rounded-[var(--radius-md)] border p-[14px_16px]",
    "min-h-[112px] no-underline text-inherit",
    toneCard[tone],
  ].join(" ");

  const content = (
    <>
      {/* Label + tone glyph + ⓘ */}
      <div className="mb-2 flex items-center gap-1">
        {TONE_ICONS[tone] && (
          <>
            <span aria-hidden="true" className="inline-flex items-center leading-none">
              {TONE_ICONS[tone]}
            </span>
            <span className="sr-only">{TONE_LABELS[tone]}:</span>
          </>
        )}
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {label}
        </span>
        {info && <InfoButton info={info} />}
      </div>

      {/* Value */}
      <div
        className={[
          "font-ln-serif text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
          toneValue[tone],
        ].join(" ")}
      >
        {animatedValue !== undefined && value !== "—" ? (
          <AnimatedNumber
            value={animatedValue}
            // Map the serializable kind → a client-side formatter HERE (functions
            // can't cross the RSC boundary). "integer" → AnimatedNumber's default.
            format={animatedFormat === "percent" ? (n) => formatPercent(n) : undefined}
            startAt={animatedStartAt}
          />
        ) : (
          value
        )}
      </div>

      {/* Guard note (C1) — smallN / unstable-delta explanations from the
          guard engine. Rendered distinctly from `sub` (which stays whatever
          the caller composed) so the guard's own honesty note is never
          silently absorbed into arbitrary caller copy. */}
      {guardNote && <p className="mt-1 text-xs text-ln-op-mute">{guardNote}</p>}

      {/* Sparkline (v2) */}
      {sparkline && sparkline.length >= 2 && <Sparkline values={sparkline} tone={tone} />}

      {/* Progress bar */}
      {bar !== undefined && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-sm bg-black/[0.07]">
          <span
            className="block h-full rounded-sm"
            style={{
              width: `${Math.min(100, Math.max(0, bar))}%`,
              background: "currentColor",
            }}
          />
        </div>
      )}

      {/* v1 Delta (text + up) — backward compat */}
      {delta && (
        <div
          className={[
            "mt-2 flex items-center gap-1.5 text-sm font-semibold tabular-nums",
            delta.up ? "text-[var(--color-st-ok)]" : "text-[var(--color-st-err)]",
          ].join(" ")}
        >
          <span aria-hidden="true">{delta.up ? "↑" : "↓"}</span>
          <span className="sr-only">{delta.up ? "Sube:" : "Baja:"}</span>
          <span>{delta.text}</span>
        </div>
      )}

      {/* v2 Delta (numeric value + period).
          demo-review M5: a delta of exactly 0 got an up-arrow / "Sube" label —
          honest text ("+0%") next to a directional arrow reads as a real
          increase. No arrow (and neutral tone) when the delta is exactly 0. */}
      {deltaV2 && (
        <div
          className={[
            "mt-1 flex items-center gap-1.5 text-sm font-semibold tabular-nums",
            deltaV2.value === 0 || deltaV2.valence === "neutral"
              ? "text-ln-op-mute"
              : deltaV2.value > 0 === (deltaV2.valence !== "goodWhenDown")
                ? "text-[var(--color-st-ok)]"
                : "text-[var(--color-st-err)]",
          ].join(" ")}
        >
          {deltaV2.value !== 0 && (
            <>
              <span aria-hidden="true">{deltaV2.value > 0 ? "↑" : "↓"}</span>
              <span className="sr-only">{deltaV2.value > 0 ? "Sube:" : "Baja:"}</span>
            </>
          )}
          <span>
            {deltaV2.value >= 0 ? "+" : ""}
            {deltaV2.value}
            {deltaV2.unit === "count" ? "" : "%"}{" "}
            <span className="font-normal text-ln-op-mute">{deltaV2.period}</span>
          </span>
        </div>
      )}

      {/* Sub */}
      {sub && <div className="mt-auto pt-1.5 text-[var(--text-sm)] text-ln-op-mute">{sub}</div>}

      {/* red-team-admin #20: point-in-time KPI under a period control — say it
          plainly so the picker never reads as a broken control on this tile. */}
      {periodInvariant && (
        <p
          className="mt-1 text-[var(--text-xs)] font-medium uppercase tracking-[0.06em] text-ln-op-faint"
          title="Valor de estado actual (point-in-time): el selector de período mueve los gráficos, no este número."
        >
          no varía con el período
        </p>
      )}

      {/* FORECAST-A-META: the forecast-to-target line — a PROPERTY of this
          metric, rendered right where its value already lives (zero extra
          clicks, no new screen). `forecast` is the engine's `.line` output
          verbatim: null/undefined (met/insufficient/no descriptor.forecast)
          renders nothing, by construction — never an invented line. */}
      {forecast && <p className="mt-1 text-xs text-ln-op-mute">{forecast}</p>}

      {/* Drill link (v2) */}
      {drillHref && (
        <a
          href={drillHref}
          className="mt-auto pt-1.5 text-[var(--text-sm)] text-ln-op-azul hover:underline self-start"
          onClick={(e) => e.stopPropagation()}
        >
          Ver detalle →
        </a>
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} className={cardCls}>
        {content}
      </a>
    );
  }
  return <div className={cardCls}>{content}</div>;
}

// ---------------------------------------------------------------------------
// OpKpiSm — compact tile (unchanged v1, re-exported for compat)
// ---------------------------------------------------------------------------

type SmProps = Pick<Props, "label" | "value" | "tone" | "sub" | "href">;

/**
 * Compact KPI tile. Smaller value (25px), 9px label, optional hint row.
 */
export function OpKpiSm({ label, value, tone = "neutral", sub, href }: SmProps) {
  const cardCls = [
    "flex flex-col rounded-[var(--radius-md)] border p-[11px_13px]",
    "no-underline text-inherit",
    toneCard[tone],
  ].join(" ");

  const content = (
    <>
      <div className="mb-1 text-[var(--text-xs)] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        {label}
      </div>
      <div
        className={[
          "font-ln-serif text-[25px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
          toneValue[tone],
        ].join(" ")}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-ln-op-mute">{sub}</div>}
    </>
  );

  if (href) {
    return (
      <a href={href} className={cardCls}>
        {content}
      </a>
    );
  }
  return <div className={cardCls}>{content}</div>;
}
