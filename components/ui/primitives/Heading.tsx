import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

/**
 * Heading — semantic heading (h1..h4) consuming the --text-* typography ramp.
 *
 * level: 1 | 2 | 3 | 4
 *   h1 → text-2xl (24px), semibold, tracking-tight
 *   h2 → text-xl  (20px), semibold, tracking-tight
 *   h3 → text-lg  (18px), semibold, tracking-tight
 *   h4 → text-md  (14px), semibold, tracking-normal
 *
 * tone: default (inherit) | ink | mute | accent
 *
 * @example
 * <Heading level={1}>Page title</Heading>
 * <Heading level={3} tone="mute">Section label</Heading>
 */

export type HeadingLevel = 1 | 2 | 3 | 4;
export type HeadingTone = "default" | "ink" | "mute" | "accent";

const levelClass: Record<HeadingLevel, string> = {
  1: "text-[var(--text-2xl)] leading-[var(--leading-2xl)] tracking-[var(--tracking-tight)] font-semibold",
  2: "text-[var(--text-xl)] leading-[var(--leading-xl)] tracking-[var(--tracking-tight)] font-semibold",
  3: "text-[var(--text-lg)] leading-[var(--leading-lg)] tracking-[var(--tracking-tight)] font-semibold",
  4: "text-[var(--text-md)] leading-[var(--leading-md)] tracking-[var(--tracking-normal)] font-semibold",
};

const toneClass: Record<HeadingTone, string> = {
  default: "text-[var(--color-ln-ink)]",
  ink: "text-[var(--color-ln-ink)]",
  mute: "text-[var(--color-ln-mute)]",
  accent: "text-[var(--color-ln-azul)]",
};

const tagByLevel: Record<HeadingLevel, "h1" | "h2" | "h3" | "h4"> = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
};

export type HeadingProps = Omit<HTMLAttributes<HTMLHeadingElement>, "level"> & {
  level?: HeadingLevel;
  tone?: HeadingTone;
};

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { level = 2, tone = "default", className = "", children, ...rest },
  ref,
) {
  const Tag = tagByLevel[level];
  return (
    <Tag
      ref={ref}
      className={["m-0", levelClass[level], toneClass[tone], className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </Tag>
  );
});
