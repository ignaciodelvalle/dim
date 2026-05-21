import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

// KPI tile for the /gob dashboard. Pure prop-driven, server-component safe.
// Variants combine independently:
//   - plain:  just the number (default)
//   - target: number + thin progress bar toward `target`
//   - delta:  number + colored arrow + magnitude
// `tone` is the semantic frame: neutral surface vs semantic (info/danger/etc).
//
// Designed to compose with other KpiTiles inside a CSS grid; the tile takes
// `w-full` and lets the grid control sizing.
//
// Spec: docs/gob-dashboard-plan-2026-05-20.md — Phase 1.

export type KpiTileTone = "neutral" | "info" | "success" | "warning" | "danger";

type Direction = "up" | "down" | "flat";

interface BaseProps {
  label: string;
  value: string | number;
  /** Optional small line below the value (e.g. "23 partidos", "+1 esta semana") */
  subline?: ReactNode;
  /** Lift the tile onto a colored background — for the "danger" callout etc. */
  tone?: KpiTileTone;
  /** Make the whole tile a link to a drill-down view. */
  href?: string;
  /** Optional leading icon — pass any small element (lucide, emoji, span). */
  icon?: ReactNode;
}

interface TargetProps extends BaseProps {
  variant: "target";
  /** Numeric current value the bar fills toward. */
  current: number;
  /** Numeric target the bar fills toward. */
  target: number;
}

interface DeltaProps extends BaseProps {
  variant: "delta";
  /** Free-form delta label, e.g. "↑ 12% vs abril". `direction` colors it. */
  deltaLabel: string;
  direction: Direction;
}

interface PlainProps extends BaseProps {
  variant?: "plain";
}

export type KpiTileProps = PlainProps | TargetProps | DeltaProps;

const TONE_FRAME: Record<KpiTileTone, string> = {
  neutral: "bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50",
  info: "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100",
  success: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100",
  warning: "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100",
  danger: "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100",
};

const TONE_LABEL: Record<KpiTileTone, string> = {
  neutral: "text-neutral-600 dark:text-neutral-400",
  info: "text-blue-700 dark:text-blue-300",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-800 dark:text-amber-300",
  danger: "text-red-700 dark:text-red-300",
};

const DELTA_COLOR: Record<Direction, string> = {
  up: "text-emerald-700 dark:text-emerald-300",
  down: "text-red-700 dark:text-red-300",
  flat: "text-neutral-600 dark:text-neutral-400",
};

export function KpiTile(props: KpiTileProps) {
  const tone = props.tone ?? "neutral";
  const frame = TONE_FRAME[tone];
  const labelColor = TONE_LABEL[tone];

  const inner = (
    <div className={`rounded-xl p-4 h-full w-full flex flex-col gap-2 ${frame}`}>
      <header className="flex items-center gap-2 min-w-0">
        {props.icon && <span aria-hidden>{props.icon}</span>}
        <p className={`text-xs font-medium truncate ${labelColor}`}>{props.label}</p>
      </header>

      <p className="text-3xl font-semibold leading-none tabular-nums">{props.value}</p>

      {props.variant === "target" && (
        <TargetBar current={props.current} target={props.target} tone={tone} />
      )}

      {props.variant === "delta" && (
        <p className={`text-xs font-medium ${DELTA_COLOR[props.direction]}`}>{props.deltaLabel}</p>
      )}

      {props.subline && <p className={`text-xs ${labelColor} mt-auto`}>{props.subline}</p>}
    </div>
  );

  if (props.href) {
    return (
      <Link
        href={props.href}
        className="block h-full w-full rounded-xl transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-950"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

function TargetBar({
  current,
  target,
  tone,
}: { current: number; target: number; tone: KpiTileTone }) {
  const pct = Math.max(0, Math.min(100, target === 0 ? 0 : (current / target) * 100));
  const trackBg =
    tone === "neutral" ? "bg-neutral-200 dark:bg-neutral-800" : "bg-white/30 dark:bg-black/20";
  const fillBg =
    tone === "danger"
      ? "bg-red-600 dark:bg-red-400"
      : tone === "warning"
        ? "bg-amber-600 dark:bg-amber-400"
        : tone === "success"
          ? "bg-emerald-600 dark:bg-emerald-400"
          : "bg-blue-700 dark:bg-blue-400";
  return (
    <div className="space-y-1">
      <div
        className={`h-1.5 w-full rounded-full overflow-hidden ${trackBg}`}
        role="progressbar"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={current}
        aria-label={`${current} de ${target}`}
      >
        <div className={`h-full ${fillBg}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Convenience grid container — drop KpiTiles inside.
// Auto-fits columns at 200px min, so 2 fit on mobile, 4 on desktop.
export function KpiTileGrid({ className = "", ...rest }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...rest}
      className={`grid gap-3 ${className}`}
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
    />
  );
}
