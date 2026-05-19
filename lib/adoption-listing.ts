// Adoption listing projection (spec 2026-05-18 adoption-listing-public v1.3).
//
// `queryAdoptionListing` is the single source of truth for the /adoptar
// public feed and the per-org sub-feed. All visibility guards live here:
// listed-not-paused, shelter_custody by verified shelter/rescue_network,
// status not in (deceased, lost), adoption_eligible=true, no custody
// dispute, no active rabies observation. The shape is `(items, nextCursor)`
// keyset by (adoption_listed_at DESC, id DESC) so concurrent inserts don't
// shift the cursor under a paginating client.

import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";

import { attachments, db, organizations, ownerships, pets } from "@/db";

// ---------------------------------------------------------------------------
// Catalogs (kept here so consumers — page, form, filters bar — import from
// one place; labels are es-AR and intentionally separate from DB values)
// ---------------------------------------------------------------------------

export const ADOPTION_AGE_BUCKETS = ["puppy", "junior", "young", "adult", "senior"] as const;
export type AgeBucket = (typeof ADOPTION_AGE_BUCKETS)[number];

export const ADOPTION_SIZE_ESTIMATES = ["small", "medium", "large", "xl"] as const;
export type SizeEstimate = (typeof ADOPTION_SIZE_ESTIMATES)[number];

export const ADOPTION_ENERGY_LEVELS = ["low", "medium", "high"] as const;
export type EnergyLevel = (typeof ADOPTION_ENERGY_LEVELS)[number];

// Age-bucket label resolution honors `sex` for grammatical gender.
// `unknown` falls back to masculine to avoid inventing a gender — matches
// how Argentine refugios speak when the perro/perra isn't disambiguated.
export function ageBucketLabel(bucket: AgeBucket, sex: string): string {
  const feminine = sex === "female";
  switch (bucket) {
    case "puppy":
      return feminine ? "Cachorra" : "Cachorro";
    case "junior":
      return "Junior";
    case "young":
      return "Joven";
    case "adult":
      return feminine ? "Adulta" : "Adulto";
    case "senior":
      return feminine ? "Adulta mayor (Senior)" : "Adulto mayor (Senior)";
  }
}

export function sizeLabel(size: SizeEstimate): string {
  switch (size) {
    case "small":
      return "Chico";
    case "medium":
      return "Mediano";
    case "large":
      return "Grande";
    case "xl":
      return "Extra grande";
  }
}

export function energyLabel(energy: EnergyLevel): string {
  switch (energy) {
    case "low":
      return "Tranquilo/a";
    case "medium":
      return "Moderado/a";
    case "high":
      return "Activo/a";
  }
}

// ---------------------------------------------------------------------------
// Filters + cursor
// ---------------------------------------------------------------------------

export type AdoptionListingFilters = {
  species?: string;
  province?: string;
  locality?: string;
  ageBucket?: AgeBucket;
  sizeEstimate?: SizeEstimate;
  energyLevel?: EnergyLevel;
  goodWithKids?: boolean;
  goodWithDogs?: boolean;
  goodWithCats?: boolean;
  needsYard?: boolean;
  hasMicrochip?: boolean;
  organizationToken?: string;
};

export type AdoptionListingCursor = {
  listedAt: string; // ISO
  id: string;
};

export type AdoptionListingItem = {
  petId: string;
  petPublicToken: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string;
  color: string | null;
  primaryPhotoId: string | null;
  primaryPhotoStoragePath: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  microchipId: string | null;
  adoptionListedAt: Date;
  adoptionStory: string | null;
  adoptionRequirements: string | null;
  adoptionEnergyLevel: EnergyLevel | null;
  adoptionSizeEstimate: SizeEstimate | null;
  adoptionAgeBucket: AgeBucket | null;
  adoptionGoodWithKids: boolean | null;
  adoptionGoodWithDogs: boolean | null;
  adoptionGoodWithCats: boolean | null;
  adoptionNeedsYard: boolean | null;
  adoptionFeeArs: number | null;
  orgId: string;
  orgPublicToken: string;
  orgDisplayName: string;
  orgAvatarUrl: string | null;
  // Derived booleans for card badges. The presence of an event is the
  // source of truth — we don't materialize these on `pets` because
  // recompute-from-events is cheap and there is no surface that needs
  // them outside the listing.
  isSterilized: boolean;
};

