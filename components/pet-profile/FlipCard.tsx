"use client";

// FlipCard — literal CSS-3D flip container for the pet profile's two faces
// (pet-document-redesign ADR-11, elevated in the "Una sola libreta" redesign).
// PRESENTATION ONLY: it has no navigation state of its own — `activeFace` is
// read from the caller (PetDetailTabsPanel, which owns the ?tab= sync) and
// `onFlip` is a callback the caller wires to its own ?tab= write.
//
// The document reads as ONE physical two-sided object:
//   - Two offset "back page" sheets peek behind (.ln-doc-wrap ::before/::after).
//   - The whole sheet rises in on entrance (.ln-doc-wrap ln-doc-in, motion-gated).
//   - A real rotateY(180deg) turn flips between faces, with the container height
//     animated to the visible face (ResizeObserver) so it never snaps.
//   - Each face is wrapped in <DocumentChrome> (blue band + certificate frame +
//     the "Dar vuelta / Ver credencial" turn button — the second flip trigger).
//
// Both `front` and `back` are ALWAYS mounted — the back face needs to exist in
// the DOM from the first render so ResizeObserver can measure it and the flip
// has real content to rotate into (no first-flip content pop-in).
//
// `prefers-reduced-motion: reduce` disables the 3D transform entirely: the
// non-active face is hidden via `display:none` (still mounted) instead of being
// rotated out of view, and no transition class is applied. The peeking pages
// and band chrome still render (they carry no motion of their own).

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DocumentChrome } from "./DocumentChrome";

export type FlipCardFace = "credencial" | "libreta";

type FlipCardProps = {
  front: ReactNode;
  back: ReactNode;
  activeFace: FlipCardFace;
  /** Toggles the face — wired by the caller (PetDetailTabsPanel.switchFace) to its ?tab= write. */
  onFlip: () => void;
};

function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion(): boolean {
  // Lazy initializer runs during the render pass itself (including under
  // renderToStaticMarkup, unlike useEffect) so the reduced-motion branch is
  // testable without jsdom — repo convention (react-dom/server, no jsdom).
  const [reduced, setReduced] = useState(readPrefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function FlipCard({ front, back, activeFace, onFlip }: FlipCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const isLibreta = activeFace === "libreta";

  // JS-measured height transition (ADR-11): syncs the container's height to
  // whichever face is currently visible, so the height animates together with
  // the rotateY transform instead of snapping. Skipped entirely under reduced
  // motion (see the render branch below — no explicit height there).
  useLayoutEffect(() => {
    if (reducedMotion) return;
    const activeEl = isLibreta ? backRef.current : frontRef.current;
    if (!activeEl) return;
    setHeight(activeEl.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    ro.observe(activeEl);
    return () => ro.disconnect();
  }, [isLibreta, reducedMotion]);

  if (reducedMotion) {
    return (
      <div data-section="flip-card" data-reduced-motion="true" className="ln-doc-root">
        <div className="ln-doc-stage">
          <div className="ln-doc-wrap">
            <div
              ref={frontRef}
              data-section="flip-front"
              aria-hidden={isLibreta}
              className={isLibreta ? "hidden" : "block"}
            >
              <DocumentChrome face="credencial" onFlip={onFlip} isLibretaActive={isLibreta}>
                {front}
              </DocumentChrome>
            </div>
            <div
              ref={backRef}
              data-section="flip-back"
              aria-hidden={!isLibreta}
              className={isLibreta ? "block" : "hidden"}
            >
              <DocumentChrome face="libreta" onFlip={onFlip} isLibretaActive={isLibreta}>
                {back}
              </DocumentChrome>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-section="flip-card" className="ln-doc-root">
      <div className="ln-doc-stage">
        <div className="ln-doc-wrap">
          <div
            className="relative w-full [-webkit-transform-style:preserve-3d] [transform-style:preserve-3d]"
            style={{
              transform: `rotateY(${isLibreta ? 180 : 0}deg)`,
              height: height !== undefined ? `${height}px` : undefined,
              transition: "transform 500ms ease-in-out, height 500ms ease-in-out",
            }}
          >
            <div
              ref={frontRef}
              data-section="flip-front"
              aria-hidden={isLibreta}
              className="absolute inset-x-0 top-0 w-full [-webkit-backface-visibility:hidden] [backface-visibility:hidden]"
            >
              <DocumentChrome face="credencial" onFlip={onFlip} isLibretaActive={isLibreta}>
                {front}
              </DocumentChrome>
            </div>
            <div
              ref={backRef}
              data-section="flip-back"
              aria-hidden={!isLibreta}
              className="absolute inset-x-0 top-0 w-full [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(180deg)]"
            >
              <DocumentChrome face="libreta" onFlip={onFlip} isLibretaActive={isLibreta}>
                {back}
              </DocumentChrome>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
