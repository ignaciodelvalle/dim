"use client";

// CarouselBandDots — the owner carousel's position dots, relocated INTO the
// blue document band (tarjeta-todo; PO principle: "siempre que podamos
// explicar con diseño puro, prefiero esa opción a más texto"). Pure design on
// the page: the old "Mostrando N de M mascotas" paragraph is gone — the dots
// group's aria-label carries that honest-cap disclosure (D2) for screen
// readers instead (a11y text is not visual text).
//
// Mounted by DocumentChrome on BOTH faces, OUTSIDE the aria-hidden band
// wrapper — the same established pattern as the turn button and the state
// chip — so the group and per-dot accessible names survive. A dot tap is a
// real NAVIGATION to that pet's route (PO decision 7: the URL follows), the
// same contract the removed top chrome had. Swipe/keyboard/prefetch behavior
// stays in PetCredentialCarousel, unchanged.

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

export function CarouselBandDots({ pets, currentToken, liveTotal }: Props) {
  const router = useRouter();

  const total = pets.length;
  const householdTotal = liveTotal ?? total;
  const groupLabel =
    householdTotal > total
      ? `Tus mascotas: mostrando ${total} de ${householdTotal}`
      : "Tus mascotas";

  return (
    // The dots strip stays a swipe zone (a drag across it navigates), like the
    // old chrome bar was.
    <nav aria-label={groupLabel} data-testid="pet-carousel-dots" data-swipe-zone>
      <ul className="flex items-center gap-1.5">
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
                  "grid h-4 w-4 place-items-center rounded-full transition-opacity",
                  // White ring on the band (not color alone: the current dot is
                  // also the larger size), translucent siblings.
                  isCurrent ? "ring-1 ring-white" : "opacity-60 hover:opacity-100",
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
