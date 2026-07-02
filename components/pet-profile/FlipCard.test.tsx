// Tests for <FlipCard> — pet-document-redesign ADR-11 (literal CSS-3D flip,
// presentation only). Render via react-dom/server (repo convention).
//
// jsdom-only APIs (matchMedia, ResizeObserver) aren't available under
// react-dom/server — this file stubs them globally before each render so the
// component's effects don't throw during SSR-style rendering.

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FlipCard } from "./FlipCard";

// No jsdom in this repo (react-dom/server convention) — `window` itself is
// undefined in the vitest node environment, so the reduced-motion branch is
// exercised by stubbing `window` wholesale, not just `matchMedia`.
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

function stubResizeObserver() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

beforeEach(() => {
  stubMatchMedia(false);
  stubResizeObserver();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("<FlipCard> — both faces always mounted", () => {
  it("renders both front and back content in the DOM regardless of activeFace", () => {
    const html = renderToStaticMarkup(
      <FlipCard
        front={<div>FRONT-MARKER</div>}
        back={<div>BACK-MARKER</div>}
        activeFace="credencial"
        onFlip={() => {}}
      />,
    );
    expect(html).toContain("FRONT-MARKER");
    expect(html).toContain("BACK-MARKER");
  });

  it("marks the non-active face aria-hidden (credencial active → back hidden)", () => {
    const html = renderToStaticMarkup(
      <FlipCard front={<div>F</div>} back={<div>B</div>} activeFace="credencial" onFlip={() => {}} />,
    );
    expect(html).toContain('data-section="flip-front" aria-hidden="false"');
    expect(html).toContain('data-section="flip-back" aria-hidden="true"');
  });

  it("marks the non-active face aria-hidden (libreta active → front hidden)", () => {
    const html = renderToStaticMarkup(
      <FlipCard front={<div>F</div>} back={<div>B</div>} activeFace="libreta" onFlip={() => {}} />,
    );
    expect(html).toContain('data-section="flip-front" aria-hidden="true"');
    expect(html).toContain('data-section="flip-back" aria-hidden="false"');
  });

  it("renders the Girar affordance with an aria-label describing the target face", () => {
    const html = renderToStaticMarkup(
      <FlipCard front={<div>F</div>} back={<div>B</div>} activeFace="credencial" onFlip={() => {}} />,
    );
    expect(html).toContain('aria-label="Girar a Libreta"');
  });
});

describe("<FlipCard> — prefers-reduced-motion instant swap", () => {
  it("has no transition/transform class and no rotateY when reduced motion is active", () => {
    stubMatchMedia(true);
    const html = renderToStaticMarkup(
      <FlipCard front={<div>F</div>} back={<div>B</div>} activeFace="credencial" onFlip={() => {}} />,
    );
    expect(html).toContain('data-reduced-motion="true"');
    expect(html).not.toContain("transition-transform");
    expect(html).not.toContain("rotateY");
  });

  it("swaps visibility via hidden/block classes instead of a 3D transform", () => {
    stubMatchMedia(true);
    const html = renderToStaticMarkup(
      <FlipCard front={<div>F</div>} back={<div>B</div>} activeFace="libreta" onFlip={() => {}} />,
    );
    expect(html).toContain('data-section="flip-front" aria-hidden="true" class="hidden"');
    expect(html).toContain('data-section="flip-back" aria-hidden="false" class="block"');
  });
});

describe("<FlipCard> — animated path (motion allowed)", () => {
  it("applies the rotateY transform matching activeFace", () => {
    const html = renderToStaticMarkup(
      <FlipCard front={<div>F</div>} back={<div>B</div>} activeFace="libreta" onFlip={() => {}} />,
    );
    expect(html).toContain("rotateY(180deg)");
  });
});
