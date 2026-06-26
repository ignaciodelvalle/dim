import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

/**
 * Box — a styled div with optional padding, border-radius, and shadow props
 * that consume design tokens from globals.css @theme.
 *
 * padding: none | xs | sm | md | lg | xl  (maps to Tailwind spacing scale)
 * radius:  none | xs | sm | md | lg | card | pill  (maps to --radius-* tokens)
 * shadow:  none | sm | md | lg  (maps to --shadow-* tokens)
 *
 * @example
 * <Box padding="md" radius="card" shadow="sm">
 *   content
 * </Box>
 */

export type BoxPadding = "none" | "xs" | "sm" | "md" | "lg" | "xl";
export type BoxRadius = "none" | "xs" | "sm" | "md" | "lg" | "card" | "pill";
export type BoxShadow = "none" | "sm" | "md" | "lg";

const paddingClass: Record<BoxPadding, string> = {
  none: "",
  xs: "p-1",
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
  xl: "p-8",
};

const radiusClass: Record<BoxRadius, string> = {
  none: "",
  xs: "rounded-[var(--radius-xs,2px)]",
  sm: "rounded-[var(--radius-sm,4px)]",
  md: "rounded-[var(--radius-md,6px)]",
  lg: "rounded-[var(--radius-lg,8px)]",
  card: "rounded-[var(--radius-card,16px)]",
  pill: "rounded-[var(--radius-pill,9999px)]",
};

const shadowClass: Record<BoxShadow, string> = {
  none: "",
  sm: "shadow-[var(--shadow-sm)]",
  md: "shadow-[var(--shadow-md)]",
  lg: "shadow-[var(--shadow-lg)]",
};

export type BoxProps = HTMLAttributes<HTMLDivElement> & {
  padding?: BoxPadding;
  radius?: BoxRadius;
  shadow?: BoxShadow;
};

export const Box = forwardRef<HTMLDivElement, BoxProps>(function Box(
  { padding = "none", radius = "none", shadow = "none", className = "", children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[paddingClass[padding], radiusClass[radius], shadowClass[shadow], className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
