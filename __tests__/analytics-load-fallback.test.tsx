// WP4 / D2 — AnalyticsLoadFallback renders an honest degraded state (not a
// skeleton) with a working retry affordance.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";

describe("AnalyticsLoadFallback", () => {
  it("shows a 'tardando' message + retry link on timeout", () => {
    const html = renderToStaticMarkup(
      <AnalyticsLoadFallback reason="timeout" retryHref="/admin/programa?period=90d" />,
    );
    expect(html.toLowerCase()).toContain("tardando");
    expect(html).toContain("Reintentar");
    expect(html).toContain('href="/admin/programa?period=90d"');
  });

  it("shows an error message on error", () => {
    const html = renderToStaticMarkup(
      <AnalyticsLoadFallback reason="error" retryHref="/admin/censo" />,
    );
    expect(html.toLowerCase()).toContain("no pudimos cargar");
    expect(html).toContain("Reintentar");
  });

  it("is a terminal state — no infinite skeleton/spinner", () => {
    const html = renderToStaticMarkup(
      <AnalyticsLoadFallback reason="timeout" retryHref="/admin/poblacion" />,
    );
    expect(html).not.toContain("animate-pulse");
    expect(html).not.toContain("animate-spin");
  });
});
