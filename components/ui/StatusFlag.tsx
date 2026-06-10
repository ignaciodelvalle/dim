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
      bg: "bg-[#e8f3ec]",
      text: "text-[var(--color-ln-ok)]",
      border: "border-[var(--color-ln-ok-100)]",
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
      bg: "bg-[#fbe9f1]",
      text: "text-[var(--color-ln-rosa)]",
      border: "border-[#f1c8dd]",
    },
  };

export type LnStatusFlagProps = {
  status: LnPetStatus;
  className?: string;
};

export function LnStatusFlag({ status, className = "" }: LnStatusFlagProps) {
  const cfg = flagConfig[status];
  return (
    <span
      className={[
        "inline-flex items-center gap-[5px] rounded-[2px] border px-[7px] py-[2px]",
        "font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.12em]",
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
    bg: "bg-[#fcefed]",
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
        "inline-flex items-center gap-[5px] rounded-[2px] border px-[8px] py-[3px]",
        "font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.08em]",
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

export function LnMemorialChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-[6px] rounded-full border border-[#e0d4b8] bg-[#f0ead9] px-[10px] py-[3px]",
        "font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.1em] text-[#6a5a3f]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      En memoria
    </span>
  );
}
