// Tests for <PetActionRow> — icon-only action bar (pet-document-redesign
// ADR-12b/ADR-17b, Phase 4). Pattern: react-dom/server renderToStaticMarkup
// (repo convention — no jsdom).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PetActionRow } from "./PetActionRow";

describe("<PetActionRow> — icon-only, no visible link text (ADR-12b)", () => {
  it("owner + active pet: renders all 5 icons with aria-label, no visible label text", () => {
    const html = renderToStaticMarkup(
      <PetActionRow petPublicToken="abc" isOwner isDeceased={false} petStatus="active" />,
    );
    for (const label of ["Anotar", "Compartir", "Marcar como perdida", "Chapita", "Más"]) {
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain(`title="${label}"`);
    }
    // No visible text nodes for the labels — only aria-label/title attrs.
    expect(html).not.toMatch(/>Anotar</);
    expect(html).not.toMatch(/>Compartir</);
    expect(html).not.toMatch(/>Marcar como perdida</);
    expect(html).not.toMatch(/>Chapita</);
    expect(html).not.toMatch(/>Más</);
  });

  it("every icon link carries min-h-11 and min-w-11 (44px touch target, UX 2.1)", () => {
    const html = renderToStaticMarkup(
      <PetActionRow petPublicToken="abc" isOwner isDeceased={false} petStatus="active" />,
    );
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBe(5);
    for (const anchor of anchors) {
      expect(anchor).toContain("min-h-11");
      expect(anchor).toContain("min-w-11");
    }
  });

  it("lost pet: Marcar como perdida is replaced by Marcar encontrada", () => {
    const html = renderToStaticMarkup(
      <PetActionRow petPublicToken="abc" isOwner isDeceased={false} petStatus="lost" />,
    );
    expect(html).toContain('aria-label="Marcar encontrada"');
    expect(html).not.toContain('aria-label="Marcar como perdida"');
  });

  it("deceased pet: collapses to [Compartir][Más] only (ADR-15/REQ-9.3)", () => {
    const html = renderToStaticMarkup(
      <PetActionRow petPublicToken="abc" isOwner isDeceased={true} petStatus="deceased" />,
    );
    expect(html).toContain('aria-label="Compartir"');
    expect(html).toContain('aria-label="Más"');
    expect(html).not.toContain('aria-label="Anotar"');
    expect(html).not.toContain('aria-label="Chapita"');
    expect(html).not.toContain('aria-label="Marcar');
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBe(2);
  });

  it("org viewer (isOwner=false): only Compartir renders, no owner-only affordances", () => {
    const html = renderToStaticMarkup(
      <PetActionRow petPublicToken="abc" isOwner={false} isDeceased={false} petStatus="active" />,
    );
    expect(html).toContain('aria-label="Compartir"');
    expect(html).not.toContain('aria-label="Anotar"');
    expect(html).not.toContain('aria-label="Chapita"');
    expect(html).not.toContain('aria-label="Más"');
  });
});
