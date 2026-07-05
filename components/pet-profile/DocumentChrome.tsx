"use client";

// DocumentChrome — the shared framed-sheet chrome that makes both faces read
// as ONE physical two-sided credential ("Una sola libreta" redesign). Wraps a
// face's inner content with: the blue pinstripe band (carrying the certificate
// title + the "Dar vuelta / Ver credencial" turn button), the certificate
// hairline frame, and the body. Rendered by FlipCard around each face so the
// server-rendered CredentialFace and the client LibretaFace share the exact
// same document shell without either owning the flip mechanics.
//
// The turn button is the SECOND flip trigger (the segmented Credencial/Libreta
// control above the card is the first); both call the same onFlip so the
// aria-selected tablist stays in sync. The band icon spins 180° on hover as a
// tactile "turn" cue (disabled under prefers-reduced-motion via CSS).

import { Icon } from "@/components/Icon";
import type { ReactNode } from "react";
import type { FlipCardFace } from "./FlipCard";

type DocumentChromeProps = {
  face: FlipCardFace;
  onFlip: () => void;
  /** Whether the Libreta (back) face is the one currently showing — drives the
   *  turn button's aria-pressed so the flip control carries the toggle state
   *  the removed tab title bar used to own. */
  isLibretaActive: boolean;
  children: ReactNode;
};

export function DocumentChrome({ face, onFlip, isLibretaActive, children }: DocumentChromeProps) {
  const isCredencial = face === "credencial";
  const bandSubtitle = isCredencial ? "Credencial · frente" : "Libreta · dorso";
  const turnLabel = isCredencial ? "Dar vuelta" : "Ver credencial";
  // The accessible name always names the TARGET face (unchanged wording — the
  // flip interaction is keyed off "Girar a …" elsewhere in the profile).
  const turnAria = isCredencial ? "Girar a Libreta" : "Girar a Credencial";

  return (
    <div className="ln-face">
      <div className="ln-frame" aria-hidden />
      <div className="ln-band" aria-hidden>
        <p className="ln-band-title">
          Libreta Sanitaria Nacional
          <small>{bandSubtitle}</small>
        </p>
      </div>
      {/* Turn button sits over the band but outside the aria-hidden wrapper so
          it keeps its accessible name. */}
      <button
        type="button"
        className="ln-turn"
        onClick={onFlip}
        aria-label={turnAria}
        aria-pressed={isLibretaActive}
      >
        <Icon name="girar" size="sm" decorative />
        {turnLabel}
      </button>
      <div className="ln-body">{children}</div>
    </div>
  );
}
