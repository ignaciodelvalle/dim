import type { ReactNode } from "react";

type Tone = "neutral" | "danger" | "warn" | "ok" | "blue";

type Props = {
  label: string;
  value: ReactNode;
  tone?: Tone;
  delta?: { text: string; up: boolean };
  bar?: number;
  sub?: ReactNode;
  href?: string;
  size?: "default" | "sm";
};

// Token maps — only ln-op-* confirmed in globals.css
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

/**
 * Full-size KPI tile (mimics .gob-kpi from the handoff).
 * min-h-[112px], serif value, optional delta/bar/sub.
 */
export function OpKpi({ label, value, tone = "neutral", delta, bar, sub, href }: Props) {
  const cardCls = [
    "flex flex-col rounded-[6px] border p-[14px_16px]",
    "min-h-[112px] no-underline text-inherit",
    toneCard[tone],
  ].join(" ");

  const content = (
    <>
      {/* Label */}
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        {label}
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

      {/* Delta */}
      {delta && (
        <div
          className={[
            "mt-2 flex items-center gap-1.5 text-[12px] font-semibold",
            delta.up ? "text-ln-op-ok" : "text-ln-op-danger",
          ].join(" ")}
        >
          <span>{delta.up ? "↑" : "↓"}</span>
          <span>{delta.text}</span>
        </div>
      )}

      {/* Sub */}
      {sub && <div className="mt-auto pt-1.5 text-[11px] text-ln-op-mute">{sub}</div>}
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

/**
 * Compact KPI tile (mimics .gob-kpi-sm from the handoff).
 * Smaller value (25px), 9px label, optional hint row.
 */
export function OpKpiSm({
  label,
  value,
  tone = "neutral",
  sub,
  href,
}: Pick<Props, "label" | "value" | "tone" | "sub" | "href">) {
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
