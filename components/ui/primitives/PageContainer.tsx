import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

/**
 * PageContainer — standard max-width + horizontal padding page wrapper.
 *
 * Provides a consistent content column across the application.
 * Does not impose vertical spacing — compose with Stack for that.
 *
 * maxWidth: sm (640px) | md (768px) | lg (1024px, default) | xl (1280px) | full
 *
 * @example
 * <PageContainer>
 *   <Stack gap="lg">…</Stack>
 * </PageContainer>
 */

export type PageContainerWidth = "sm" | "md" | "lg" | "xl" | "full";

const maxWidthClass: Record<PageContainerWidth, string> = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-7xl",
  full: "max-w-full",
};

export type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  maxWidth?: PageContainerWidth;
};

export const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(function PageContainer(
  { maxWidth = "lg", className = "", children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={["mx-auto w-full px-4", maxWidthClass[maxWidth], className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
