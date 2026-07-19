"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

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
 * Anchor mode: pass `href` (and no `onClick`-only button semantics) to render
 * a next/link `<Link>` instead of a native button element — same classes, same
 * variant/size system. Needed anywhere an LnButton-styled CTA must navigate: a
 * native button element cannot legally nest inside another interactive element
 * and a `<Link>`'s `<a>` cannot legally contain one (WCAG 4.1.2), so a plain
 * `<LnButton>` can't be dropped into link position. Byte-identical look to
 * `<LnButton variant="primary">` — same base/sizes/variants maps.
 *
 * Uses ln-* semantic tokens from globals.css @theme.
 * Safe in components/ui/ (excluded from lint:tokens guard).
 */

export type LnButtonVariant = "primary" | "seal" | "ghost" | "ok" | "warn";
export type LnButtonSize = "sm" | "md" | "lg";

type CommonProps = {
  variant?: LnButtonVariant;
  size?: LnButtonSize;
  block?: boolean;
  className?: string;
  children?: ReactNode;
};

type LnButtonAsButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    loading?: boolean;
    href?: undefined;
  };

type LnButtonAsAnchorProps = CommonProps &
  Omit<ComponentProps<typeof Link>, "className" | "children">;

export type LnButtonProps = LnButtonAsButtonProps | LnButtonAsAnchorProps;

const base =
  "inline-flex items-center justify-center gap-[7px] font-semibold " +
  "rounded-[3px] border transition-colors cursor-pointer select-none " +
  // Pressed feedback (native-mobile audit §3): touch users get an immediate
  // tactile response instead of hover-only styling that never fires on touch.
  "active:scale-[0.98] active:opacity-90 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]";

const sizes: Record<LnButtonSize, string> = {
  sm: "px-[11px] py-1.5 text-sm",
  md: "px-3.5 py-2 text-[12.5px]",
  lg: "px-[18px] py-2.5 text-[13px]",
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

// Shared by both render paths below (button + anchor) — the one place that
// turns variant/size/block/className into the final class string, so the
// two modes can never visually drift apart.
function lnButtonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
}: Pick<CommonProps, "variant" | "size" | "block" | "className">): string {
  return [base, sizes[size], variants[variant], block ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
}

export function LnButton(props: LnButtonProps) {
  if (props.href !== undefined) {
    const { variant, size, block, className, children, href, ...anchorRest } = props;
    // Buttons are never underlined by the browser; an <a> needs the explicit
    // reset so LnButton's anchor mode matches its button mode.
    const anchorClassName = `${lnButtonClasses({ variant, size, block, className })} no-underline`;
    return (
      <Link href={href} className={anchorClassName} {...anchorRest}>
        {children}
      </Link>
    );
  }

  const {
    variant,
    size,
    block,
    className,
    disabled,
    loading = false,
    type = "button",
    children,
    ...buttonRest
  } = props;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={lnButtonClasses({ variant, size, block, className })}
      {...buttonRest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
