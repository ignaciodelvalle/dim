import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

/**
 * CardFrame — bare card shell: border + radius + background token.
 *
 * This is the structural primitive without operator-specific chrome
 * (no title bar, no action slots, no accent borders). Compose with
 * other primitives (Stack, Inline, Heading, Text) or slot your own
 * header/body/footer.
 *
 * surface: citizen (ln-card bg + ln-line border, default) | operator (ln-op-card + ln-op-line)
 * shadow:  none | sm | md | lg
 *
 * @example
 * // Citizen surface:
 * <CardFrame>
 *   <Stack gap="sm" className="p-4">…</Stack>
 * </CardFrame>
 *
 * // Operator surface with shadow:
 * <CardFrame surface="operator" shadow="sm">
 *   …
 * </CardFrame>
 */

export type CardFrameSurface = "citizen" | "operator";
export type CardFrameShadow = "none" | "sm" | "md" | "lg";

const surfaceClass: Record<CardFrameSurface, string> = {
  citizen: "bg-[var(--color-ln-card)] border border-[var(--color-ln-line)]",
  operator: "bg-[var(--color-ln-op-card)] border border-[var(--color-ln-op-line)]",
};

const shadowClass: Record<CardFrameShadow, string> = {
  none: "",
  sm: "shadow-[var(--shadow-sm)]",
  md: "shadow-[var(--shadow-md)]",
  lg: "shadow-[var(--shadow-lg)]",
};

export type CardFrameProps = HTMLAttributes<HTMLDivElement> & {
  surface?: CardFrameSurface;
  shadow?: CardFrameShadow;
};

export const CardFrame = forwardRef<HTMLDivElement, CardFrameProps>(function CardFrame(
  { surface = "citizen", shadow = "none", className = "", children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[
        "overflow-hidden rounded-[var(--radius-card,16px)]",
        surfaceClass[surface],
        shadowClass[shadow],
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
