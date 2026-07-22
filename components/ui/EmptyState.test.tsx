// Smoke tests for <LnEmptyState>.
// Pattern: renderToStaticMarkup.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LnEmptyState } from "./EmptyState";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("<LnEmptyState>", () => {
  it("renders title", () => {
    const html = render(<LnEmptyState title="Sin resultados" />);
    expect(html).toContain("Sin resultados");
  });

  it("renders description when provided", () => {
    const html = render(
      <LnEmptyState title="Sin mascotas" description="Registrá tu primera mascota." />,
    );
    expect(html).toContain("Registrá tu primera mascota.");
  });

  it("does NOT render description element when omitted", () => {
    const html = render(<LnEmptyState title="Vacío" />);
    // Only one <p> — the title
    const pMatches = html.match(/<p[^>]*>/g) ?? [];
    expect(pMatches).toHaveLength(1);
  });

  it("renders action slot when provided", () => {
    const html = render(
      <LnEmptyState title="Nada" action={<button type="button">Crear</button>} />,
    );
    expect(html).toContain("Crear");
    expect(html).toMatch(/<button[^>]*type="button"/);
  });

  it("contains an ln-* token and zero gob-*", () => {
    const html = render(<LnEmptyState title="Vacío" description="Sin datos." />);
    expect(html).toMatch(/--color-ln-/);
    expect(html).not.toMatch(/\bgob-/);
  });

  it("uses ln-ink token for title and ln-mute/ln-faint token for description/icon area", () => {
    const html = render(<LnEmptyState title="Test" description="Desc" />);
    expect(html).toContain("color-ln-ink");
    expect(html).toMatch(/color-ln-mute|color-ln-faint/);
  });
});

// ---------------------------------------------------------------------------
// Epistemic nature (C4, 2026-07-22) — measured-zero vs no-signal
// ---------------------------------------------------------------------------

describe("<LnEmptyState> — epistemic nature", () => {
  it('omitting `nature` keeps today\'s look — no ln-warn tint, no role="status"', () => {
    const html = render(<LnEmptyState title="Sin resultados" />);
    expect(html).not.toMatch(/ln-warn/);
    expect(html).not.toContain('role="status"');
    expect(html).toContain("color-ln-ink");
  });

  it('nature="measured-zero" renders identically to the default (a real, verified zero)', () => {
    const withNature = render(<LnEmptyState title="Sin resultados" nature="measured-zero" />);
    const withoutNature = render(<LnEmptyState title="Sin resultados" />);
    expect(withNature).toBe(withoutNature);
  });

  it('nature="no-signal" renders a muted-warn treatment, never the neutral/ok look', () => {
    const html = render(
      <LnEmptyState
        title="Sin señales registradas en miMAR"
        description="La ausencia de señales no implica ausencia de enfermedad."
        nature="no-signal"
      />,
    );
    expect(html).toMatch(/ln-warn/);
    expect(html).not.toContain("color-ln-ink");
    // Never a success/ok tone — the whole point is "blind", not "all clear".
    expect(html).not.toMatch(/ln-ok\b/);
  });

  it('nature="no-signal" sets role="status" (operator should notice this, not decorative chrome)', () => {
    const html = render(
      <LnEmptyState title="Sin señales registradas en miMAR" nature="no-signal" />,
    );
    expect(html).toContain('role="status"');
  });

  it('nature="no-signal" tints the icon with the warn token, not the default faint token', () => {
    const html = render(<LnEmptyState title="Sin señales" nature="no-signal" icon="eye-off" />);
    expect(html).toContain("text-ln-warn");
    expect(html).not.toContain("color-ln-faint");
  });

  it("the blind-not-calm copy pattern never reads as success/ok", () => {
    const html = render(
      <LnEmptyState
        title="Sin observaciones registradas en miMAR"
        description="La ausencia de observaciones no implica ausencia de casos por escalar."
        nature="no-signal"
      />,
    );
    expect(html).toContain("no implica ausencia de");
    expect(html).not.toMatch(/todo tranquilo|bajo control|sin problemas/i);
  });
});
