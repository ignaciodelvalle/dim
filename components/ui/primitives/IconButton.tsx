"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * IconButton — accessible icon-only button.
 *
 * Requirements:
 *   - `aria-label` is REQUIRED (enforced at the type level).
 *   - Minimum 44×44px touch target (WCAG 2.5.5).
 *   - Focus ring via focus-visible.
 *   - Consumes --radius-* and --focus-ring-* tokens.
 *
 * size: sm (32px) | md (44px, default) | lg (48px)
 * variant: ghost | subtle | danger
 *
 * @example
 * <IconButton aria-label="Close dialog" onClick={onClose}>
 *   <XIcon aria-hidden />
 * </IconButton>
 */

export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonVariant = "ghost" | "subtle" | "danger";

// sm is intentionally below 44px for dense operator UIs (e.g. table row actions)
// where the surrounding context provides sufficient tap area.
const sizeClass: Record<IconButtonSize, string> = {
  sm: "h-8 w-8 min-h-[32px] min-w-[32px]",
  md: "h-11 w-11 min-h-[44px] min-w-[44px]",
  lg: "h-12 w-12 min-h-[48px] min-w-[48px]",
};

const variantClass: Record<IconButtonVariant, string> = {
  ghost:
    "bg-transparent text-[var(--color-ln-mute)] border border-transparent " +
    "hover:bg-[var(--color-ln-stripe)] hover:text-[var(--color-ln-ink)]",
  subtle:
    "bg-[var(--color-ln-stripe)] text-[var(--color-ln-ink)] border border-[var(--color-ln-line)] " +
    "hover:bg-[var(--color-ln-line-2)]",
  danger:
    "bg-transparent text-[var(--color-ln-err)] border border-transparent " +
    "hover:bg-[var(--color-ln-err-050)]",
};

const base =
  "inline-grid place-items-center rounded-[var(--radius-sm,4px)] " +
  "transition-colors cursor-pointer select-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "focus-visible:outline-[length:var(--focus-ring-width,3px)] " +
  "focus-visible:outline-[color:var(--focus-ring-color)] " +
  "focus-visible:outline-offset-[var(--focus-ring-offset,2px)]";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /** Required: describes the button action for screen readers. */
  "aria-label": string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "md", variant = "ghost", className = "", type = "button", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[base, sizeClass[size], variantClass[variant], className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
});
