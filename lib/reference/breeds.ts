// Breed lookups for the new-pet form.
//
// `POTENTIALLY_DANGEROUS_DOG_BREEDS` is the canonical "PPP" list per Argentine
// provincial laws (Ley CABA 4078, Ley Prov 14.107 and equivalents). When a
// pet is registered with a breed in this set, we set
// `pets.potentially_dangerous_breed = true` so projections and the eventual
// dangerous_breed_attested flow can find them quickly.
//
// `pets.breed` USED to be free text: the lists below only populated a
// <datalist>, and the header said "users can also type a breed not in the list
// — we just don't get the auto-flag if so". That sentence described a legal
// regime you could opt out of by spelling. On 2026-08-13 it had already
// happened: a dog recorded as "Pit Bull Terrier Americano" sat unflagged while
// an identical dog in the next barrio, under the same law, was flagged.
//
// The field is now a CATALOG SELECT (components/PetForm.tsx) and the stored
// values are normalised to these labels (scripts/repair-breeds.ts), so a breed
// off this list is a defect, not a shrug. `scripts/check-catalog-drift.ts`
// fails when one appears.
//
// Adding a breed here is cheap and expected — the alternative is flattening a
// real animal into "Pura raza no listada", which destroys information. Seven
// breeds were added on 2026-08-13 for exactly that reason (Shiba Inu, Cairn
// Terrier, Gran Danés, San Bernardo, Pastor Australiano, Pastor Suizo Blanco,
// Spinone Italiano). Adding to POTENTIALLY_DANGEROUS_DOG_BREEDS is NOT cheap:
// that set is the law's, not ours.

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
  "Cairn Terrier",
  "Cane Corso",
  "Caniche",
  "Chihuahua",
  "Cocker Spaniel",
  "Collie",
  "Doberman",
  "Dogo Argentino",
  "Dogo Canario (Presa Canario)",
  "Dálmata",
  "Fila Brasileiro",
  "Galgo",
  "Golden Retriever",
  "Gran Danés",
  "Husky Siberiano",
  "Jack Russell Terrier",
  "Labrador",
  "Maltés",
  "Mastín Napolitano",
  "Pastor Alemán",
  "Pastor Australiano",
  "Pastor Belga",
  "Pastor Suizo Blanco",
  "Pequinés",
  "Pit Bull Terrier",
  "Pomerania",
  "Pug",
  "Rottweiler",
  "Salchicha (Dachshund)",
  "San Bernardo",
  "Schnauzer",
  "Setter",
  "Shiba Inu",
  "Shih Tzu",
  "Spinone Italiano",
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

// Conejo y cobayo no tenían catálogo: `breedsForSpecies` devolvía sólo las dos
// opciones especiales, así que "Conejo común" y "Cobayo americano" —dos filas
// reales de staging, dos razas de verdad— no tenían dónde caer. Listas de
// arranque, cortas a propósito y pensadas para crecer cuando aparezcan datos:
// agregar una entrada acá es barato, aplastar un animal a "Pura raza no
// listada" no se deshace.
export const RABBIT_BREEDS = [
  "Angora",
  "Belier (Lop)",
  "Cabeza de León",
  "Común",
  "Gigante de Flandes",
  "Holandés enano",
  "Mini Rex",
];

export const GUINEA_PIG_BREEDS = ["Abisinio", "Americano", "Coronet", "Peruano", "Rex", "Sheltie"];

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
 * Keys are already normalised. Every value MUST be a label that appears in one
 * of the catalogs, so an alias can never invent a breed — it only spells an
 * existing one the way people actually write it. Guarded by
 * `breeds-matching.test.ts`, which fails if a value falls off the catalogs.
 *
 * Not only PPP: "Ovejero Alemán" is what most of Argentina calls a Pastor
 * Alemán, and it appeared twice in staging under two different capitalisations.
 */
