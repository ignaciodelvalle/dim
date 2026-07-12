"use client";

// CredentialRail — the owner-home credential carousel (task #9, the centerpiece).
//
// A horizontally scroll-snapping rail of per-pet CredCards, most-urgent first
// (ordering + cap decided server-side). Client only for the scroll affordances:
//
//   • mobile  → CSS scroll-snap + position dots (presentational indicators; the
//               cards themselves are focusable Links so keyboard/tab nav scrolls
//               each into view natively).
//   • desktop → circular prev/next arrow buttons that advance one card + a
//               right-edge fade mask signalling more cards.
//
// Glance-and-go (PO 2026-07-12 #1): the rail drives nothing below it — tapping a
// card navigates to that pet's profile. When the household exceeds the cap, a
// "Ver las N mascotas" link routes to /mis-mascotas for the overflow (never an
// infinite rail).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CredCard, type CredCardData } from "./CredCard";

export function CredentialRail({
  cards,
  totalCount,
}: {
  cards: CredCardData[];
  /** Total active pets in the household — drives the "Ver las N mascotas" overflow link. */
  totalCount: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const cardCount = cards.length;
  const hasOverflow = totalCount > cardCount;

  // Nearest-card index from the current scroll position (rAF-throttled).
  const syncActive = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length === 0) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    children.forEach((child, i) => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(childCenter - center);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    setActive(nearest);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncActive);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [syncActive]);

  const scrollByCard = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length === 0) return;
    const step = children[0].offsetWidth + 16; // card width + gap-4
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  return (
    <section aria-label="Credenciales de tus mascotas" className="mb-6">
      {/* Eyebrow + overflow link */}
      <div className="mb-2.5 flex items-baseline justify-between gap-4">
        <p className="font-[var(--font-ln-mono)] text-[var(--text-xs)] font-semibold uppercase tracking-[.14em] text-[var(--color-ln-mute)]">
          Credenciales
        </p>
        {hasOverflow && (
          <Link
            href="/mis-mascotas"
            className="font-[var(--font-ln-mono)] text-[var(--text-sm)] text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            Ver las {totalCount} mascotas →
          </Link>
        )}
      </div>

      <div className="relative">
        {/* Desktop prev arrow */}
        <button
          type="button"
          aria-label="Credencial anterior"
          onClick={() => scrollByCard(-1)}
          className="absolute left-0 top-1/2 z-20 hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink-2)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-ln-stripe)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)] md:grid"
        >
          <span aria-hidden="true">‹</span>
        </button>

        {/* Scroll-snap rail */}
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card) => (
            <CredCard key={card.token} data={card} />
          ))}
        </div>

        {/* Desktop right-edge fade mask — signals more cards. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[70px] bg-gradient-to-l from-[var(--color-ln-paper)] to-transparent md:block"
        />

        {/* Desktop next arrow */}
        <button
          type="button"
          aria-label="Credencial siguiente"
          onClick={() => scrollByCard(1)}
          className="absolute right-0 top-1/2 z-20 hidden h-11 w-11 translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink-2)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-ln-stripe)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)] md:grid"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      {/* Position dots — presentational indicator (one per card). */}
      {cardCount > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
          {cards.map((card, i) => (
            <span
              key={card.token}
              className={[
                "h-1.5 w-1.5 rounded-full transition-colors",
                i === active ? "bg-[var(--color-ln-azul)]" : "bg-[var(--color-ln-line-strong)]",
              ].join(" ")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
