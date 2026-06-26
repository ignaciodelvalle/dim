import type { HTMLAttributes, ReactNode } from "react";

/**
 * Text — inline/block text primitive consuming --text-* + --leading-* + --tracking-* tokens.
 *
 * size:   xs | sm | md | base | lg | xl | 2xl  — maps to --text-* scale
 * tone:   default (inherit) | mute | ink | faint | ok | warn | err | accent
 * weight: normal | medium | semibold | bold
 * as:     HTML element to render as (default: "span")
 *
 * Note: `label` is intentionally excluded from `as` — biome enforces that
 * <label> must be associated with a control (htmlFor / nesting). Use a
 * native <label> element when you need that association.
 *
 * Note: forwardRef is omitted for the polymorphic `as` prop — the ref type
 * depends on the resolved element, which TypeScript cannot statically verify
 * across the union without a cast. Callers that need a ref should use a native
 * element wrapper instead.
 *
 * @example
 * <Text size="sm" tone="mute">Secondary label</Text>
 * <Text size="base" weight="semibold">Body emphasis</Text>
 */

export type TextSize = "xs" | "sm" | "md" | "base" | "lg" | "xl" | "2xl";
export type TextTone = "default" | "mute" | "ink" | "faint" | "ok" | "warn" | "err" | "accent";
export type TextWeight = "normal" | "medium" | "semibold" | "bold";

const sizeClass: Record<TextSize, string> = {
  xs: "text-[var(--text-xs)] leading-[var(--leading-xs)] tracking-[var(--tracking-wide)]",
  sm: "text-[var(--text-sm)] leading-[var(--leading-sm)] tracking-[var(--tracking-normal)]",
  md: "text-[var(--text-md)] leading-[var(--leading-md)] tracking-[var(--tracking-normal)]",
  base: "text-[var(--text-base)] leading-[var(--leading-base)] tracking-[var(--tracking-normal)]",
  lg: "text-[var(--text-lg)] leading-[var(--leading-lg)] tracking-[var(--tracking-tight)]",
  xl: "text-[var(--text-xl)] leading-[var(--leading-xl)] tracking-[var(--tracking-tight)]",
  "2xl": "text-[var(--text-2xl)] leading-[var(--leading-2xl)] tracking-[var(--tracking-tight)]",
};

const toneClass: Record<TextTone, string> = {
  default: "",
  ink: "text-[var(--color-ln-ink)]",
  mute: "text-[var(--color-ln-mute)]",
  faint: "text-[var(--color-ln-faint)]",
  ok: "text-[var(--color-st-ok)]",
  warn: "text-[var(--color-st-warn)]",
  err: "text-[var(--color-st-err)]",
  accent: "text-[var(--color-ln-azul)]",
};

const weightClass: Record<TextWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

type AllowedTag = "span" | "p" | "div" | "strong" | "em" | "small" | "time" | "abbr";

export type TextProps = HTMLAttributes<HTMLElement> & {
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  as?: AllowedTag;
  children?: ReactNode;
};

export function Text({
  size = "base",
  tone = "default",
  weight = "normal",
  as: Tag = "span",
  className = "",
  children,
  ...rest
}: TextProps) {
  const classes = [sizeClass[size], toneClass[tone], weightClass[weight], className]
    .filter(Boolean)
    .join(" ");

  if (Tag === "span") {
    return (
      <span className={classes} {...(rest as HTMLAttributes<HTMLSpanElement>)}>
        {children}
      </span>
    );
  }
  if (Tag === "p") {
    return (
      <p className={classes} {...(rest as HTMLAttributes<HTMLParagraphElement>)}>
        {children}
      </p>
    );
  }
  if (Tag === "div") {
    return (
      <div className={classes} {...(rest as HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }
  if (Tag === "strong") {
    return (
      <strong className={classes} {...(rest as HTMLAttributes<HTMLElement>)}>
        {children}
      </strong>
    );
  }
  if (Tag === "em") {
    return (
      <em className={classes} {...(rest as HTMLAttributes<HTMLElement>)}>
        {children}
      </em>
    );
  }
  if (Tag === "small") {
    return (
      <small className={classes} {...(rest as HTMLAttributes<HTMLElement>)}>
        {children}
      </small>
    );
  }
  if (Tag === "time") {
    return (
      <time className={classes} {...(rest as HTMLAttributes<HTMLTimeElement>)}>
        {children}
      </time>
    );
  }
  // abbr
  return (
    <abbr className={classes} {...(rest as HTMLAttributes<HTMLElement>)}>
      {children}
    </abbr>
  );
}
