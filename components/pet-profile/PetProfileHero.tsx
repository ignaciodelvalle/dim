import Link from "next/link";

import { Button } from "@/components/poncho";
import type { PetState } from "@/components/EventCatcher";

// PetProfileHero — top of the owner pet-profile page.
//
// Big square photo (148px) inside a state-colored ring; pet's identity
// below; primary actions (Modo perdido, Compartir QR, Llamar vet).
//
// State color follows the same convention as EventCatcher's chip row —
// ok / info / attention / urgent — so the same pet "reads" identical
// across the home and the profile.
//
// Spec: docs/pet-profile-owner-plan-2026-05-20.md — owner view.

export type PetHeroPet = {
  name: string;
  publicToken: string;
  photoUrl: string | null;
  species: string;
  breed?: string | null;
  ageLabel: string;
  weightLabel?: string | null;
  state: PetState;
  stateLabel?: string | null;
  /** Quick toggle: is lost mode active right now? */
  lostMode: boolean;
};

const RING_BG: Record<PetState, string> = {
  ok: "from-neutral-100 to-transparent",
  info: "from-blue-100 to-transparent",
  attention: "from-amber-100 to-transparent",
  urgent: "from-red-100 to-transparent",
};

const RING_BORDER: Record<PetState, string> = {
  ok: "ring-neutral-200 dark:ring-neutral-700",
  info: "ring-blue-500 dark:ring-blue-400",
  attention: "ring-amber-500 dark:ring-amber-400",
  urgent: "ring-red-500 dark:ring-red-400",
};

const BADGE: Record<PetState, string> = {
  ok: "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100",
  info: "bg-blue-500 text-white",
  attention: "bg-amber-500 text-amber-900",
  urgent: "bg-red-600 text-white",
};

export function PetProfileHero({ pet }: { pet: PetHeroPet }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 text-center dark:border-neutral-800 dark:bg-neutral-950">
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${RING_BG[pet.state]} dark:opacity-30`}
      />

      <div className="relative mx-auto mb-3 inline-block">
        <span
          className={`flex h-[148px] w-[148px] items-center justify-center overflow-hidden rounded-full bg-white ring-[5px] dark:bg-neutral-900 ${RING_BORDER[pet.state]}`}
        >
          {pet.photoUrl ? (
            <img src={pet.photoUrl} alt={pet.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-6xl font-semibold text-neutral-600 dark:text-neutral-300">
              {pet.name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        {pet.stateLabel && (
          <span
            className={`absolute left-1/2 -translate-x-1/2 translate-y-1/3 whitespace-nowrap rounded-full px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${BADGE[pet.state]}`}
          >
            {pet.stateLabel}
          </span>
        )}
      </div>

      <h1 className="relative mt-3 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
        {pet.name}
      </h1>
      <p className="relative mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {[pet.species, pet.breed, pet.ageLabel, pet.weightLabel]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="relative mt-4 flex flex-wrap justify-center gap-2">
        <Button
          variant={pet.lostMode ? "primary" : "danger"}
          size="sm"
          // eslint-disable-next-line @next/next/no-link-as-button
          onClick={() => {
            /* server action wired by parent */
          }}
        >
          {pet.lostMode ? "Mascota encontrada" : "Modo perdido"}
        </Button>
        <Link
          href={`/p/${pet.publicToken}`}
          className="inline-flex min-h-9 items-center rounded-full bg-gob-primary px-4 text-sm font-semibold text-white hover:bg-gob-primary-hover"
        >
          Compartir QR
        </Link>
        <Link
          href={`/mis-mascotas/${pet.publicToken}/editar`}
          className="inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold text-gob-azul-link hover:underline"
        >
          Editar
        </Link>
      </div>
    </section>
  );
}
