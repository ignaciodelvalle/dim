import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

/**
 * Stack — vertical flex container with token-driven gap.
 *
 * gap values map to Tailwind spacing scale:
 *   none → gap-0   xs → gap-1   sm → gap-2   md → gap-4   lg → gap-6   xl → gap-8
 *
 * @example
 * <Stack gap="md">
 *   <Text>First</Text>
 *   <Text>Second</Text>
 * </Stack>
 */

export type StackGap = "none" | "xs" | "sm" | "md" | "lg" | "xl";

const gapClass: Record<StackGap, string> = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

export type StackProps = HTMLAttributes<HTMLDivElement> & {
  gap?: StackGap;
};

export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { gap = "md", className = "", children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={["flex flex-col", gapClass[gap], className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
