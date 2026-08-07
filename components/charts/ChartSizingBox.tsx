"use client";

import {
  type ComponentPropsWithoutRef,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { ResponsiveContainer } from "recharts";

// B1 (red-team-admin #14/#15, completed in red-team-admin-2 P2.8): recharts'
// ResponsiveContainer measures its parent on first paint. Under the app's
// `ssr: false` dynamic chart wrappers, that first measurement is 0/-1 before
// layout settles, which logs "The width(-1) and height(-1) of chart should be
// greater than 0" and paints an empty SVG.
//
// A concrete inline HEIGHT alone (the first version of this box) silenced
// height(-1) but NOT width(-1): `width: "100%"` resolves against a parent that
// is itself 0-wide at that instant. The robust fix is to GATE the
// ResponsiveContainer — mount it only once the box has actually measured a
// non-zero width (synchronously on mount, then via ResizeObserver). Recharts
// therefore never sees a 0/-1 dimension. The box keeps its height throughout,
// so gating causes no layout shift.
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
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setReady(true);
    };
    measure();
    // ResizeObserver is not globally present in the test env (jsdom); guard so
    // rendering this box in a unit test never throws. The synchronous measure
    // above already covers the common (already-laid-out) case.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: "100%", height, minHeight: height }}
      {...rest}
    >
      {ready && (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}
