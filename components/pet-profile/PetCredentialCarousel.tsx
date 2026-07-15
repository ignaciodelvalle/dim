"use client";

// PetCredentialCarousel — the owner credential carousel shell (owner-ia-redesign
// P4, "the heart"). The pet profile SWIPES between the owner's live pets,
// urgent-first. This shell is deliberately THIN: it owns only the navigation
// CHROME (position dots + desktop arrows), the gesture handling, and the
// one-neighbor-each-side prefetch. The credential document itself stays
// SERVER-RENDERED per route and is passed in as `children` — a swipe is a real
// NAVIGATION to the neighbor's route (`/mis-mascotas/[token]`), NOT a
// client-side pane slider. The URL follows, so the back button and sharing stay
// honest (PO decision 7).
//
// GESTURE SURFACE IS CONSTRAINED (the top P4 UX risk — vertical scroll of the
// long document must never fight the swipe). The horizontal swipe is captured
// ONLY when the gesture STARTS inside a `[data-swipe-zone]` element: the chrome
// bar (dots/arrows, below) and the credential's identity band (CredentialFace's
// identity `.ln-sec`, marked there). Everywhere else — compliance, avisos, the
// libreta face, the owner activity — pointer gestures pass straight through to
// normal scrolling, because we never preventDefault and only act on a completed,
// horizontal-dominant gesture that began in a zone.
//
// REDUCED MOTION is a non-issue by construction: there is NO custom slide/
// transform animation here to gate — navigation hands off to Next's router, and
// the neighbor route paints its own server-rendered document. Nothing this
// component draws moves.

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { Icon } from "@/components/Icon";
import { LnStatusDot } from "@/components/ui/Chip";
import { type CarouselPet, computeCarouselNeighbors } from "@/lib/domain/owner-carousel";

// A completed horizontal gesture must clear this distance (and dominate the
// vertical delta) to count as a swipe — keeps a tap or a vertical scroll that
// merely started on the band from navigating.
const SWIPE_THRESHOLD_PX = 48;

// Matches any open modal/dialog surface that should gate carousel navigation
// (keyboard arrows + pointer swipe): Vaul drawers, anything with an explicit
// role="dialog", AND a native <dialog open> (e.g. ConfirmDialog, which relies
// on the browser's own modal semantics and renders no explicit role — W1
// review fix bar 2026-07-15: the selector missed it, so a swipe/arrow-key
// could navigate to a neighbor pet while a native confirm dialog sat open).
const OPEN_DIALOG_SELECTOR = "[role='dialog'], [data-vaul-drawer], dialog[open]";

function routeForToken(token: string): string {
  return `/mis-mascotas/${token}`;
}

type Props = {
  /** Ranked, capped live pets (urgent-first) — one dot each, in this order. */
  pets: CarouselPet[];
  /** The pet whose profile is currently rendered. */
  currentToken: string;
  /** The server-rendered credential document for the current route. */
  children: ReactNode;
};

