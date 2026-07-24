"use client";

import type { ComponentPropsWithoutRef, ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

// B1 (red-team-admin #14): recharts' ResponsiveContainer measures its parent on
// first paint. Under the app's `ssr: false` dynamic chart wrappers, that first
// measurement can be 0/-1 before layout settles, which paints an empty SVG and
// logs "The width(-1) and height(-1) of chart should be greater than 0".
// Wrapping the container in a concrete-height, full-width box gives it a real
// dimension to measure immediately. This was originally inlined only in
// ForecastChart; extracted here so every chart shares ONE correct pattern
// instead of each re-deriving (or forgetting) the guard.
export function ChartSizingBox({
  height,
  children,
  className,
  ...rest
}: {
  /** Concrete pixel height — also applied as minHeight so the box never collapses. */
  height: number;
  /** A single recharts chart element (ResponsiveContainer's lone child). */
  children: ReactElement;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "children" | "style" | "className">) {
  return (
    <div className={className} style={{ width: "100%", height, minHeight: height }} {...rest}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
