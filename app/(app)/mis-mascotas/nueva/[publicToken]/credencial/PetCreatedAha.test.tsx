// Structural tests for PetCreatedAha.
//
// Uses renderToStaticMarkup (SSR snapshot) so the "use client" component is
// rendered without browser APIs. Effects (focus, share state) are not tested
// here; they require a full DOM environment and are covered by manual QA.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PetCreatedAha } from "./PetCreatedAha";

const SAMPLE_SVG = '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>';

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

const defaultProps = {
  petName: "Luna",
  publicToken: "abc-123-def",
  credentialUrl: "https://mimar.ar/p/abc-123-def",
  qrSvg: SAMPLE_SVG,
};

describe("<PetCreatedAha>", () => {
  it("renders the pet name in the heading", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain("Luna ya tiene su credencial");
  });

  it("renders the QR with an aria-label containing the credential URL", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain("https://mimar.ar/p/abc-123-def");
    // aria-label on the QR wrapper describes the link
    expect(html).toMatch(/aria-label="[^"]*https:\/\/mimar\.ar\/p\/abc-123-def/);
  });

  it("renders the QR SVG content", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain('<svg viewBox="0 0 100 100">');
  });

  it("renders a Compartir button as the primary CTA", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain("Compartir");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>[\s\S]*?Compartir/);
  });

  it("renders a Ver perfil link pointing to the pet profile", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain("Ver perfil");
    expect(html).toContain("/mis-mascotas/abc-123-def");
  });

  it("renders a public credential link pointing to /p/[token]", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain("/p/abc-123-def");
  });

  it("has at most 3 interactive CTAs", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    // Count buttons + anchor tags that are CTAs (exclude the QR wrapper which is a div)
    const buttonMatches = (html.match(/<button[^>]*type="button"/g) ?? []).length;
    const anchorMatches = (html.match(/<a[^>]*href="[^"]+"/g) ?? []).length;
    expect(buttonMatches + anchorMatches).toBeLessThanOrEqual(3);
  });

  it("uses ln-* design tokens only (no arbitrary hex, no gob-* tokens)", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).not.toMatch(/\bgob-/);
    // Should use ln token references
    expect(html).toMatch(/--color-ln-/);
  });

  it("QR container has role=img for screen readers", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain('role="img"');
  });

  it("heading has tabIndex=-1 so programmatic focus works", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain('tabindex="-1"');
  });
});