const DEFAULT_PAGE_SIZE = 24;

export async function queryAdoptionListing(
  filters: AdoptionListingFilters,
  cursor: AdoptionListingCursor | null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<{ items: AdoptionListingItem[]; nextCursor: AdoptionListingCursor | null }> {
  const conditions = [
    isNotNull(pets.adoptionListedAt),
    isNull(pets.adoptionListingPausedAt),

    // D18 — pet status guard. We can't use `notInArray(pets.status, [...])`
    // because pets.status is a `text` column with no enum in Drizzle's eyes;
    // a pair of `ne` is equivalent and avoids the type cast.
    ne(pets.status, "deceased"),
    ne(pets.status, "lost"),

    // D19 — cross-spec with foster-volunteers v1.4 — only marked apta.
    eq(pets.adoptionEligible, true),

    // D20 — cross-spec with custody-disputes — must not be locked.
    or(isNull(pets.inCustodyDispute), eq(pets.inCustodyDispute, false)),

    // D21 — cross-spec with bite-rabies-observation — exclude the
    // 10-day quarantine window. The real enum value is "in_progress"
    // (the spec draft said "active"; aligning here with the actual
    // CHECK constraint from migration 0021).
    or(isNull(pets.rabiesObservationStatus), ne(pets.rabiesObservationStatus, "in_progress")),

    // Custody by a verified shelter / rescue_network. Active ownership row.
    isNull(ownerships.endedAt),
    eq(ownerships.role, "shelter_custody"),
    eq(organizations.verified, true),
    inArray(organizations.orgType, ["shelter", "rescue_network"]),
  ];

  // Optional filters.
  if (filters.species) conditions.push(eq(pets.species, filters.species));
  if (filters.province) conditions.push(eq(pets.jurisdictionProvince, filters.province));
  if (filters.locality) conditions.push(eq(pets.jurisdictionLocality, filters.locality));
  if (filters.ageBucket) conditions.push(eq(pets.adoptionAgeBucket, filters.ageBucket));
  if (filters.sizeEstimate) conditions.push(eq(pets.adoptionSizeEstimate, filters.sizeEstimate));
  if (filters.energyLevel) conditions.push(eq(pets.adoptionEnergyLevel, filters.energyLevel));
  if (filters.goodWithKids === true) conditions.push(eq(pets.adoptionGoodWithKids, true));
  if (filters.goodWithDogs === true) conditions.push(eq(pets.adoptionGoodWithDogs, true));
  if (filters.goodWithCats === true) conditions.push(eq(pets.adoptionGoodWithCats, true));
  // needsYard=false means "available WITHOUT yard requirement" — null is
  // tolerated because "we don't know" doesn't disqualify the pet.
  if (filters.needsYard === false) {
    conditions.push(or(eq(pets.adoptionNeedsYard, false), isNull(pets.adoptionNeedsYard)));
  }
  if (filters.hasMicrochip === true) conditions.push(isNotNull(pets.microchipId));
  if (filters.hasMicrochip === false) conditions.push(isNull(pets.microchipId));
  if (filters.organizationToken) {
    conditions.push(eq(organizations.publicToken, filters.organizationToken));
  }

  // Keyset cursor.
  if (cursor) {
    const cursorDate = new Date(cursor.listedAt);
    conditions.push(
      or(
        lt(pets.adoptionListedAt, cursorDate),
        and(eq(pets.adoptionListedAt, cursorDate), lt(pets.id, cursor.id)),
      ),
    );
  }

  const rows = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
      breed: pets.breed,
      sex: pets.sex,
      color: pets.color,
      primaryPhotoId: pets.primaryPhotoId,
      primaryPhotoStoragePath: attachments.storagePath,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
      microchipId: pets.microchipId,
      adoptionListedAt: pets.adoptionListedAt,
      adoptionStory: pets.adoptionStory,
      adoptionRequirements: pets.adoptionRequirements,
      adoptionEnergyLevel: pets.adoptionEnergyLevel,
      adoptionSizeEstimate: pets.adoptionSizeEstimate,
      adoptionAgeBucket: pets.adoptionAgeBucket,
      adoptionGoodWithKids: pets.adoptionGoodWithKids,
      adoptionGoodWithDogs: pets.adoptionGoodWithDogs,
      adoptionGoodWithCats: pets.adoptionGoodWithCats,
      adoptionNeedsYard: pets.adoptionNeedsYard,
      adoptionFeeArs: pets.adoptionFeeArs,
      orgId: organizations.id,
      orgPublicToken: organizations.publicToken,
      orgDisplayName: organizations.displayName,
      // organizations doesn't have an avatar column today; expose null and
      // a future spec can backfill without changing this interface.
      orgAvatarUrl: sql<string | null>`NULL`,
      isSterilized: sql<boolean>`EXISTS (
        SELECT 1 FROM pet_events e
        WHERE e.pet_id = ${pets.id}
          AND e.event_type = 'sterilization_performed'
      )`,
    })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(and(...conditions))
    .orderBy(desc(pets.adoptionListedAt), desc(pets.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const items = (hasMore ? rows.slice(0, pageSize) : rows) as AdoptionListingItem[];
  const last = items.at(-1);
  const nextCursor: AdoptionListingCursor | null =
    hasMore && last?.adoptionListedAt
      ? { listedAt: last.adoptionListedAt.toISOString(), id: last.petId }
      : null;

  return { items, nextCursor };
}

// ---------------------------------------------------------------------------
// Search params codec — URL is source of truth (D11)
// ---------------------------------------------------------------------------

export function parseSearchParams(params: Record<string, string | string[] | undefined>): {
  filters: AdoptionListingFilters;
  cursor: AdoptionListingCursor | null;
} {
  const filters: AdoptionListingFilters = {};
  const pick = (k: string): string | undefined => {
    const v = params[k];
    if (Array.isArray(v)) return v[0];
    return v;
  };

  const species = pick("species");
  if (species) filters.species = species;
  const province = pick("provincia");
  if (province) filters.province = province;
  const locality = pick("localidad");
  if (locality) filters.locality = locality;

  const ageBucket = pick("edad");
  if (ageBucket && (ADOPTION_AGE_BUCKETS as readonly string[]).includes(ageBucket)) {
    filters.ageBucket = ageBucket as AgeBucket;
  }
  const sizeEstimate = pick("talle");
  if (sizeEstimate && (ADOPTION_SIZE_ESTIMATES as readonly string[]).includes(sizeEstimate)) {
    filters.sizeEstimate = sizeEstimate as SizeEstimate;
  }
  const energyLevel = pick("energia");
  if (energyLevel && (ADOPTION_ENERGY_LEVELS as readonly string[]).includes(energyLevel)) {
    filters.energyLevel = energyLevel as EnergyLevel;
  }

  if (pick("con_chicos") === "true") filters.goodWithKids = true;
  if (pick("con_perros") === "true") filters.goodWithDogs = true;
  if (pick("con_gatos") === "true") filters.goodWithCats = true;
  if (pick("sin_patio") === "true") filters.needsYard = false;
  if (pick("con_chip") === "true") filters.hasMicrochip = true;

  const org = pick("org");
  if (org) filters.organizationToken = org;

  // Cursor is encoded as "<ISO>|<uuid>"
  const cursorRaw = pick("cursor");
  let cursor: AdoptionListingCursor | null = null;
  if (cursorRaw) {
    const [iso, id] = cursorRaw.split("|");
    if (iso && id) cursor = { listedAt: iso, id };
  }

  return { filters, cursor };
}

export function buildSearchParams(
  filters: AdoptionListingFilters,
  cursor: AdoptionListingCursor | null,
): URLSearchParams {
  const out = new URLSearchParams();
  if (filters.species) out.set("species", filters.species);
  if (filters.province) out.set("provincia", filters.province);
  if (filters.locality) out.set("localidad", filters.locality);
  if (filters.ageBucket) out.set("edad", filters.ageBucket);
  if (filters.sizeEstimate) out.set("talle", filters.sizeEstimate);
  if (filters.energyLevel) out.set("energia", filters.energyLevel);
  if (filters.goodWithKids) out.set("con_chicos", "true");
  if (filters.goodWithDogs) out.set("con_perros", "true");
  if (filters.goodWithCats) out.set("con_gatos", "true");
  if (filters.needsYard === false) out.set("sin_patio", "true");
  if (filters.hasMicrochip === true) out.set("con_chip", "true");
  if (filters.organizationToken) out.set("org", filters.organizationToken);
  if (cursor) out.set("cursor", `${cursor.listedAt}|${cursor.id}`);
  return out;
}
