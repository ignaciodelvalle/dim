"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Libreta Nacional Button.
 *
 * Variants:
 *  - primary  → azul institucional (#0e5a99), white text
 *  - seal     → rojo sello (#a23a2c) — danger/emergency actions
 *  - ghost    → outline, card bg — secondary/cancel
 *  - ok       → verde (#2e7d4f) — confirm/positive action
 *  - warn     → ámbar (#b0771a) — cautionary CTA (e.g. marcar perdida)
 *
 * Sizes: sm | md | lg
 * Modifiers: block (full-width), uppercase
 *
 * Uses ln-* semantic tokens from globals.css @theme.
 * Safe in components/ui/ (excluded from lint:tokens guard).
 */

export type LnButtonVariant = "primary" | "seal" | "ghost" | "ok" | "warn";
export type LnButtonSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: LnButtonVariant;
  size?: LnButtonSize;
  block?: boolean;
  loading?: boolean;
  children?: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-[7px] font-semibold " +
  "rounded-[3px] border transition-colors cursor-pointer select-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]";

const sizes: Record<LnButtonSize, string> = {
  sm: "px-[11px] py-[6px] text-sm",
  md: "px-[14px] py-[8px] text-[12.5px]",
  lg: "px-[18px] py-[10px] text-[13px]",
};

const variants: Record<LnButtonVariant, string> = {
  primary:
    "bg-[var(--color-ln-azul)] text-white border-[var(--color-ln-azul)] " +
    "hover:bg-[var(--color-ln-azul-700)] hover:border-[var(--color-ln-azul-700)]",
  seal: "bg-[var(--color-ln-seal)] text-white border-[var(--color-ln-seal)] " + "hover:opacity-90",
  ghost:
    "bg-[var(--color-ln-card)] text-[var(--color-ln-ink)] border-[var(--color-ln-line-strong)] " +
    "hover:bg-[var(--color-ln-stripe)]",
  ok: "bg-[var(--color-ln-ok)] text-white border-[var(--color-ln-ok)] " + "hover:opacity-90",
  warn: "bg-[var(--color-ln-warn)] text-white border-[var(--color-ln-warn)] " + "hover:opacity-90",
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function LnButton({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  className = "",
  disabled,
  type = "button",
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[base, sizes[size], variants[variant], block ? "w-full" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
