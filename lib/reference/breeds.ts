// Breed lookups for the new-pet form.
//
// `POTENTIALLY_DANGEROUS_DOG_BREEDS` is the canonical "PPP" list per Argentine
// provincial laws (Ley CABA 4078, Ley Prov 14.107 and equivalents). When a
// pet is registered with a breed in this set, we set
// `pets.potentially_dangerous_breed = true` so projections and the eventual
// dangerous_breed_attested flow can find them quickly.
//
// Breed names are stored as free text on `pets.breed`. The lists below
// populate the autocomplete <datalist> on the new-pet form. Users can also
// type a breed not in the list — we just don't get the auto-flag if so.

export const SPECIAL_BREED_OPTIONS = ["Mixto / Cruza", "Pura raza no listada"] as const;

export const DOG_BREEDS = [
  "Akita Inu",
  "American Pit Bull Terrier",
  "American Staffordshire Terrier",
  "Beagle",
  "Bichón Frisé",
  "Border Collie",
  "Boxer",
  "Bull Terrier",
  "Bulldog Francés",
  "Bulldog Inglés",
  "Bullmastiff",
  "Cane Corso",
  "Caniche",
  "Chihuahua",
  "Cocker Spaniel",
  "Collie",
  "Dálmata",
  "Doberman",
  "Dogo Argentino",
  "Dogo Canario (Presa Canario)",
  "Fila Brasileiro",
  "Galgo",
  "Golden Retriever",
  "Husky Siberiano",
  "Jack Russell Terrier",
  "Labrador",
  "Maltés",
  "Mastín Napolitano",
  "Pastor Alemán",
  "Pastor Belga",
  "Pequinés",
  "Pit Bull Terrier",
  "Pomerania",
  "Pug",
  "Rottweiler",
  "Salchicha (Dachshund)",
  "Schnauzer",
  "Setter",
  "Shih Tzu",
  "Staffordshire Bull Terrier",
  "Tosa Inu",
  "Yorkshire Terrier",
];

export const CAT_BREEDS = [
  "Abisinio",
  "Bengala",
  "Birmano",
  "British Shorthair",
  "Burmés",
  "Común europeo",
  "Maine Coon",
  "Noruego del Bosque",
  "Oriental",
  "Persa",
  "Ragdoll",
  "Russian Blue",
  "Scottish Fold",
  "Siamés",
  "Sphynx",
];

export const POTENTIALLY_DANGEROUS_DOG_BREEDS: ReadonlySet<string> = new Set([
  "Akita Inu",
  "American Pit Bull Terrier",
  "American Staffordshire Terrier",
  "Bull Terrier",
  "Bullmastiff",
  "Cane Corso",
  "Doberman",
  "Dogo Argentino",
  "Dogo Canario (Presa Canario)",
  "Fila Brasileiro",
  "Mastín Napolitano",
  "Pit Bull Terrier",
  "Rottweiler",
  "Staffordshire Bull Terrier",
  "Tosa Inu",
]);

// ---------------------------------------------------------------------------
// Breed matching — why it is not string equality
// ---------------------------------------------------------------------------
//
// `pets.breed` is free text (see the header note above), and PPP classification
// used to be `SET.has(breed.trim())`. That is exact, case-sensitive, accent-
// sensitive equality, so an owner who typed "pitbull" or "Mastin Napolitano"
// fell out of a LEGAL regime in silence — no warning, no flag, no row in the
// compliance panel. The staging clickthrough of 2026-08-13 hit exactly this:
// "Pitbull" did not match "Pit Bull Terrier" and the PPP requirement simply
// disappeared from the pet's compliance list (denominator went 4 → 3).
//
// Two different failures were hiding under one symptom, and they need two
// different fixes:
//
//   1. ORTHOGRAPHIC variants — "PITBULL", "Mastin Napolitano", "Dogo  Argentino".
//      Same name, different spelling. `normalizeBreedKey` folds case, accents
//      and separators, so these match.
//
//   2. COLLOQUIAL names — "Pitbull" vs the catalog's "Pit Bull Terrier".
//      Folding does NOT fix these ("pitbull" ≠ "pitbullterrier"); no amount of
//      normalisation makes a short name equal a long one. They need an explicit,
//      curated alias list, which is what `PPP_BREED_ALIASES` is. Curated on
//      purpose: substring matching would classify by accident.
//
// Both are deliberately conservative. Nothing here widens the PPP set — an alias
// only ever resolves to a name that must STILL be present in the effective
// jurisdiction list for the pet to be flagged.

/** Fold a breed label for comparison: case, accents and separators. */
export function normalizeBreedKey(breed: string): string {
  return breed
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Colloquial Argentine names → the catalog label they mean.
 *
 * Keys are already normalised. Every value MUST be a label that appears in
 * `DOG_BREEDS`, so an alias can never invent a breed — it only spells an
 * existing one the way people actually write it.
 */
const PPP_BREED_ALIASES: Readonly<Record<string, string>> = {
  pitbull: "Pit Bull Terrier",
  pitbullamericano: "American Pit Bull Terrier",
  americanpitbull: "American Pit Bull Terrier",
  amstaff: "American Staffordshire Terrier",
  americanstaffordshire: "American Staffordshire Terrier",
  staffordshire: "Staffordshire Bull Terrier",
  staffy: "Staffordshire Bull Terrier",
  presacanario: "Dogo Canario (Presa Canario)",
  dogocanario: "Dogo Canario (Presa Canario)",
  dogo: "Dogo Argentino",
  fila: "Fila Brasileiro",
  mastinnapolitano: "Mastín Napolitano",
  napolitano: "Mastín Napolitano",
  canecorso: "Cane Corso",
  dobermann: "Doberman",
  rotweiler: "Rottweiler",
  rottweilers: "Rottweiler",
  akita: "Akita Inu",
  tosa: "Tosa Inu",
};

/**
 * Resolve free-typed breed text to the catalog label it means, or null.
 * Exported so the jurisdiction-aware server variant matches identically — one
 * matcher, two call sites, no chance of them drifting apart.
 */
export function resolveBreedLabel(breed: string): string | null {
  const key = normalizeBreedKey(breed);
  if (!key) return null;
  const alias = PPP_BREED_ALIASES[key];
  if (alias) return alias;
  for (const candidate of DOG_BREEDS) {
    if (normalizeBreedKey(candidate) === key) return candidate;
  }
  return null;
}

/** True when `label` is in `list`, compared by normalised key. */
export function breedListIncludes(list: Iterable<string>, label: string): boolean {
  const key = normalizeBreedKey(label);
  for (const entry of list) {
    if (normalizeBreedKey(entry) === key) return true;
  }
  return false;
}

export function isPotentiallyDangerousBreed(
  species: string | null | undefined,
  breed: string | null | undefined,
): boolean {
  if (species !== "dog" || !breed) return false;
  const resolved = resolveBreedLabel(breed) ?? breed;
  return breedListIncludes(POTENTIALLY_DANGEROUS_DOG_BREEDS, resolved);
}

// Server-side jurisdiction-aware variant moved to `lib/breeds-server.ts`
// so that client components can import the catalogs above without
// pulling in `db` via the business-rules-resolver.

export function breedsForSpecies(species: string): string[] {
  const named = species === "cat" ? CAT_BREEDS : species === "dog" ? DOG_BREEDS : [];
  return [...SPECIAL_BREED_OPTIONS, ...named];
}
