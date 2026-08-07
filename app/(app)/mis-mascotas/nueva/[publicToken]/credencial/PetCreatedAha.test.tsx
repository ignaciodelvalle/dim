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
  printableQrEnabled: true,
};

/** The markup of the max-3 action cluster only (the chapita affordance rides
 *  the QR block above it and is deliberately not one of the three). */
function actionsCluster(html: string): string {
  const parts = html.split('data-section="aha-actions"');
  expect(parts.length, "the actions cluster must be tagged").toBe(2);
  return parts[1];
}

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

  it("teaches the self-scan privacy lesson naming the pet and a stranger scanning it", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain("Esto es lo que ve un extraño que escanea a Luna");
  });

  it("has at most 3 interactive CTAs in the action cluster", () => {
    // The spec's "máx 3, regla de 4 verbos" applies to the ACTION CLUSTER. The
    // chapita link added in D.8 is not one of the three: it is an affordance
    // attached to the QR block, where "Guardalo en el collar" is read. The
    // count is scoped to the cluster so the contract stays enforceable instead
    // of being re-baselined to 4.
    const cluster = actionsCluster(render(<PetCreatedAha {...defaultProps} />));
    const buttonMatches = (cluster.match(/<button[^>]*type="button"/g) ?? []).length;
    const anchorMatches = (cluster.match(/<a[^>]*href="[^"]+"/g) ?? []).length;
    expect(buttonMatches + anchorMatches).toBeLessThanOrEqual(3);
    // Belt and braces: the whole screen stays at 3 CTAs + 1 QR affordance.
    const html = render(<PetCreatedAha {...defaultProps} />);
    const allButtons = (html.match(/<button[^>]*type="button"/g) ?? []).length;
    const allAnchors = (html.match(/<a[^>]*href="[^"]+"/g) ?? []).length;
    expect(allButtons + allAnchors).toBeLessThanOrEqual(4);
  });

  // -------------------------------------------------------------------------
  // D.8 (2026-07-30) — the print affordance.
  //
  // The screen has always rendered the QR and always told the owner to "guardalo
  // en el collar", with no way to do it: its three CTAs were Compartir / Ver
  // perfil / Ver credencial pública. The print surface already exists at
  // /mis-mascotas/[token]/chapita. This screen LINKS there instead of
  // reimplementing window.print, because /chapita is gated by
  // resolvePhysicalCredentialChannels and printable_qr can be off per
  // jurisdiction — an embedded print button would bypass that gate.
  // -------------------------------------------------------------------------
  it("offers the chapita print surface as a link, not an embedded print button", () => {
    const html = render(<PetCreatedAha {...defaultProps} />);
    expect(html).toContain("Imprimir la chapita");
    expect(html).toContain('href="/mis-mascotas/abc-123-def/chapita"');
    // No embedded print: the jurisdiction gate lives on /chapita and must not
    // be bypassed from here.
    expect(html).not.toMatch(/window\.print|onclick/i);
  });

  it("keeps the chapita link OUT of the max-3 action cluster", () => {
    const cluster = actionsCluster(render(<PetCreatedAha {...defaultProps} />));
    expect(cluster).not.toContain("/chapita");
    expect(cluster).not.toContain("Imprimir la chapita");
  });

  it("hides the chapita link entirely when the jurisdiction has printable_qr off", () => {
    const html = render(<PetCreatedAha {...defaultProps} printableQrEnabled={false} />);
    expect(html).not.toContain("/chapita");
    expect(html).not.toContain("Imprimir la chapita");
    // The rest of the screen is untouched.
    expect(html).toContain("Luna ya tiene su credencial");
    expect(html).toContain("Ver credencial pública");
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
