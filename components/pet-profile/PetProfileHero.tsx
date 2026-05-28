// PetProfileHero — top of the owner pet-profile page.
//
// Big square photo (148px) inside a state-colored ring; pet's identity
// below. Quick actions (Modo perdido / Compartir QR / Llamar vet) and the
// "Acciones" dropdown live OUTSIDE the hero — see `PetQuickActions` and
// `PetActionsMenu`. The hero is identity-only.
//
// State color follows the same convention as EventCatcher's chip row —
// ok / info / attention / urgent — so the same pet "reads" identical
// across the home and the profile.

import type { PetState } from "@/components/EventCatcher";

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
  ok: "from-gob-surface-alt to-transparent",
  info: "from-gob-info/10 to-transparent",
  attention: "from-gob-warning/10 to-transparent",
  urgent: "from-gob-danger/10 to-transparent",
};

const RING_BORDER: Record<PetState, string> = {
  ok: "ring-gob-border-strong ",
  info: "ring-gob-azul-link ",
  attention: "ring-gob-warning ",
  urgent: "ring-gob-danger ",
};

const BADGE: Record<PetState, string> = {
  ok: "bg-gob-surface-alt text-gob-text  ",
  info: "bg-gob-info text-white",
  attention: "bg-gob-warning text-gob-warning-text",
  urgent: "bg-gob-danger text-white",
};

export function PetProfileHero({ pet }: { pet: PetHeroPet }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gob-border bg-white p-5 text-center  ">
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${RING_BG[pet.state]} `}
      />

      <div className="relative mx-auto mb-3 inline-block">
        <span
          className={`flex h-[148px] w-[148px] items-center justify-center overflow-hidden rounded-full bg-white ring-[5px]  ${RING_BORDER[pet.state]}`}
        >
          {pet.photoUrl ? (
            <img src={pet.photoUrl} alt={pet.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-6xl font-semibold text-gob-text-gray ">
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

      <h1 className="relative mt-3 text-2xl font-semibold tracking-tight text-gob-text ">
        {pet.name}
      </h1>
      <p className="relative mt-1 text-sm text-gob-text-muted ">
        {[pet.species, pet.breed, pet.ageLabel, pet.weightLabel].filter(Boolean).join(" · ")}
      </p>
    </section>
  );
}
