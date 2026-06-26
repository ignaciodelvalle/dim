import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

/**
 * Inline — horizontal flex container with token-driven gap and optional wrapping.
 *
 * gap values map to Tailwind spacing scale:
 *   none → gap-0   xs → gap-1   sm → gap-2   md → gap-4   lg → gap-6   xl → gap-8
 *
 * align controls cross-axis alignment (items-*):
 *   start | center | end | baseline | stretch
 *
 * @example
 * <Inline gap="sm" align="center">
 *   <Icon />
 *   <Text>Label</Text>
 * </Inline>
 */

export type InlineGap = "none" | "xs" | "sm" | "md" | "lg" | "xl";
export type InlineAlign = "start" | "center" | "end" | "baseline" | "stretch";

const gapClass: Record<InlineGap, string> = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

const alignClass: Record<InlineAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  baseline: "items-baseline",
  stretch: "items-stretch",
};

export type InlineProps = HTMLAttributes<HTMLDivElement> & {
  gap?: InlineGap;
  align?: InlineAlign;
  wrap?: boolean;
};

export const Inline = forwardRef<HTMLDivElement, InlineProps>(function Inline(
  { gap = "sm", align = "center", wrap = false, className = "", children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[
        "flex flex-row",
        gapClass[gap],
        alignClass[align],
        wrap ? "flex-wrap" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
