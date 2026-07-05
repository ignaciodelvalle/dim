import type { ReactNode } from "react";

import { Icon } from "@/components/Icon";
import { LIST_STATUS_SITUATION_ICON } from "@/lib/ui/pet-situation";
import type { LnPetStatus } from "./Chip";

/**
 * Libreta Nacional Status Flag + Vstamp.
 *
 * LnStatusFlag — pet status chip: AL DÍA / EN TRATAMIENTO / PERDIDO / PREÑADA
 * LnVstamp     — vaccination status stamp: Vigente / Por vencer / Vencida
 */

// ---------- Status Flag ---------------------------------------------------

const flagConfig: Record<LnPetStatus, { label: string; bg: string; text: string; border: string }> =
  {
    ok: {
      label: "AL DÍA",
      bg: "bg-[var(--color-ln-ok-bg)]",
      text: "text-[var(--color-ln-ok)]",
      border: "border-[var(--color-ln-ok-100)]",
    },
    registered: {
      label: "REGISTRADA",
      bg: "bg-[var(--color-ln-card)]",
      text: "text-[var(--color-ln-ink-2)]",
      border: "border-[var(--color-ln-line-strong)]",
    },
    sick: {
      label: "EN TRATAMIENTO",
      bg: "bg-[var(--color-ln-warn-050)]",
      text: "text-[var(--color-ln-warn)]",
      border: "border-[var(--color-ln-warn-100)]",
    },
    lost: {
      label: "PERDIDO",
      bg: "bg-[var(--color-ln-err-050)]",
      text: "text-[var(--color-ln-err)]",
      border: "border-[var(--color-ln-err-100)]",
    },
    pregnant: {
      label: "PREÑADA",
      bg: "bg-[var(--color-ln-rosa-bg)]",
      text: "text-[var(--color-ln-rosa)]",
      border: "border-[var(--color-ln-rosa-bd)]",
    },
  };

export type LnStatusFlagProps = {
  status: LnPetStatus;
  className?: string;
};

export function LnStatusFlag({ status, className = "" }: LnStatusFlagProps) {
  const cfg = flagConfig[status];
  // Situation icon — the shape-based signal that pairs with the tone + label so
  // the flag never relies on color alone (WCAG). Shared with the credential
  // skin via lib/ui/pet-situation, so a lost pet reads the SAME siren on the
  // list row and on its credential. `registered` is the quiet passive base — no
  // situation, no icon.
  const iconName = LIST_STATUS_SITUATION_ICON[status];
  return (
    <span
      className={[
        "inline-flex items-center gap-[5px] rounded-[var(--radius-xs)] border px-[7px] py-0.5",
        "font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.12em]",
        cfg.bg,
        cfg.text,
        cfg.border,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {iconName && <Icon name={iconName} size={11} decorative />}
      {cfg.label}
    </span>
  );
}

// ---------- Vstamp --------------------------------------------------------

export type LnVstampVariant = "ok" | "due" | "over";

const vstampConfig: Record<
  LnVstampVariant,
  { label: string; bg: string; text: string; border: string }
> = {
  ok: {
    label: "VIGENTE",
    bg: "bg-[var(--color-ln-ok-050)]",
    text: "text-[var(--color-ln-ok)]",
    border: "border-[var(--color-ln-ok-100)]",
  },
  due: {
    label: "POR VENCER",
    bg: "bg-[var(--color-ln-warn-025)]",
    text: "text-[var(--color-ln-warn)]",
    border: "border-[var(--color-ln-warn-100)]",
  },
  over: {
    label: "VENCIDA",
    bg: "bg-[var(--color-ln-err-bg)]",
    text: "text-[var(--color-ln-err)]",
    border: "border-[var(--color-ln-err-100)]",
  },
};

export type LnVstampProps = {
  variant: LnVstampVariant;
  className?: string;
};

export function LnVstamp({ variant, className = "" }: LnVstampProps) {
  const cfg = vstampConfig[variant];
  return (
    <span
      className={[
        "inline-flex items-center gap-[5px] rounded-[var(--radius-xs)] border px-2 py-[3px]",
        "font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.08em]",
        cfg.bg,
        cfg.text,
        cfg.border,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {cfg.label}
    </span>
  );
}

// ---------- Memorial chip -------------------------------------------------
// Used in the deceased profile sub-bar

export function LnMemorialChip({
  className = "",
  children,
}: {
  className?: string;
  /** Overrides the default "En memoria" label — e.g. to append a birth–death year range. */
  children?: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ln-memorial-chip-bd)] bg-[var(--color-ln-memorial-chip-bg)] px-2.5 py-[3px]",
        "font-[var(--font-ln-mono)] text-xs uppercase tracking-[.1em] text-[var(--color-ln-memorial-chip-text)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children ?? "En memoria"}
    </span>
  );
}