const BREED_ALIASES: Readonly<Record<string, string>> = {
  pitbull: "Pit Bull Terrier",
  pitbullamericano: "American Pit Bull Terrier",
  americanpitbull: "American Pit Bull Terrier",
  // Castellanised word order. Found UNFLAGGED in staging on 2026-08-13 — a real
  // dog in CABA/Palermo whose breed reads "Pit Bull Terrier Americano" and
  // whose potentially_dangerous_breed was false, while an identical dog in
  // CABA/Recoleta was flagged. Under the same law. This entry is also the
  // clearest argument that a curated list is a stopgap: nothing about the
  // matcher predicted this spelling, a human had to find it in the data.
  pitbullterrieramericano: "American Pit Bull Terrier",
  terrieramericanopitbull: "American Pit Bull Terrier",
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

  // No-PPP: nombres coloquiales o comerciales que aparecieron en los datos
  // reales de staging. Ninguno cambia la clasificación legal de nada.
  ovejeroaleman: "Pastor Alemán",
  ovejero: "Pastor Alemán",
  pastoralemanovejero: "Pastor Alemán",
  canichetoy: "Caniche",
  poodle: "Caniche",
  salchicha: "Salchicha (Dachshund)",
  dachshund: "Salchicha (Dachshund)",
  labradorretriever: "Labrador",
  greyhound: "Galgo",
  galgogreyhound: "Galgo",
  roughcollie: "Collie",
  scotchcollie: "Collie",
  grandanes: "Gran Danés",
  pastoraustralianoblueheeler: "Pastor Australiano",
  blueheeler: "Pastor Australiano",
  conejocomun: "Común",
  cobayoamericano: "Americano",

  // Palabras que todo el país usa para un perro sin raza definida. Importan
  // desde que el servidor RECHAZA razas fuera de catálogo (QA A4, 2026-08-13):
  // sin estos alias, "mestizo" — la respuesta más honesta que puede dar un
  // dueño — rebotaría con "elegí de la lista" en vez de resolver a la opción
  // que significa exactamente eso.
  mestizo: "Mixto / Cruza",
  mestiza: "Mixto / Cruza",
  cruza: "Mixto / Cruza",
};

/**
 * Resolve free-typed breed text to the catalog label it means, or null.
 * Exported so the jurisdiction-aware server variant matches identically — one
 * matcher, two call sites, no chance of them drifting apart.
 */
export function resolveBreedLabel(breed: string): string | null {
  const key = normalizeBreedKey(breed);
  if (!key) return null;
  const alias = BREED_ALIASES[key];
  if (alias) return alias;
  // Los TRES catálogos, no sólo el de perros. Buscar únicamente en DOG_BREEDS
  // dejaba sin resolver toda raza de gato ("Común europeo", 6 filas en staging)
  // y las dos opciones especiales — que son valores perfectamente válidos.
  for (const candidate of ALL_BREEDS) {
    if (normalizeBreedKey(candidate) === key) return candidate;
  }
  return null;
}

/**
 * Toda etiqueta de raza válida, de cualquier especie. Es la referencia del
 * auditor de catálogo y del reparador: un valor guardado fuera de este conjunto
 * es un defecto, no una variante.
 */
export const ALL_BREEDS: readonly string[] = [
  ...SPECIAL_BREED_OPTIONS,
  ...DOG_BREEDS,
  ...CAT_BREEDS,
  ...RABBIT_BREEDS,
  ...GUINEA_PIG_BREEDS,
];

/** True when `label` is in `list`, compared by normalised key. */
export function breedListIncludes(list: Iterable<string>, label: string): boolean {
  const key = normalizeBreedKey(label);
  for (const entry of list) {
    if (normalizeBreedKey(entry) === key) return true;
  }
  return false;
}

/**
 * Like `breedListIncludes`, but resolves BOTH sides through the alias matcher
 * before folding. A jurisdiction's admin-stored list entry can itself be a
 * colloquial form ("Pitbull"): key-folding alone never matches it against the
 * canonical stored label ("Pit Bull Terrier"), because folding cannot make a
 * short name equal a long one — the same two-failure split the header above
 * describes, replayed on the LIST side. That asymmetry dropped a dog out of
 * the legal regime by the ADMIN's spelling (adversarial review 2026-08-14).
 * Resolution is conservative both ways: an unresolvable side falls back to
 * its own folded key, so this can only ever equate names the curated alias
 * table already declares equivalent — it never widens by substring.
 */
export function breedListIncludesResolved(list: Iterable<string>, label: string): boolean {
  const key = normalizeBreedKey(resolveBreedLabel(label) ?? label);
  for (const entry of list) {
    if (normalizeBreedKey(resolveBreedLabel(entry) ?? entry) === key) return true;
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
  const named =
    species === "cat"
      ? CAT_BREEDS
      : species === "dog"
        ? DOG_BREEDS
        : species === "rabbit"
          ? RABBIT_BREEDS
          : species === "guinea_pig"
            ? GUINEA_PIG_BREEDS
            : [];
  return [...SPECIAL_BREED_OPTIONS, ...named];
}
