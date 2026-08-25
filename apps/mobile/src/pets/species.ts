// es-AR names for the species vocabulary, and the reason there is no icon here.
//
// The list payload carries `species` as a plain `string` — the contract types it
// that way because the column is a string and the endpoint does not narrow it —
// so this function cannot be exhaustive over an enum and must handle a value it
// does not know. It returns the RAW value in that case rather than "Otro":
// showing a user "Otro" for an animal the server called `chinchilla` hides a
// gap in this app behind a word that looks deliberate.
//
// WHY A WORD AND NOT AN ICON. A species glyph at list size is a guessing game
// (a ferret and a rabbit are the same silhouette at 20px), and this list already
// carries a photo slot for recognition. The word is unambiguous, translatable
// and readable by a screen reader. When there is a real icon set with real
// drawings, it goes BESIDE this label, not instead of it.

import { PET_SPECIES, type PetSpecies } from "@dim/contract/input";

const LABELS: Record<PetSpecies, string> = {
  dog: "Perro",
  cat: "Gato",
  rabbit: "Conejo",
  guinea_pig: "Cobayo",
  ferret: "Hurón",
  other: "Otro",
};

const KNOWN: ReadonlySet<string> = new Set(PET_SPECIES);

/** The es-AR name, or the server's own value when this build does not know it. */
export function speciesLabel(species: string): string {
  const key = species.trim();
  return KNOWN.has(key) ? LABELS[key as PetSpecies] : key;
}

/** The species picker's options, in the order a citizen wallet should show them. */
export const SPECIES_OPTIONS: ReadonlyArray<{ value: PetSpecies; label: string }> = PET_SPECIES.map(
  (value) => ({ value, label: LABELS[value] }),
);
