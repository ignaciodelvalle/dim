"use client";

// ViewCaption — the persistent "¿qué estoy viendo y de dónde son estos datos?"
// strip above the legend pill (Epic C1). It restates the honest one-line view
// description (explainViewState — the same sentence "Copiar vista" and the print
// informe use), always visible on the map surface.
//
// FIX (PO: "el box le queda chico a Brotes Activos"): the strip used a bare
// `line-clamp-2` + a `title` tooltip. A long caption (e.g. the Brotes Activos
// vista) clipped to two lines and the rest was reachable ONLY on hover — invisible
// on touch, and silently truncated on desktop unless the operator happened to
// hover. This variant keeps the compact 2-line clamp but adds an explicit
// "Ver más" / "Ver menos" toggle that appears ONLY when the text actually
// overflows, so the full description is ALWAYS reachable, never clipped silently.
//
// Placement note (PO asked us to validate the surface): kept in place, above the
// legend pill on the bottom-left of the map. An alternative surface considered was
// folding it INTO the legend pill's expandable body (where the caption/MapLegends
// already live) — rejected for now because the whole point of C1 is that the view
// description stays visible WITHOUT opening the pill; moving it inside would bury
// the answer behind an interaction again.

import { useEffect, useRef, useState } from "react";

export function ViewCaption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // True only when the collapsed (clamped) text is actually taller than its box —
  // i.e. there is hidden content worth an expand affordance. Measured after layout
  // and re-measured when the text changes (a new vista / scope / period).
  const [overflowing, setOverflowing] = useState(false);
  const pRef = useRef<HTMLParagraphElement>(null);

  // `text` drives the measurement — a new caption re-renders the <p> and we must
  // re-measure overflow — but it is read through the DOM (scrollHeight), not the
  // closure, so biome sees it as an "unnecessary" dependency. Keeping it is intended.
  // biome-ignore lint/correctness/useExhaustiveDependencies: text re-measure trigger read via the DOM, not the closure.
  useEffect(() => {
    const el = pRef.current;
    if (!el) return;
    // Measure against the CLAMPED layout: when collapsed, scrollHeight exceeds
    // clientHeight iff the text spills past the 2-line clamp. When expanded we
    // still want to know whether a "Ver menos" is warranted, so we measure the
    // clamp state by temporarily ignoring `expanded` — instead we compare the
    // natural height by reading scrollHeight while the clamp class is applied.
    // Simplest robust check: overflow exists when scrollHeight > clientHeight in
    // the collapsed state; once expanded the toggle stays (to collapse back).
    if (!expanded) {
      setOverflowing(el.scrollHeight > el.clientHeight + 1);
    }
  }, [text, expanded]);

  return (
    <div className="mb-1.5 max-w-sm">
      <p
        ref={pRef}
        className={`rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card/90 px-2.5 py-1 text-[var(--text-xs)] leading-snug text-ln-op-mute shadow-sm ${
          expanded ? "" : "line-clamp-2"
        }`}
        // Keep the native tooltip as a bonus affordance for mouse users; the
        // toggle is the reliable, touch-reachable path.
        title={text}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-[var(--text-xs)] font-medium text-ln-op-azul hover:underline"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}
