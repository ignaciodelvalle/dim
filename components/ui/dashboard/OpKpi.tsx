"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

/**
 * OpKpi v2 — backward-compatible KPI tile with optional new props.
 *
 * New optional props (existing callers unaffected):
 *  - info       — ⓘ tooltip: definition, formula, caveat (k-anon note)
 *  - delta      — delta vs período previo con flecha y tono (up/down)
 *  - sparkline  — mini serie inline sin ejes (recharts AreaChart)
 *  - drillHref  — KPI clickeable → lista de registros que lo componen
 *
 * The existing `delta` prop (text + up) is preserved for backward compat.
 * The new `delta` (value + period) is additive when `info`/`sparkline` are also used.
 * To avoid collision with the existing `delta` prop shape, the new props use
 * distinct key names that don't exist in the v1 type.
 */

type Tone = "neutral" | "danger" | "warn" | "ok" | "blue";

/** v1 delta (backward compat) */
type DeltaV1 = { text: string; up: boolean };

/** v2 delta — numeric value + period label */
type DeltaV2 = { value: number; period: string };

type InfoTooltip = {
  definition: string;
  formula?: string;
  caveat?: string;
};

type Props = {
  label: string;
  value: ReactNode;
  tone?: Tone;
  /** v1 delta: { text, up } — kept for backward compat */
  delta?: DeltaV1;
  bar?: number;
  sub?: ReactNode;
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
};

// ---------------------------------------------------------------------------
// Tone glyph + accessible label maps (WCAG 1.4.1 — color not sole means)
//
// Reuses the icon-per-state pattern from OpStateBadge.tsx.
// Rendered only for warn/danger/ok tones; neutral/blue have no meaningful
// non-chromatic state to convey and are left unchanged.
// ---------------------------------------------------------------------------

const TONE_ICONS: Partial<Record<Tone, string>> = {
  danger: "⚠",
  warn: "⚠",
  ok: "●",
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

const toneCard: Record<Tone, string> = {
  neutral: "bg-ln-op-card border-ln-op-line",
  danger: "bg-ln-op-danger-bg border-ln-op-danger-bd",
  warn: "bg-ln-op-warn-bg border-ln-op-warn-bd",
  ok: "bg-ln-op-ok-bg border-ln-op-ok-bd",
  blue: "bg-ln-op-blue-bg border-ln-op-blue-bd",
};

const toneValue: Record<Tone, string> = {
  neutral: "text-ln-op-ink",
  danger: "text-ln-op-danger",
  warn: "text-ln-op-warn",
  ok: "text-ln-op-ok",
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
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="ml-1 text-ln-op-mute hover:text-ln-op-ink text-[11px] leading-none align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-azul rounded-sm"
      >
        ⓘ
      </button>

      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Cerrar información"
            onClick={() => setOpen(false)}
          />
          <div
            role="tooltip"
            className="absolute z-50 bottom-full left-0 mb-2 w-64 rounded-lg border border-ln-line bg-ln-card shadow-lg p-3 text-[11px] text-ln-ink"
          >
            <p className="font-medium text-ln-ink-2 mb-1">{info.definition}</p>
            {info.formula && (
              <p className="text-ln-ink-3 font-mono text-[10px] bg-ln-stripe rounded px-2 py-1 mb-1">
                {info.formula}
              </p>
            )}
            {info.caveat && <p className="text-ln-op-warn text-[10px]">{info.caveat}</p>}
          </div>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sparkline sub-component
// ---------------------------------------------------------------------------

function Sparkline({ values, tone }: { values: number[]; tone: Tone }) {
  if (values.length < 2) return null;

  const strokeColor =
    tone === "ok"
      ? "#31a354"
      : tone === "danger"
        ? "#cb181d"
        : tone === "warn"
          ? "#e6550d"
          : tone === "blue"
            ? "#2171b5"
            : "#6b7280";

  const chartData = values.map((v, i) => ({ i, v }));

  return (
    <div className="mt-2 h-8 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height={32}>
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparkFill-${tone}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill={`url(#sparkFill-${tone})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
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
  value,
  tone = "neutral",
  delta,
  bar,
  sub,
  href,
  info,
  deltaV2,
  sparkline,
  drillHref,
}: Props) {
  const cardCls = [
    "flex flex-col rounded-[6px] border p-[14px_16px]",
    "min-h-[112px] no-underline text-inherit",
    toneCard[tone],
  ].join(" ");

  const content = (
    <>
      {/* Label + tone glyph + ⓘ */}
      <div className="mb-2 flex items-center gap-1">
        {TONE_ICONS[tone] && (
          <>
            <span aria-hidden="true" className="text-[11px] leading-none">
              {TONE_ICONS[tone]}
            </span>
            <span className="sr-only">{TONE_LABELS[tone]}:</span>
          </>
        )}
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {label}
        </span>
        {info && <InfoButton info={info} />}
      </div>

      {/* Value */}
      <div
        className={[
          "font-ln-serif text-[30px] font-semibold leading-none tracking-[-0.02em]",
          toneValue[tone],
        ].join(" ")}
      >
        {value}
      </div>

      {/* Sparkline (v2) */}
      {sparkline && sparkline.length >= 2 && <Sparkline values={sparkline} tone={tone} />}

      {/* Progress bar */}
      {bar !== undefined && (
        <div className="mt-[10px] h-1 overflow-hidden rounded-sm bg-black/[0.07]">
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
            "mt-2 flex items-center gap-1.5 text-[12px] font-semibold",
            delta.up ? "text-ln-op-ok" : "text-ln-op-danger",
          ].join(" ")}
        >
          <span aria-hidden="true">{delta.up ? "↑" : "↓"}</span>
          <span className="sr-only">{delta.up ? "Sube:" : "Baja:"}</span>
          <span>{delta.text}</span>
        </div>
      )}

      {/* v2 Delta (numeric value + period) */}
      {deltaV2 && (
        <div
          className={[
            "mt-1 flex items-center gap-1.5 text-[12px] font-semibold",
            deltaV2.value >= 0 ? "text-ln-op-ok" : "text-ln-op-danger",
          ].join(" ")}
        >
          <span aria-hidden="true">{deltaV2.value >= 0 ? "↑" : "↓"}</span>
          <span className="sr-only">{deltaV2.value >= 0 ? "Sube:" : "Baja:"}</span>
          <span>
            {deltaV2.value >= 0 ? "+" : ""}
            {deltaV2.value}% <span className="font-normal text-ln-op-mute">{deltaV2.period}</span>
          </span>
        </div>
      )}

      {/* Sub */}
      {sub && <div className="mt-auto pt-1.5 text-[11px] text-ln-op-mute">{sub}</div>}

      {/* Drill link (v2) */}
      {drillHref && (
        <a
          href={drillHref}
          className="mt-auto pt-1.5 text-[11px] text-ln-azul hover:underline self-start"
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
    "flex flex-col rounded-[6px] border p-[11px_13px]",
    "no-underline text-inherit",
    toneCard[tone],
  ].join(" ");

  const content = (
    <>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        {label}
      </div>
      <div
        className={[
          "font-ln-serif text-[25px] font-semibold leading-none tracking-[-0.02em]",
          toneValue[tone],
        ].join(" ")}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] text-ln-op-mute">{sub}</div>}
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
