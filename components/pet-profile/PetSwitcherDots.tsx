"use client";

// PetSwitcherDots — app-level navigation between the owner's live pets.
// PO correction (2026-07-18, reversing the tarjeta-todo dots-in-band
// placement): "El carousel lo quiero FUERA de la credencial. No tiene nada
// que ver la navegación en la app con la credencial digital de una
// mascota." The credential is ONE pet's document; switching between pets is
// a different, app-level layer — it now mounts in page.tsx ABOVE the
// credential card, in the page's own space, never touching the card's
// frame/band. (Formerly CarouselBandDots, which lived inside DocumentChrome's
// band.)
//
// Pure design on the page: no "Mostrando N de M" text — the group's
// aria-label carries the honest-cap disclosure (D2) for screen readers
// instead (a11y text is not visual text). A dot tap is a real NAVIGATION to
// that pet's route (PO decision 7: the URL follows).
//
// Swipe + keyboard navigation between pets is UNRELATED to this component —
// that behavior lives in PetCredentialCarousel (the transparent swipe
// wrapper around the credential card) and the window keydown listener, both
// unchanged by this move. This component is a plain tap-nav strip, not a
// swipe zone: it sits outside PetCredentialCarousel's gesture wrapper now
// that it is no longer squeezed inside the card.

import { useRouter } from "next/navigation";

import { LnStatusDot } from "@/components/ui/Chip";
import type { CarouselPet } from "@/lib/domain/owner-carousel";

type Props = {
  /** Ranked, capped live pets (urgent-first) — one dot each, in this order. */
  pets: CarouselPet[];
  /** The pet whose profile is currently rendered. */
  currentToken: string;
  /**
   * Total live pets in the household (D2). When it exceeds the capped dot
   * count, the group's aria-label discloses "mostrando N de M" — the visual
   * stays pure dots.
   */
  liveTotal?: number;
};

export function PetSwitcherDots({ pets, currentToken, liveTotal }: Props) {
  const router = useRouter();

  const total = pets.length;
  const householdTotal = liveTotal ?? total;
  const groupLabel =
    householdTotal > total
      ? `Tus mascotas: mostrando ${total} de ${householdTotal}`
      : "Tus mascotas";

  return (
    <nav aria-label={groupLabel} data-testid="pet-carousel-dots" className="ln-pet-switcher">
      <ul className="flex items-center justify-center gap-2.5">
        {pets.map((p, i) => {
          const isCurrent = p.token === currentToken;
          return (
            <li key={p.token} className="flex">
              <button
                type="button"
                onClick={() => {
                  if (!isCurrent) router.push(`/mis-mascotas/${p.token}`);
                }}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Mascota ${i + 1} de ${total}${isCurrent ? " (actual)" : ""}`}
                data-current={isCurrent ? "true" : undefined}
                className={[
                  "grid h-5 w-5 place-items-center rounded-full transition-opacity",
                  // Ring (not color alone) marks the current dot — the ring +
                  // offset must read against the page's paper background, not
                  // the band's blue (this nav no longer sits on the band).
                  isCurrent
                    ? "ring-2 ring-[var(--color-ln-azul)] ring-offset-2 ring-offset-[var(--color-ln-paper)]"
                    : "opacity-50 hover:opacity-100",
                ].join(" ")}
              >
                <LnStatusDot status={p.status} size={isCurrent ? "md" : "sm"} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
