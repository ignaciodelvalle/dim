/**
 * A11y tests for OpStateBadge and OpKpi delta arrows (Wave 2 Item 11).
 *
 * Verifies:
 * - OpStateBadge: icon is aria-hidden; text label is present (not color-only).
 * - OpKpi delta: arrow is aria-hidden; sr-only direction text is rendered.
 *
 * Pattern: react-dom/server renderToStaticMarkup (repo convention — no jsdom).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OpKpi } from "@/components/ui/dashboard/OpKpi";
import { OpStateBadge } from "@/components/ui/dashboard/OpStateBadge";

describe("OpStateBadge — color not the sole means of conveying state (WCAG 1.4.1)", () => {
  const cases = [
    { state: "published" as const, expectedLabel: "Publicado" },
    { state: "paused" as const, expectedLabel: "Pausado" },
    { state: "draft" as const, expectedLabel: "Borrador" },
    { state: "adopted" as const, expectedLabel: "Adoptado" },
  ];

  for (const { state, expectedLabel } of cases) {
    it(`state="${state}" renders human-readable label "${expectedLabel}" (not the raw key)`, () => {
      const html = renderToStaticMarkup(<OpStateBadge state={state} />);
      // Human-readable label must be present.
      expect(html).toContain(expectedLabel);
      // Raw state key must NOT be the rendered text (it's mapped to the label).
      expect(html).not.toContain(`>${state}<`);
    });

    it(`state="${state}" renders an icon that is aria-hidden`, () => {
      const html = renderToStaticMarkup(<OpStateBadge state={state} />);
      expect(html).toContain('aria-hidden="true"');
    });
  }

  it("renders a custom label override when provided", () => {
    const html = renderToStaticMarkup(<OpStateBadge state="published" label="Activo" />);
    expect(html).toContain("Activo");
  });
});

describe("OpKpi delta — direction conveyed by text, not arrow alone (WCAG 1.4.1)", () => {
  it("renders aria-hidden on the ↑ arrow for an upward delta", () => {
    const html = renderToStaticMarkup(
      <OpKpi label="Total" value={42} delta={{ text: "+5%", up: true }} />,
    );
    // Arrow must be inside an aria-hidden span.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("↑");
  });

  it("renders sr-only 'Sube:' text for an upward delta", () => {
    const html = renderToStaticMarkup(
      <OpKpi label="Total" value={42} delta={{ text: "+5%", up: true }} />,
    );
    expect(html).toContain("sr-only");
    expect(html).toContain("Sube:");
  });

  it("renders aria-hidden on the ↓ arrow for a downward delta", () => {
    const html = renderToStaticMarkup(
      <OpKpi label="Total" value={42} delta={{ text: "-3%", up: false }} />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("↓");
  });

  it("renders sr-only 'Baja:' text for a downward delta", () => {
    const html = renderToStaticMarkup(
      <OpKpi label="Total" value={42} delta={{ text: "-3%", up: false }} />,
    );
    expect(html).toContain("sr-only");
    expect(html).toContain("Baja:");
  });

  it("does not render delta section when delta prop is omitted", () => {
    const html = renderToStaticMarkup(<OpKpi label="Total" value={42} />);
    // sr-only class should not appear when there is no delta.
    expect(html).not.toContain("sr-only");
  });
});
