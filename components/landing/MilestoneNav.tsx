"use client";

// Milestone orchestrator — the landing's progressive-reveal choreography
// (PO-approved design 2026-08-02).
//
// The public landing reads as SIX milestones (existing sections — this is
// choreography, not new content): credential hero → crisis band → bond band →
// story → life moments → empezar. FAQ + footer stay OUTSIDE the sequence:
// always reachable below, never a jump target, and the CTA disappears once the
// last milestone is reached so nothing floats over the closing content.
//
// Contract (locked decisions):
//  - ZERO keyboard interception. Navigation keys keep scrolling natively; this
//    component only RESPONDS to scroll. No document-level key listeners, no
//    preventDefault on anything.
//  - The ONLY new interactive element is the persistent, discreet
//    "Continuar ↓" button. It jumps to the next milestone via the same
//    scrollToChapter pattern StorySection uses: smooth ONLY when motion is
//    allowed AND the document has focus, else an instant jump.
//  - Visible under reduced motion too — motion preference is not a navigation
//    preference; the jump is simply instant.
//  - Fail-open: the button renders nothing until hydration (a no-JS visitor
//    must never see an affordance that cannot work), and every section stays
//    server-rendered and reachable by native scroll regardless.
//  - Milestone 4 jumps INTO the story section; the story's own rail/scroll-spy
//    handles navigation within its six chapters.
//
// Active tracking mirrors StorySection's scroll-spy (the milestone whose
// section last crossed 45% of the viewport is active) rather than a separate
// IntersectionObserver: one shared vocabulary, one behavior to reason about.

import { useEffect, useState } from "react";

export type LandingMilestone = {
  /** Stable section anchor id (the section elements carry these ids). */
  id: string;
  /** es-AR display name — used in the CTA's accessible label. */
  name: string;
};

// Order mirrors app/page.tsx section order. FAQ is deliberately absent.
export const MILESTONES: LandingMilestone[] = [
  { id: "top", name: "La credencial" },
  { id: "crisis", name: "Emergencias, sin cuenta" },
  { id: "vinculo", name: "El vínculo" },
  { id: "idea", name: "Una mascota, muchas manos" },
  { id: "features", name: "Cuando no es un buen día" },
  { id: "empezar", name: "Empezar" },
];

/** Same sticky-nav offset scrollToChapter (StorySection.tsx) compensates. */
const NAV_OFFSET_PX = 84;

/** Fraction of the viewport a section top must cross to become active. */
const ACTIVE_VIEWPORT_FRACTION = 0.45;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Jump to a milestone section — the scrollToChapter pattern verbatim:
 * smooth is gated on motion being allowed AND the document holding focus
 * (a smooth scroll in a backgrounded tab arrives at the wrong place).
 */
export function scrollToMilestone(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET_PX;
  const smooth = !prefersReducedMotion() && document.hasFocus();
  window.scrollTo({ top: Math.max(top, 0), behavior: smooth ? "smooth" : "auto" });
}

export function MilestoneNav() {
  // Hydration gate: SSR and no-JS render nothing (see contract above).
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => {
      const mid = window.innerHeight * ACTIVE_VIEWPORT_FRACTION;
      let current = 0;
      MILESTONES.forEach((m, i) => {
        const el = document.getElementById(m.id);
        if (el && el.getBoundingClientRect().top <= mid) current = i;
      });
      setActive((prev) => (prev === current ? prev : current));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const next = MILESTONES[active + 1];
  // Past the last milestone the affordance disappears — FAQ and footer below
  // are plain scroll territory, never CTA targets.
  if (!mounted || !next) return null;

  return (
    <button
      type="button"
      className="lp-milestone-cta"
      data-section="milestone-cta"
      aria-label={`Continuar a la próxima sección: ${next.name}`}
      onClick={() => scrollToMilestone(next.id)}
    >
      Continuar
      <span className="lp-milestone-ar" aria-hidden="true">
        ↓
      </span>
    </button>
  );
}
