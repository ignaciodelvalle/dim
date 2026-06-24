import type { ReactNode } from "react";

type Tone = "open" | "triaged" | "escalated" | "danger" | "progress" | "closed" | "ok" | "neutral";

type Props = {
  tone: Tone;
  children: ReactNode;
};

// Mirrors .gob-pill[data-tone="..."] from the handoff.
// escalated and danger share the same visual treatment.
// closed and ok share the same visual treatment.
// Status tones use st-* tokens — resolved to ln-op-* values via .op-surface
// cascade (zero visual diff; see globals.css .op-surface block).
const toneClasses: Record<Tone, string> = {
  open: "bg-[var(--color-st-warn-bg)] text-[var(--color-st-warn)] border-[var(--color-st-warn-bd)]",
  triaged: "bg-ln-op-blue-bg text-ln-op-azul border-ln-op-blue-bd",
  escalated:
    "bg-[var(--color-st-err-bg)] text-[var(--color-st-err)] border-[var(--color-st-err-bd)]",
  danger: "bg-[var(--color-st-err-bg)] text-[var(--color-st-err)] border-[var(--color-st-err-bd)]",
  progress:
    "bg-[var(--color-st-info-bg)] text-[var(--color-st-info)] border-[var(--color-st-info-bd)]",
  closed: "bg-[var(--color-st-ok-bg)] text-[var(--color-st-ok)] border-[var(--color-st-ok-bd)]",
  ok: "bg-[var(--color-st-ok-bg)] text-[var(--color-st-ok)] border-[var(--color-st-ok-bd)]",
  neutral: "bg-ln-op-stripe text-ln-op-mute border-ln-op-line",
};

/**
 * Status pill for case / event states.
 * Mimics .gob-pill from the handoff.
 */
export function OpPill({ tone, children }: Props) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border",
        "px-2 py-0.5",
        "text-[9.5px] font-bold uppercase tracking-[0.05em]",
        toneClasses[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
