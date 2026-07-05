"use client";

// Recharts-bearing sparkline extracted from OpKpi.tsx (bundle-size #22).
//
// WHY a separate file: OpKpi is imported directly by ~29 route/component
// files across /gob, /admin, and /org — including first-paint dashboards
// like app/gob/page.tsx. When the sparkline's `recharts` import lived at the
// top of OpKpi.tsx, every one of those call sites paid for recharts in its
// first-load JS even when `sparkline` was never passed. OpKpi.tsx now
// dynamic-imports this module (next/dynamic, ssr:false) so recharts is only
// fetched on the client, and only for tiles that actually render a sparkline.
//
// Decorative only (aria-hidden in the parent) — safe to defer without
// affecting SSR content or accessibility.

import { Area, AreaChart, ResponsiveContainer } from "recharts";

type Tone = "neutral" | "danger" | "warn" | "ok" | "blue";

export function OpKpiSparkline({ values, tone }: { values: number[]; tone: Tone }) {
  if (values.length < 2) return null;

  const strokeColor =
    tone === "ok"
      ? "#31a354"
      : tone === "danger"
        ? "#cb181d"
        : tone === "warn"
          ? "#e6550d"
          : tone === "blue"
            ? "#2171b5"
            : "#6b7280";

  const chartData = values.map((v, i) => ({ i, v }));

  return (
    <div className="mt-2 h-8 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height={32}>
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparkFill-${tone}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill={`url(#sparkFill-${tone})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