export function PetCredentialCarousel({ pets, currentToken, children }: Props) {
  const router = useRouter();

  const tokens = pets.map((p) => p.token);
  const { prevToken, nextToken } = computeCarouselNeighbors(tokens, currentToken);

  const navigate = useCallback(
    (token: string | null) => {
      if (!token || token === currentToken) return;
      router.push(routeForToken(token));
    },
    [router, currentToken],
  );

  // Prefetch EXACTLY ONE neighbor each side so the swipe lands without a blank.
  // Do not widen this (perf watchpoint): the profile page is heavy, and each
  // prefetch pulls a full RSC payload.
  useEffect(() => {
    if (prevToken) router.prefetch(routeForToken(prevToken));
    if (nextToken) router.prefetch(routeForToken(nextToken));
  }, [router, prevToken, nextToken]);

  // Keyboard ←/→. Bound at the window so the reader does not have to focus the
  // chrome first, but yields to any focused text field or the document's own
  // roving tablist (Credencial/Libreta ←/→), which must keep switching faces.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // `e.target` is the Window when the event is dispatched on window itself
      // (and has no `.closest`); only an Element can be inside a text field or
      // the roving tablist, so guard on that. Dialogs/sheets (Vaul drawers —
      // the ?sheet= capture flows) trap focus on Links/buttons that are none
      // of those tags, so the arrow keys navigated to a NEIGHBOR mid-capture
      // (M3 fresh-review MAJOR 1) — the carousel is inert while any dialog is
      // open or a sheet param is active.
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest(
          `input, textarea, select, [contenteditable='true'], [role='tab'], [role='tablist'], ${OPEN_DIALOG_SELECTOR}`,
        )
      ) {
        return;
      }
      if (document.querySelector(OPEN_DIALOG_SELECTOR)) return;
      navigate(e.key === "ArrowLeft" ? prevToken : nextToken);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, prevToken, nextToken]);

  // Delegated pointer swipe. We record the start point and whether it began in a
  // swipe zone; on release we navigate only for a horizontal-dominant gesture
  // that cleared the threshold. We never call preventDefault, so vertical
  // scrolling is untouched even when a scroll happens to begin on the band.
  const gestureRef = useRef<{ x: number; y: number; inZone: boolean } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target;
    gestureRef.current = {
      x: e.clientX,
      y: e.clientY,
      inZone: target instanceof Element && target.closest("[data-swipe-zone]") !== null,
    };
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || !g.inZone) return;
    // Gate the swipe while any dialog/sheet is open — the SAME guard the keyboard
    // path applies. A horizontal swipe on the identity band / chrome above an
    // open Vaul sheet (the ?sheet= capture drawer) would navigate to a neighbor
    // pet and destroy the unsaved capture-form state (M3 fresh-review MAJOR 1
    // — keyboard was gated, the pointer path was not).
    if (typeof document !== "undefined" && document.querySelector(OPEN_DIALOG_SELECTOR)) {
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
    // Swipe left (dx < 0) advances to the NEXT (less urgent) pet; swipe right
    // goes to the PREVIOUS one.
    navigate(dx < 0 ? nextToken : prevToken);
  }

  function onPointerCancel() {
    gestureRef.current = null;
  }

  // A pointerup outside the wrapper never reaches onPointerUp — without this
  // the stale gesture start survived until the next pointerdown (M3
  // fresh-review minor 2).
  function onPointerLeave() {
    gestureRef.current = null;
  }

  const total = pets.length;

  return (
    // Pointer handlers are the touch/mouse swipe surface (not click targets);
    // keyboard nav is the window ←/→ listener above.
    <div
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
    >
      {/* Navigation chrome — arrows (desktop) flanking the position dots. The
          whole strip is a swipe zone so a drag across the dots navigates too. */}
      <nav
        aria-label="Tus mascotas"
        data-swipe-zone
        data-testid="pet-carousel-chrome"
        className="mb-3 flex items-center justify-center gap-2"
      >
        <button
          type="button"
          onClick={() => navigate(prevToken)}
          disabled={!prevToken}
          aria-label="Mascota anterior"
          className="hidden h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] text-[var(--color-ln-mute)] transition-colors hover:text-[var(--color-ln-ink)] disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex"
        >
          <Icon name="chevron-right" size="sm" decorative className="rotate-180" />
        </button>

        <ul className="flex items-center gap-1.5">
          {pets.map((p, i) => {
            const isCurrent = p.token === currentToken;
            return (
              <li key={p.token}>
                <button
                  type="button"
                  onClick={() => navigate(p.token)}
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={`Mascota ${i + 1} de ${total}${isCurrent ? " (actual)" : ""}`}
                  data-current={isCurrent ? "true" : undefined}
                  className={[
                    "grid h-7 w-7 place-items-center rounded-full transition-colors",
                    isCurrent
                      ? "ring-2 ring-[var(--color-ln-azul)]"
                      : "opacity-70 hover:opacity-100",
                  ].join(" ")}
                >
                  <LnStatusDot status={p.status} size={isCurrent ? "md" : "sm"} />
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => navigate(nextToken)}
          disabled={!nextToken}
          aria-label="Mascota siguiente"
          className="hidden h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] text-[var(--color-ln-mute)] transition-colors hover:text-[var(--color-ln-ink)] disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex"
        >
          <Icon name="chevron-right" size="sm" decorative />
        </button>
      </nav>

      {children}
    </div>
  );
}
