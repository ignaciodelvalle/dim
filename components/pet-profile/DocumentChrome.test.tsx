// Tests for <DocumentChrome> — pet-state-header: the masthead band is the
// carrier of the pet's SITUATION on both faces. The situation arrives as an
// explicit prop (server-derived, pre-gendered label) and stamps
// `data-situation` on `.ln-face`, so the CSS band variants reach the BACK face
// too (the old `:has(.ln-cred[data-situation])` scoping never matched it).
// Render via react-dom/server (repo convention — no jsdom).

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PET_SITUATIONS } from "@/lib/ui/pet-situation";
import { DocumentChrome } from "./DocumentChrome";
import { FlipCard } from "./FlipCard";

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("window", {
    matchMedia: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

beforeEach(() => {
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lostSituation = {
  key: PET_SITUATIONS.perdida.key,
  tone: PET_SITUATIONS.perdida.tone,
  // Pre-gendered by the caller (situationLabelForSex) — chrome stays dumb.
  label: "Perdido",
  icon: PET_SITUATIONS.perdida.icon,
};

describe("<DocumentChrome> — situation band", () => {
  it("stamps data-situation on .ln-face and renders the state chip (icon + label)", () => {
    const html = renderToStaticMarkup(
      <DocumentChrome
        face="credencial"
        onFlip={() => {}}
        isLibretaActive={false}
        situation={lostSituation}
      >
        <div>BODY</div>
      </DocumentChrome>,
    );
    expect(html).toContain('data-situation="perdida"');
    expect(html).toContain("ln-band-chip");
    expect(html).toContain("Perdido");
    // Icon = the non-color signal (WCAG: never color alone). The chip renders
    // an svg next to the label.
    expect(html).toMatch(/ln-band-chip[^>]*>\s*<svg/);
  });

  it("renders no chip and no data-situation when situation is null", () => {
    const html = renderToStaticMarkup(
      <DocumentChrome face="credencial" onFlip={() => {}} isLibretaActive={false} situation={null}>
        <div>BODY</div>
      </DocumentChrome>,
    );
    expect(html).not.toContain("data-situation");
    expect(html).not.toContain("ln-band-chip");
  });

  it("keeps the chip OUTSIDE the aria-hidden band wrapper (accessible text)", () => {
    const html = renderToStaticMarkup(
      <DocumentChrome
        face="libreta"
        onFlip={() => {}}
        isLibretaActive={true}
        situation={lostSituation}
      >
        <div>BODY</div>
      </DocumentChrome>,
    );
    // The aria-hidden band div must CLOSE before the chip opens — the chip is a
    // sibling overlay (same pattern as the turn button), not band content.
    const bandEnd = html.indexOf("</div>", html.indexOf("ln-band-title"));
    const chipAt = html.indexOf("ln-band-chip");
    expect(chipAt).toBeGreaterThan(bandEnd);
  });

  it("renders the band + chip on BOTH faces via FlipCard (flip never loses the state)", () => {
    const html = renderToStaticMarkup(
      <FlipCard
        front={<div>F</div>}
        back={<div>B</div>}
        activeFace="credencial"
        onFlip={() => {}}
        situation={lostSituation}
      />,
    );
    const occurrences = html.split('data-situation="perdida"').length - 1;
    expect(occurrences).toBe(2);
    const chips = html.split("ln-band-chip").length - 1;
    expect(chips).toBe(2);
  });

  it("defaults to no situation when FlipCard receives none (today's exact look)", () => {
    const html = renderToStaticMarkup(
      <FlipCard
        front={<div>F</div>}
        back={<div>B</div>}
        activeFace="credencial"
        onFlip={() => {}}
      />,
    );
    expect(html).not.toContain("data-situation");
    expect(html).not.toContain("ln-band-chip");
  });
});

// tarjeta-todo: the carousel position dots render in the band via the
// `bandDots` slot — outside the aria-hidden band wrapper (same established
// pattern as the turn button and the state chip), on BOTH faces.
describe("<DocumentChrome> — band dots slot (tarjeta-todo)", () => {
  it("renders the bandDots node OUTSIDE the aria-hidden band wrapper", () => {
    const html = renderToStaticMarkup(
      <DocumentChrome
        face="credencial"
        onFlip={() => {}}
        isLibretaActive={false}
        bandDots={<nav aria-label="Tus mascotas">DOTS</nav>}
      >
        <div>BODY</div>
      </DocumentChrome>,
    );
    expect(html).toContain('data-section="band-dots"');
    expect(html).toContain('aria-label="Tus mascotas"');
    // The aria-hidden band div must CLOSE before the dots wrapper opens — the
    // dots are a sibling overlay (accessible), not band content.
    const bandEnd = html.indexOf("</div>", html.indexOf("ln-band-title"));
    const dotsAt = html.indexOf('data-section="band-dots"');
    expect(dotsAt).toBeGreaterThan(bandEnd);
  });

  it("renders no dots wrapper when the slot is absent (single pet / non-owner)", () => {
    const html = renderToStaticMarkup(
      <DocumentChrome face="credencial" onFlip={() => {}} isLibretaActive={false}>
        <div>BODY</div>
      </DocumentChrome>,
    );
    expect(html).not.toContain('data-section="band-dots"');
  });

  it("renders the dots on BOTH faces via FlipCard (flip never loses the position)", () => {
    const html = renderToStaticMarkup(
      <FlipCard
        front={<div>F</div>}
        back={<div>B</div>}
        activeFace="credencial"
        onFlip={() => {}}
        bandDots={<nav aria-label="Tus mascotas">DOTS</nav>}
      />,
    );
    expect(html.split('data-section="band-dots"').length - 1).toBe(2);
  });

  // PO 2026-07-18 dedup/geometry fix: the dots used an uncalibrated
  // `translate-x-3` right-of-center nudge that overflowed the card's right
  // edge at OWNER_CAROUSEL_CAP (8 dots) on a narrow viewport, where
  // `.ln-face`'s overflow:hidden clipped the strip against the QR poke
  // corner — the exact "outside the credential" the PO reported. The fix is
  // a dedicated CSS class (`.ln-band-dots`, globals.css) that TRUE-centers
  // the strip with no directional offset to miscalibrate.
  it("positions the dots with the dedicated in-band class, not an ad-hoc offset", () => {
    const html = renderToStaticMarkup(
      <DocumentChrome
        face="credencial"
        onFlip={() => {}}
        isLibretaActive={false}
        bandDots={<nav aria-label="Tus mascotas">DOTS</nav>}
      >
        <div>BODY</div>
      </DocumentChrome>,
    );
    expect(html).toContain('class="ln-band-dots"');
    // The old right-of-center nudge must not resurface.
    expect(html).not.toContain("translate-x-3");
  });

  it("renders the dots wrapper INSIDE the credential card boundary (.ln-face), not as a page-level sibling", () => {
    const html = renderToStaticMarkup(
      <DocumentChrome
        face="credencial"
        onFlip={() => {}}
        isLibretaActive={false}
        bandDots={<nav aria-label="Tus mascotas">DOTS</nav>}
      >
        <div>BODY</div>
      </DocumentChrome>,
    );
    // `.ln-face` is the outermost element DocumentChrome renders; the dots
    // section must appear after its opening tag and before its closing tag —
    // i.e. genuinely nested inside the card, not a sibling bolted outside it.
    const faceOpen = html.indexOf('class="ln-face"');
    const dotsAt = html.indexOf('data-section="band-dots"');
    const faceCloseSearch = html.lastIndexOf("</div>");
    expect(faceOpen).toBeGreaterThanOrEqual(0);
    expect(dotsAt).toBeGreaterThan(faceOpen);
    expect(dotsAt).toBeLessThan(faceCloseSearch);
  });
});
