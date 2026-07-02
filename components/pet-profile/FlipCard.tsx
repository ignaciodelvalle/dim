"use client";

// FlipCard — literal CSS-3D flip container for the pet profile's two faces
// (pet-document-redesign ADR-11). PRESENTATION ONLY: it has no navigation
// state of its own — `activeFace` is read from the caller (PetDetailTabsPanel,
// which owns the ?tab= sync) and `onFlip` is a callback the caller wires to
// its own ?tab= write. Since wave-3 P2 (PO decision #645), the "Girar"
// button rendered here is the ONLY face switcher — the Credencial|Libreta
// tab title bar was removed.
//
// Both `front` and `back` are ALWAYS mounted — the back face needs to exist
// in the DOM from the first render so ResizeObserver can measure it and the
// flip has real content to rotate into (no first-flip content pop-in).
//
// `prefers-reduced-motion: reduce` disables the 3D transform entirely: the
// non-active face is hidden via `display:none` (still mounted) instead of
// being rotated out of view, and no transition class is applied.

import { Icon } from "@/components/Icon";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

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
  // whichever face is currently visible, so the height animates together
  // with the rotateY transform instead of snapping. Skipped entirely under
  // reduced motion (see the render branch below — no explicit height there).
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
      <div data-section="flip-card" data-reduced-motion="true" className="relative">
        <FlipAffordance isLibreta={isLibreta} onFlip={onFlip} />
        <div
          ref={frontRef}
          data-section="flip-front"
          aria-hidden={isLibreta}
          className={isLibreta ? "hidden" : "block"}
        >
          {front}
        </div>
        <div
          ref={backRef}
          data-section="flip-back"
          aria-hidden={!isLibreta}
          className={isLibreta ? "block" : "hidden"}
        >
          {back}
        </div>
      </div>
    );
  }

  return (
    <div data-section="flip-card" className="relative" style={{ perspective: "2000px" }}>
      <FlipAffordance isLibreta={isLibreta} onFlip={onFlip} />
      <div
        className="relative w-full transition-transform duration-500 ease-in-out [-webkit-transform-style:preserve-3d] [transform-style:preserve-3d]"
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
          className="absolute inset-x-0 top-0 w-full rounded-[var(--radius-card)] bg-[var(--color-ln-card)] [-webkit-backface-visibility:hidden] [backface-visibility:hidden]"
        >
          {front}
        </div>
        <div
          ref={backRef}
          data-section="flip-back"
          aria-hidden={!isLibreta}
          className="absolute inset-x-0 top-0 w-full rounded-[var(--radius-card)] bg-[var(--color-ln-card)] [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(180deg)]"
        >
          {back}
        </div>
      </div>
    </div>
  );
}

// This button is now the ONLY face switcher (PO decision #645 point 2 — the
// Credencial|Libreta tab titles were removed, "one credential-style box"
// insisted). It carries the full accessible-nav contract the tab bar used to
// own: a descriptive aria-label naming the TARGET face (unchanged wording —
// interaction tests key off it) plus aria-pressed reflecting whether the
// alternate (Libreta) face is currently showing, since there's no longer a
// visible tablist to convey that state. The icon is CONTEXTUAL, not a static
// "refresh" glyph: it previews the face this button flips TO — a booklet
// while on Credencial (flip to Libreta), an id-card while on Libreta (flip
// back to Credencial).
function FlipAffordance({ isLibreta, onFlip }: { isLibreta: boolean; onFlip: () => void }) {
  return (
    <button
      type="button"
      onClick={onFlip}
      data-section="flip-affordance"
      aria-label={isLibreta ? "Girar a Credencial" : "Girar a Libreta"}
      aria-pressed={isLibreta}
      title="Girar"
      className="absolute right-0 top-0 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] text-[var(--color-ln-azul)] shadow-sm transition-colors hover:border-[var(--color-ln-line-strong)]"
    >
      <Icon name={isLibreta ? "credential" : "libreta"} size="sm" decorative />
    </button>
  );
}
