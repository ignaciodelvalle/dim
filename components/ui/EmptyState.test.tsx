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
