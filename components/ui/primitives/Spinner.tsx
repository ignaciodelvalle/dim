import type { HTMLAttributes } from "react";

/**
 * Spinner — standardized loading indicator.
 *
 * Consolidates the duplicated inline spinner pattern found in Button.tsx and
 * OpButton.tsx into a single, token-consuming primitive.
 *
 * size:  xs (12px) | sm (16px, default) | md (20px) | lg (24px)
 * tone:  current (inherits color, default) | ink | mute | accent | white
 *
 * Renders `aria-hidden="true"` by default. When used as a standalone loading
 * indicator (not inside a button), pair with a visually-hidden SR text:
 *   <Spinner aria-hidden={undefined} aria-label="Cargando…" />
 * or wrap in an `<output aria-busy="true">`.
 *
 * @example
 * // Inside a button (paired with aria-busy on the button):
 * <Spinner size="sm" />
 *
 * // Standalone page spinner:
 * <output aria-busy="true">
 *   <Spinner size="lg" tone="accent" aria-hidden={undefined} aria-label="Cargando…" />
 * </output>
 */

export type SpinnerSize = "xs" | "sm" | "md" | "lg";
export type SpinnerTone = "current" | "ink" | "mute" | "accent" | "white";

const sizeClass: Record<SpinnerSize, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

const toneClass: Record<SpinnerTone, string> = {
  current: "text-current",
  ink: "text-[var(--color-ln-ink)]",
  mute: "text-[var(--color-ln-mute)]",
  accent: "text-[var(--color-ln-azul)]",
  white: "text-white",
};

export type SpinnerProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  "aria-hidden"?: boolean | "true" | "false";
};

export function Spinner({
  size = "sm",
  tone = "current",
  className = "",
  "aria-hidden": ariaHidden = true,
  ...rest
}: SpinnerProps) {
  return (
    <span
      aria-hidden={ariaHidden}
      className={[
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        sizeClass[size],
        toneClass[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
