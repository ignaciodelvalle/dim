"use client";

// FlipCard — literal CSS-3D flip container for the pet profile's two faces
// (pet-document-redesign ADR-11, elevated in the "Una sola libreta" redesign).
// PRESENTATION ONLY: it has no navigation state of its own — `activeFace` is
// read from the caller (PetDetailTabsPanel, which owns the ?tab= sync + the
// tablist wiring) and `onFlip` is a callback the caller wires to its ?tab=
// write.
//
// The document reads as ONE physical two-sided object:
//   - Two offset "back page" sheets peek behind (.ln-doc-wrap ::before/::after).
//   - The whole sheet rises in on entrance (.ln-doc-wrap ln-doc-in, motion-gated).
//   - A real rotateY(180deg) turn flips between faces, with the container height
//     animated to the visible face (ResizeObserver) so it never snaps.
//   - Each face is wrapped in <DocumentChrome> (blue band + certificate frame +
//     the "Dar vuelta / Ver credencial" turn button — the second flip trigger).
//
// Both faces are ALWAYS mounted (the back face must exist from first render so
// ResizeObserver can measure it and the flip has real content to rotate into),
// and each is a `role="tabpanel"` wired to its tab in PetDetailTabsPanel.
//
// HYDRATION SAFETY: this renders ONE deterministic tree — server and client
// produce identical markup. `prefers-reduced-motion` is honored purely in CSS
// (.ln-doc-turn transition is nulled under the media query), NOT by branching to
// a different React subtree, which used to hydrate-mismatch on a reduced-motion
// client (the server always sees reduced-motion = false).

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { DocumentChrome } from "./DocumentChrome";

export type FlipCardFace = "credencial" | "libreta";

// Stable ids shared with PetDetailTabsPanel's tablist so each tab controls its
// panel (aria-controls ↔ id) and the panel is labelled by its tab.
export const PET_FACE_TAB_ID: Record<FlipCardFace, string> = {
  credencial: "pet-tab-credencial",
  libreta: "pet-tab-libreta",
};
export const PET_FACE_PANEL_ID: Record<FlipCardFace, string> = {
  credencial: "pet-face-credencial",
  libreta: "pet-face-libreta",
};

type FlipCardProps = {
  front: ReactNode;
  back: ReactNode;
  activeFace: FlipCardFace;
  /** Toggles the face — wired by the caller (PetDetailTabsPanel.switchFace) to its ?tab= write. */
  onFlip: () => void;
};

export function FlipCard({ front, back, activeFace, onFlip }: FlipCardProps) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const isLibreta = activeFace === "libreta";

  // Height-sync (ADR-11): keep the rotating container's height matched to the
  // visible face so the height animates with the turn instead of snapping.
  // Observes BOTH faces — not just the active one — so an async content change
  // on the CURRENTLY-SHOWN face (e.g. the Libreta back face resolving from its
  // loading skeleton to real content while already flipped) re-measures
  // immediately, instead of leaving a stale height until the next flip.
  useLayoutEffect(() => {
    const measure = () => {
      const el = (isLibreta ? backRef : frontRef).current;
      if (el) setHeight(el.getBoundingClientRect().height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    return () => ro.disconnect();
  }, [isLibreta]);

  return (
    <div data-section="flip-card" className="ln-doc-root">
      <div className="ln-doc-stage">
        <div className="ln-doc-wrap">
          <div
            className="ln-doc-turn relative w-full [-webkit-transform-style:preserve-3d] [transform-style:preserve-3d]"
            style={{
              transform: `rotateY(${isLibreta ? 180 : 0}deg)`,
              height: height !== undefined ? `${height}px` : undefined,
            }}
          >
            <div
              ref={frontRef}
              id={PET_FACE_PANEL_ID.credencial}
              role="tabpanel"
              aria-labelledby={PET_FACE_TAB_ID.credencial}
              tabIndex={-1}
              data-section="flip-front"
              aria-hidden={isLibreta}
              className="absolute inset-x-0 top-0 w-full outline-none [-webkit-backface-visibility:hidden] [backface-visibility:hidden]"
            >
              <DocumentChrome face="credencial" onFlip={onFlip} isLibretaActive={isLibreta}>
                {front}
              </DocumentChrome>
            </div>
            <div
              ref={backRef}
              id={PET_FACE_PANEL_ID.libreta}
              role="tabpanel"
              aria-labelledby={PET_FACE_TAB_ID.libreta}
              tabIndex={-1}
              data-section="flip-back"
              aria-hidden={!isLibreta}
              className="absolute inset-x-0 top-0 w-full outline-none [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(180deg)]"
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
