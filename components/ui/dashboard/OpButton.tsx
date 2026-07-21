"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Operator-tier (op) button primitive.
 *
 * Mirrors the LnButton API (Button.tsx in components/ui/) but uses op-skin
 * tokens (ln-op-*) and the operator button radius (--radius-op-btn: 6px).
 *
 * Variants:
 *   primary — bg-ln-op-azul, white text — PRIMARY action (form submit, CTA)
 *   ghost   — outline on card bg — secondary / cancel
 *   danger  — bg-ln-op-danger, white text — destructive action
 *   ok      — bg-ln-op-ok, white text — EXPLICIT positive confirmation only
 *             (e.g. "Confirmar alta", NOT a generic primary)
 *
 * Sizes: sm | md | lg
 * Modifiers: block (full-width), loading (disabled + spinner)
 *
 * Decision: primary action = BLUE (ln-op-azul). Green (ok) is reserved for
 * explicit positive-confirmation flows only. This resolves the green/blue
 * inconsistency between OpSubmitButton (was green) and OpBulkBar (blue).
 *
 * Uses --radius-op-btn (6px) defined in app/globals.css @theme.
 * Safe in components/ui/dashboard/ — excluded from lint:tokens guard.
 */

export type OpButtonVariant = "primary" | "ghost" | "danger" | "ok";
export type OpButtonSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: OpButtonVariant;
  size?: OpButtonSize;
  block?: boolean;
  loading?: boolean;
  children?: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-[7px] font-semibold " +
  "rounded-[var(--radius-op-btn,6px)] border transition-colors cursor-pointer select-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-op-celeste-050)]";

const sizes: Record<OpButtonSize, string> = {
  sm: "px-[11px] py-1.5 text-sm",
  md: "px-3.5 py-2 text-[var(--text-md)]",
  lg: "px-[18px] py-2.5 text-[var(--text-md)]",
};

const variants: Record<OpButtonVariant, string> = {
  primary:
    "bg-[var(--color-ln-op-azul)] text-white border-[var(--color-ln-op-azul)] " +
    "hover:bg-[var(--color-ln-op-azul-700)] hover:border-[var(--color-ln-op-azul-700)]",
  ghost:
    "bg-[var(--color-ln-op-card)] text-[var(--color-ln-op-ink)] border-[var(--color-ln-op-line)] " +
    "hover:bg-[var(--color-ln-op-stripe)]",
  danger:
    "bg-[var(--color-ln-op-danger)] text-white border-[var(--color-ln-op-danger)] " +
    "hover:opacity-90",
  ok: "bg-[var(--color-ln-op-ok)] text-white border-[var(--color-ln-op-ok)] hover:opacity-90",
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function OpButton({
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
