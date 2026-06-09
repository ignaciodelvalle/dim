import type { ReactNode } from "react";

type Tone = "open" | "triaged" | "escalated" | "danger" | "progress" | "closed" | "ok" | "neutral";

type Props = {
  tone: Tone;
  children: ReactNode;
};

// Mirrors .gob-pill[data-tone="..."] from the handoff.
// escalated and danger share the same visual treatment.
// closed and ok share the same visual treatment.
const toneClasses: Record<Tone, string> = {
  open: "bg-ln-op-warn-bg text-ln-op-warn border-ln-op-warn-bd",
  triaged: "bg-ln-op-blue-bg text-ln-op-azul border-ln-op-blue-bd",
  escalated: "bg-ln-op-danger-bg text-ln-op-danger border-ln-op-danger-bd",
  danger: "bg-ln-op-danger-bg text-ln-op-danger border-ln-op-danger-bd",
  progress: "bg-ln-op-viol-bg text-ln-op-viol border-ln-op-viol-bd",
  closed: "bg-ln-op-ok-bg text-ln-op-ok border-ln-op-ok-bd",
  ok: "bg-ln-op-ok-bg text-ln-op-ok border-ln-op-ok-bd",
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
