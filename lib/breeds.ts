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

export function isPotentiallyDangerousBreed(
  species: string | null | undefined,
  breed: string | null | undefined,
): boolean {
  if (species !== "dog" || !breed) return false;
  return POTENTIALLY_DANGEROUS_DOG_BREEDS.has(breed.trim());
}

/**
 * Jurisdiction-aware variant that consults the govt_business_rules resolver
 * (spec 2026-05-19-govt-business-rules-poc-design §4.3). Returns whether
 * `breed` is in the *effective* PPP list for the given location. Defaults
 * to the country-wide AR list when no override row exists.
 *
 * Use this in server actions that persist `pets.potentially_dangerous_breed`
 * — the synchronous variant above is kept for client-side UX (warning the
 * owner inline while typing).
 */
export async function isPotentiallyDangerousBreedForJurisdiction(
  species: string | null | undefined,
  breed: string | null | undefined,
  jurisdiction: { country?: string; province?: string | null; locality?: string | null },
): Promise<boolean> {
  if (species !== "dog" || !breed) return false;
  const { resolveBusinessRule } = await import("./business-rules-resolver");
  const rule = await resolveBusinessRule("ppp_breed_list", jurisdiction);
  return rule.payload.breeds.includes(breed.trim());
}

export function breedsForSpecies(species: string): string[] {
  const named = species === "cat" ? CAT_BREEDS : species === "dog" ? DOG_BREEDS : [];
  return [...SPECIAL_BREED_OPTIONS, ...named];
}
