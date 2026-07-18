/**
 * <CaptureOptionsList> — accessible-name regression guard.
 *
 * medianos-sesión-2 finding #5 (verified against current code — not
 * reproducible: every row already renders its label as visible <span> text
 * inside the <Link>, so the link's text content IS its accessible name; the
 * trailing "→" glyph is additional visible text, never the ONLY content).
 * Pinned here so a future edit can't turn a row into an icon-only link with
 * no accessible name.
 *
 * Pattern: react-dom/server renderToStaticMarkup (repo convention — no
 * jsdom, see anotar/page.test.tsx / CaptureBox.test.tsx).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CaptureOptionsList } from "./CaptureOptionsList";

describe("<CaptureOptionsList> — every row link carries a real accessible name", () => {
  it("every option link's visible text is non-empty", () => {
    const html = renderToStaticMarkup(<CaptureOptionsList petPublicToken="DIM-TEST-0001" />);
    const links = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)];
    expect(links.length).toBeGreaterThan(0);
    for (const [, inner] of links) {
      const text = inner.replace(/<[^>]*>/g, "").trim();
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("renders the known category labels as real link text, not just the trailing arrow", () => {
    const html = renderToStaticMarkup(<CaptureOptionsList petPublicToken="DIM-TEST-0001" />);
    expect(html).toContain("Registrar vacuna");
    expect(html).toContain("Marcar como perdida");
  });
});
