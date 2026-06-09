import { Icon, type IconName } from "@/components/Icon";
import type { ReactNode } from "react";

/**
 * LnBadge — read-only semantic pill for the Libreta Nacional design system.
 *
 * Styled with LN tokens (no gob-* classes).
 *
 * Variants:
 *  - info     → azul tenue / text-azul
 *  - success  → verde tenue / text-ok
 *  - warning  → ámbar tenue / text-warn
 *  - danger   → rojo tenue / text-err
 *  - neutral  → stripe bg / text-mute
 *
 * Accessibility:
 *  - When rendered icon-only (no children), `aria-label` is required.
 *  - The icon is decorative; semantic context comes from the variant + label.
 */

type BadgeVariant = "info" | "success" | "warning" | "danger" | "neutral";

export type LnBadgeProps = {
  variant?: BadgeVariant;
  icon?: IconName;
  children?: ReactNode;
  "aria-label"?: string;
  className?: string;
};

// Base: pill geometry, mono font, small uppercase — modelled on LnStatusFlag/LnVstamp
const base =
  "inline-flex items-center gap-[5px] rounded-[2px] border " +
  "px-[7px] py-[2px] font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.08em]";

// Soft bg + colored text + tinted border — same pattern as StatusFlag
const variantClasses: Record<BadgeVariant, string> = {
  info: "bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)] border-[var(--color-ln-celeste-100)]",
  success: "bg-[#eef6f0] text-[var(--color-ln-ok)] border-[#c8e2d2]",
  warning: "bg-[#fdf2e0] text-[var(--color-ln-warn)] border-[#f0dcb4]",
  danger: "bg-[#fbe9e6] text-[var(--color-ln-err)] border-[#f1c6bf]",
  neutral:
    "bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)] border-[var(--color-ln-line-strong)]",
};

export function LnBadge({
  variant = "neutral",
  icon,
  children,
  "aria-label": ariaLabel,
  className = "",
}: LnBadgeProps) {
  if (process.env.NODE_ENV !== "production" && !children && !ariaLabel) {
    console.warn("<LnBadge>: icon-only badge requires aria-label");
  }

  return (
    <span
      className={[base, variantClasses[variant], className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
    >
      {icon && <Icon name={icon} size="0.9em" decorative />}
      {children}
    </span>
  );
}
