/**
 * DIM Performance / Volume Seed — seed-perf.ts
 *
 * Creates ~2 000 synthetic pets attached to owner@dim.test for performance
 * and pagination testing. All perf pets are prefixed with "PERF-" so they
 * can be found and cleaned up reliably.
 *
 * ─── PERF- TAG CONTRACT ────────────────────────────────────────────────────
 *   Every pet's `name` starts with "PERF-" followed by a zero-padded
 *   six-digit index (e.g. "PERF-000042 Firulais"). Cleanup (--clean) keys
 *   off `name LIKE 'PERF-%'` on the `pets` table and cascades through FK-
 *   dependent tables in safe order: pet_events → cases → ownerships → pets.
 *
 * ─── IDEMPOTENCY KEY ───────────────────────────────────────────────────────
 *   Deterministic publicToken: "PERF-<zero-padded-index>" (e.g. "PERF-000042").
 *   Re-running with the same --count skips pets whose token already exists.
 *   New runs with a higher --count add only the missing range.
 *
 * ─── CLI FLAGS ─────────────────────────────────────────────────────────────
 *   --count=N      Total pets to create (default 2000).
 *   --allow-remote Required to target a non-local DB (staging).
 *   --clean        Delete ALL perf-tagged data (FK-safe order) then exit.
 *   --dry-run      Print plan and exit without writing.
 *
 * ─── LOCAL-ONLY GUARD ──────────────────────────────────────────────────────
 *   Refuses to run against a non-local DATABASE_URL host unless --allow-remote
 *   is passed. ALWAYS refuses when NODE_ENV=production.
 *   Allowed local hosts: 127.0.0.1, localhost, host.docker.internal, ::1.
 *
 * ─── RUN COMMANDS ──────────────────────────────────────────────────────────
 *   # Local validation first (small count):
 *   pnpm seed:perf -- --count=50
 *
 *   # Full local run:
 *   pnpm seed:perf
 *
 *   # Staging (requires explicit opt-in):
 *   pnpm seed:perf -- --allow-remote --count=2000
 *
 *   # Cleanup (safe to run repeatedly):
 *   pnpm seed:perf -- --clean
 *   pnpm seed:perf -- --clean --allow-remote   # staging cleanup
 *
 * Validated against a local Supabase stack (--count=50): pets/events/cases
 * created, idempotent re-run, and --clean all confirmed working. Still
 * recommend a small --count when first pointing at a fresh remote.
 */

// ---------------------------------------------------------------------------
// 1. Env bootstrap (must run before db/index.ts is imported)
// ---------------------------------------------------------------------------

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ---------------------------------------------------------------------------
// 2. Parse CLI flags early (some drive the safety guard below)
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function getFlag(name: string): string | null {
  for (const arg of argv) {
    const prefix = `--${name}=`;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return null;
}

const COUNT = Number(getFlag("count") ?? "2000");
const ALLOW_REMOTE = argv.includes("--allow-remote");
const CLEAN = argv.includes("--clean");
const DRY_RUN = argv.includes("--dry-run");

if (!Number.isInteger(COUNT) || COUNT < 1) {
  console.error(`[FAIL] --count must be a positive integer, got: ${getFlag("count")}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 3. Safety guards (mirrors db-bootstrap.ts and seed-test-users.ts patterns)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal", "::1"]);

function parsePgHost(url: string): string | null {
  const match = url.match(/^postgres(?:ql)?:\/\/[^@]+@([^:/]+)/);
  return match ? match[1] : null;
}

if (!CLEAN && !DRY_RUN) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — aborting.",
    );
    process.exit(2);
  }
  if (!DATABASE_URL) {
    console.error("Missing DATABASE_URL in .env.local — aborting.");
    process.exit(2);
  }
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV=production. Aborting.");
  process.exit(2);
}

const dbHost = DATABASE_URL ? parsePgHost(DATABASE_URL) : null;
const isLocalDb = dbHost ? LOCAL_HOSTS.has(dbHost) : true; // if no URL yet, let it fail at import
const isLocalSupabase =
  !SUPABASE_URL || SUPABASE_URL.includes("127.0.0.1") || SUPABASE_URL.includes("localhost");

if (!ALLOW_REMOTE && (!isLocalDb || !isLocalSupabase)) {
  console.error(
    [
      "",
      "==============================================================",
      "  ABORT: seed-perf target is NOT a local Postgres / Supabase.",
      "==============================================================",
      `  DATABASE_URL host : ${dbHost ?? "(not set)"}`,
      `  SUPABASE_URL      : ${SUPABASE_URL}`,
      `  Allowed local hosts: ${[...LOCAL_HOSTS].join(", ")}`,
      "",
      "  This script inserts thousands of rows. Running it against a",
      "  remote DB by mistake is a real incident.",
      "",
      "  If you meant to target this host, re-run with --allow-remote.",
      "  Otherwise edit .env.local to point at the local Postgres.",
      "==============================================================",
      "",
    ].join("\n"),
  );
  process.exit(4);
}

if (ALLOW_REMOTE && (!isLocalDb || !isLocalSupabase)) {
  console.warn(
    [
      "",
      "==============================================================",
      "  WARNING: --allow-remote in effect.",
      `  DATABASE_URL host: ${dbHost}`,
      `  SUPABASE_URL     : ${SUPABASE_URL}`,
      "  About to write synthetic data to a REMOTE database.",
      "==============================================================",
      "",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// 4. Deferred imports (after env is populated)
// ---------------------------------------------------------------------------

const { createClient: createSdkClient } = await import("@supabase/supabase-js");
const { eq, like, inArray, sql } = await import("drizzle-orm");
const { db, pets, ownerships, petEvents, cases: casesTable, organizations } = await import("../db");
const { writePoint } = await import("../lib/location");

// ---------------------------------------------------------------------------
// 5. Constants + helpers
// ---------------------------------------------------------------------------

const OWNER_EMAIL = "owner@dim.test";
const PERF_TAG = "PERF-";
const BATCH_SIZE = 200;

// Valid (province, locality) pairs from canonical province list.
// Spread across diverse jurisdictions so govt dashboards light up.
const JURISDICTIONS: ReadonlyArray<{ readonly province: string; readonly locality: string }> = [
  { province: "Buenos Aires", locality: "La Plata" },
  { province: "Buenos Aires", locality: "Mar del Plata" },
  { province: "Buenos Aires", locality: "Bahía Blanca" },
  { province: "Buenos Aires", locality: "Quilmes" },
  { province: "Buenos Aires", locality: "Lanús" },
  { province: "Buenos Aires", locality: "San Justo" },
  { province: "Buenos Aires", locality: "Lomas de Zamora" },
  { province: "Buenos Aires", locality: "Morón" },
  { province: "Buenos Aires", locality: "Tigre" },
  { province: "Buenos Aires", locality: "San Isidro" },
  { province: "CABA", locality: "Palermo" },
  { province: "CABA", locality: "Recoleta" },
  { province: "CABA", locality: "San Telmo" },
  { province: "CABA", locality: "Caballito" },
  { province: "CABA", locality: "Boedo" },
  { province: "CABA", locality: "Saavedra" },
  { province: "CABA", locality: "Belgrano" },
  { province: "CABA", locality: "Puerto Madero" },
  { province: "CABA", locality: "Retiro" },
  { province: "CABA", locality: "Flores" },
  { province: "Córdoba", locality: "Córdoba" },
  { province: "Córdoba", locality: "Villa Carlos Paz" },
  { province: "Córdoba", locality: "Río Cuarto" },
  { province: "Córdoba", locality: "Falda del Carmen" },
  { province: "Santa Fe", locality: "Rosario" },
  { province: "Santa Fe", locality: "Santa Fe" },
  { province: "Santa Fe", locality: "Rafaela" },
  { province: "Mendoza", locality: "Mendoza" },
  { province: "Mendoza", locality: "San Rafael" },
  { province: "Tucumán", locality: "San Miguel de Tucumán" },
  { province: "Salta", locality: "Salta" },
  { province: "Salta", locality: "Tartagal" },
  { province: "Jujuy", locality: "San Salvador de Jujuy" },
  { province: "Río Negro", locality: "Bariloche" },
  { province: "Río Negro", locality: "Viedma" },
  { province: "Neuquén", locality: "Neuquén" },
  { province: "Chubut", locality: "Rawson" },
  { province: "Chubut", locality: "Comodoro Rivadavia" },
  { province: "Tierra del Fuego", locality: "Ushuaia" },
  { province: "Misiones", locality: "Posadas" },
  { province: "Corrientes", locality: "Corrientes" },
  { province: "Entre Ríos", locality: "Paraná" },
  { province: "Chaco", locality: "Resistencia" },
  { province: "Formosa", locality: "Formosa" },
  { province: "Santiago del Estero", locality: "Santiago del Estero" },
  { province: "San Juan", locality: "San Juan" },
  { province: "San Luis", locality: "San Luis" },
  { province: "La Rioja", locality: "La Rioja" },
  { province: "La Pampa", locality: "Santa Rosa" },
  { province: "Catamarca", locality: "San Fernando del Valle de Catamarca" },
] as const;

const DOG_BREEDS = [
  "Mestizo",
  "Labrador Retriever",
  "Golden Retriever",
  "Beagle",
  "Caniche",
  "Chihuahua",
  "Boxer",
  "Dogo Argentino",
  "Cocker Spaniel",
  "Border Collie",
  "Akita Inu",
  "Rough Collie",
  "Cairn Terrier",
  "Husky Siberiano",
  "Poodle",
  "Bulldog Francés",
] as const;

const CAT_BREEDS = [
  "Común europeo",
  "Siamés",
  "Persa",
  "Maine Coon",
  "Angora",
  "Ragdoll",
  "British Shorthair",
  "Bengalí",
  "Abisinio",
  "Sphynx",
] as const;

const OTHER_BREEDS = ["Común", "Enano", "Rex", "Angora", "Toy"] as const;

const PET_NAMES = [
  "Firulais",
  "Luna",
  "Max",
  "Michi",
  "Toto",
  "Bella",
  "Rocky",
  "Coco",
  "Nala",
  "Simba",
  "Atún",
  "Sushi",
  "Milo",
  "Lola",
  "Toby",
  "Nina",
  "Thor",
  "Kira",
  "Bruno",
  "Canela",
  "Pipo",
  "Mia",
  "Luca",
  "Duna",
  "Rex",
  "Laika",
  "Pancho",
  "Mora",
  "Gato",
  "Perla",
  "Fido",
  "Kiara",
  "Zeus",
  "Pinta",
  "Apolo",
] as const;

// Weighted species distribution
const SPECIES_DIST: ReadonlyArray<{ readonly species: string; readonly weight: number }> = [
  { species: "dog", weight: 55 },
  { species: "cat", weight: 38 },
  { species: "rabbit", weight: 4 },
  { species: "other", weight: 3 },
] as const;

const COMMON_EVENT_TYPES = [
  "pet_registered",
  "vaccination_administered",
  "deworming_administered",
  "vet_visit_logged",
  "weight_recorded",
  "note_added",
  "microchip_implanted",
  "sterilization_performed",
] as const;

const ACQUISITION_METHODS = ["adopted", "found_stray", "gift", "other"] as const;
const SEXES = ["male", "female", "unknown"] as const;

type LogTag = "STEP" | "OK" | "SKIP" | "WARN" | "INFO" | "DONE" | "FAIL";
function log(tag: LogTag, msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${tag.padEnd(4)}] ${msg}`);
}

/** Simple deterministic pseudo-random generator (LCG). */
function seededRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    s >>>= 0;
    return s / 0x100000000;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted(
  dist: ReadonlyArray<{ readonly species: string; readonly weight: number }>,
  rng: () => number,
): string {
  const total = dist.reduce((s, d) => s + d.weight, 0);
  let r = rng() * total;
  for (const d of dist) {
    r -= d.weight;
    if (r <= 0) return d.species;
  }
  return dist[dist.length - 1].species;
}

/** Deterministic public token — also serves as the idempotency key. */
function perfPublicToken(i: number): string {
  return `PERF-${String(i).padStart(6, "0")}`;
}

/** Name with the PERF- tag prefix (the cleanup key). */
function perfName(i: number, baseName: string): string {
  return `${PERF_TAG}${String(i).padStart(6, "0")} ${baseName}`;
}

/** Random AR coordinates: lat -22..-56, lng -53..-72. */
function randomCoords(rng: () => number): { lat: number; lng: number } {
  const lat = -(22 + rng() * 34);
  const lng = -(53 + rng() * 19);
  return { lat, lng };
}

// ---------------------------------------------------------------------------
// 6. findAuthUserIdByEmail (mirrors seed-test-users.ts exactly)
// ---------------------------------------------------------------------------

async function findAuthUserIdByEmail(supabase: any, email: string): Promise<string | null> {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`listUsers failed on page ${page}: ${error.message ?? "(no message)"}`);
    }
    const users = data.users as Array<{ email: string; id: string }>;
    const hit = users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (users.length < 200) return null;
    page++;
  }
}

// ---------------------------------------------------------------------------
// 7. Find the "Refugio Test (Seed)" org created by seed-test-users
// ---------------------------------------------------------------------------

async function findSeedOrgId(): Promise<string | null> {
  // createOrganizationForUser (app/actions/upgrade.ts) strips dashes from the
  // CUIT before storing, so seed-test-users' "30-99999999-9" lands as
  // "30999999999". Look it up in that normalized form.
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.cuit, "30999999999"))
    .limit(1);
  return org?.id ?? null;
}

// ---------------------------------------------------------------------------
// 8. --clean: delete all perf-tagged data in FK-safe order
// ---------------------------------------------------------------------------

async function runClean(): Promise<void> {
  log("STEP", "--clean: removing all PERF-tagged data");

  const perfPets = await db
    .select({ id: pets.id })
    .from(pets)
    .where(like(pets.name, `${PERF_TAG}%`));

  if (perfPets.length === 0) {
    log("INFO", "No PERF-tagged pets found — nothing to delete.");
    return;
  }
  log("INFO", `Found ${perfPets.length} PERF-tagged pets`);
  const perfPetIds = perfPets.map((p) => p.id);

  // pet_events is append-only (enforce_pet_events_append_only trigger). The
  // sanctioned override is to set app.allow_event_mutation=true +
  // app.allow_event_mutation_actor=<uuid> in the SAME transaction; the trigger
  // then permits the delete and writes an audit_log row per deleted event.
  // The actor MUST be a profiles.id — audit_log.actor_user_id FKs profiles,
  // and some auth.users rows have no profile (so select from profiles, not
  // auth.users, or the trigger's audit insert fails with a FK violation).
  const actorRows = (await db.execute(sql`select id from profiles limit 1`)) as unknown as Array<{
    id: string;
  }>;
  const actorId = actorRows[0]?.id ?? null;
  if (!actorId) {
    log("FAIL", "No profile found to act as event-mutation override actor — aborting clean.");
    return;
  }

  const DEL_BATCH = 500;
  for (let start = 0; start < perfPetIds.length; start += DEL_BATCH) {
    const batch = perfPetIds.slice(start, start + DEL_BATCH);

    // FK-safe order: pet_events → cases → ownerships → pets, inside one tx so
    // the append-only override (set_config is_local=true) covers the deletes.
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.allow_event_mutation', 'true', true)`);
      await tx.execute(sql`select set_config('app.allow_event_mutation_actor', ${actorId}, true)`);
      await tx.delete(petEvents).where(inArray(petEvents.petId, batch));
      await tx.delete(casesTable).where(inArray(casesTable.primaryPetId, batch));
      await tx.delete(ownerships).where(inArray(ownerships.petId, batch));
      await tx.delete(pets).where(inArray(pets.id, batch));
    });

    log("OK", `  Deleted batch [${start}..${start + batch.length - 1}]`);
  }

  log("DONE", `Clean complete — ${perfPets.length} PERF pets removed`);
}

// ---------------------------------------------------------------------------
// 9. Build events for one pet
// ---------------------------------------------------------------------------

function buildPetEvents(
  petId: string,
  ownerUserId: string,
  species: string,
  eventCount: number,
  rng: () => number,
): Array<Record<string, unknown>> {
  const baseDate = new Date(Date.now() - rng() * 3 * 365 * 24 * 3600 * 1000);
  const events: Array<Record<string, unknown>> = [];

  // Always first: pet_registered
  events.push({
    petId,
    eventType: "pet_registered",
    occurredAt: baseDate,
    recordedByUserId: ownerUserId,
    authorRole: "owner",
    authorVerified: false,
    payload: { source: "seed-perf", species },
  });

  // Shuffle extra event types deterministically
  const extras = Math.min(eventCount - 1, COMMON_EVENT_TYPES.length - 1);
  const typesPool = [...COMMON_EVENT_TYPES].filter((t) => t !== "pet_registered");
  for (let i = typesPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = typesPool[i];
    typesPool[i] = typesPool[j];
    typesPool[j] = tmp;
  }

  for (let e = 0; e < extras; e++) {
    const evtType = typesPool[e];
    const occurredAt = new Date(baseDate.getTime() + (e + 1) * 7 * 24 * 3600 * 1000);
    let payload: Record<string, unknown> = { source: "seed-perf" };

    if (evtType === "vaccination_administered") {
      payload = { source: "seed-perf", vaccine_name: "antirrábica", brand: "Defensor 3" };
    } else if (evtType === "deworming_administered") {
      payload = { source: "seed-perf", product: "ivermectina", type: "internal" };
    } else if (evtType === "vet_visit_logged") {
      payload = { source: "seed-perf", reason: "wellness" };
    } else if (evtType === "weight_recorded") {
      payload = { source: "seed-perf", kg: 3 + Math.floor(rng() * 30) };
    } else if (evtType === "note_added") {
      payload = {
        source: "seed-perf",
        category: "observación",
        text: "Mascota de prueba de carga — seed-perf",
      };
    } else if (evtType === "microchip_implanted") {
      // Deterministic chip number to avoid duplicate chip collision on idempotent re-runs
      const chipSuffix = String(Math.floor(rng() * 1e9)).padStart(9, "0");
      payload = {
        source: "seed-perf",
        chip_number: `858000${chipSuffix}`,
        country_code: "858",
        implanted_by: null,
        location_on_body: null,
        implant_date_known: false,
      };
    } else if (evtType === "sterilization_performed") {
      payload = { source: "seed-perf", procedure: "castración", performed_by: null };
    }

    events.push({
      petId,
      eventType: evtType,
      occurredAt,
      recordedByUserId: ownerUserId,
      authorRole: "owner",
      authorVerified: false,
      payload,
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// 10. Main seed loop
// ---------------------------------------------------------------------------

async function runSeed(ownerUserId: string, seedOrgId: string | null): Promise<void> {
  const lostCount = Math.floor(COUNT * 0.1);
  const withCoordsCount = Math.floor(COUNT * 0.5);
  const orgCasesCount = seedOrgId ? Math.floor(lostCount * 0.2) : 0;

  log("INFO", `Owner   : ${OWNER_EMAIL} (${ownerUserId.slice(0, 8)}…)`);
  log(
    "INFO",
    `Seed org: ${seedOrgId ? `${seedOrgId.slice(0, 8)}… (first ${orgCasesCount} lost cases tied to org)` : "NOT FOUND — org case-linking skipped"}`,
  );
  log("INFO", `Pets    : ${COUNT} total`);
  log("INFO", `Lost    : ~${lostCount} (10%) → each gets a cases row`);
  log("INFO", `Coords  : ~${withCoordsCount} (50%) have lat/lng`);
  log("INFO", `Batches : ${Math.ceil(COUNT / BATCH_SIZE)} × ${BATCH_SIZE}`);

  let created = 0;
  let skipped = 0;

  for (let batchStart = 0; batchStart < COUNT; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, COUNT);
    log("STEP", `Batch ${batchStart}–${batchEnd - 1}`);

    for (let i = batchStart; i < batchEnd; i++) {
      const token = perfPublicToken(i);
      const rng = seededRng(i * 31337 + 7);

      // Idempotency: skip if already exists
      const [existing] = await db
        .select({ id: pets.id })
        .from(pets)
        .where(eq(pets.publicToken, token))
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      // Deterministic attributes
      const species = pickWeighted(SPECIES_DIST, rng);
      const sex = pick(SEXES, rng);
      const baseName = pick(PET_NAMES, rng);
      const name = perfName(i, baseName);
      const jur = JURISDICTIONS[i % JURISDICTIONS.length];

      let breed: string | null = null;
      if (species === "dog") breed = pick(DOG_BREEDS, rng);
      else if (species === "cat") breed = pick(CAT_BREEDS, rng);
      else if (species !== "other") breed = pick(OTHER_BREEDS, rng);

      const isLost = i < lostCount;
      const status = isLost ? ("lost" as const) : ("active" as const);

      // Coordinates for ~50% of pets
      const hasCoords = i < withCoordsCount;
      const coords = hasCoords ? randomCoords(rng) : null;
      const coordFields = writePoint(coords);

      // Age: 1–12 years
      const ageYears = 1 + Math.floor(rng() * 12);
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - ageYears);
      const dateOfBirth = dob.toISOString().slice(0, 10);

      // Events: 1–5 per pet
      const eventCount = 1 + Math.floor(rng() * 5);

      try {
        const [pet] = await db
          .insert(pets)
          .values({
            publicToken: token,
            species,
            breed,
            name,
            sex,
            dateOfBirth,
            birthDateIsEstimated: false,
            status,
            jurisdictionCountry: "AR",
            jurisdictionProvince: jur.province,
            jurisdictionLocality: jur.locality,
            acquisitionMethod: pick(ACQUISITION_METHODS, rng),
            potentiallyDangerousBreed: false,
            emergencyInfoVisible: false,
          })
          .returning({ id: pets.id });

        // Ownership row
        await db.insert(ownerships).values({
          petId: pet.id,
          ownerUserId,
          role: "owner",
        });

        // Events
        const evtRows = buildPetEvents(
          pet.id,
          ownerUserId,
          species,
          eventCount,
          seededRng(i * 99991 + 3),
        );
        for (const evtRow of evtRows) {
          // Coord-bearing pets get coords on their events so the map views
          // (lost-pets map, sightings, govt geo) have realistic volume to
          // render. pet_events.location_lat/lng is where the app reads them;
          // pets has no coordinate column.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await db.insert(petEvents).values({
            ...(evtRow as Record<string, unknown>),
            ...(hasCoords ? coordFields : {}),
          } as any);
        }

        // Lost pets → case row + status_changed event
        if (isLost) {
          const casePublicCode = `PERF-CASE-${String(i).padStart(6, "0")}`;

          const [existingCase] = await db
            .select({ id: casesTable.id })
            .from(casesTable)
            .where(eq(casesTable.publicCode, casePublicCode))
            .limit(1);

          if (!existingCase) {
            const tieToOrg = seedOrgId !== null && i < orgCasesCount;

            // A registered_pet case must NOT set primary_location_* — the
            // cases_subject_location_consistency CHECK ties primary_location_*
            // to primary_subject_kind='location' only (those columns are for
            // location-subject cases). The lost coordinates live on the pet and
            // on the status_changed event below, not on the case row.
            await db.insert(casesTable).values({
              publicCode: casePublicCode,
              caseKind: "lost_pet_episode",
              status: "open",
              primarySubjectKind: "registered_pet",
              primaryPetId: pet.id,
              jurisdictionCountry: "AR",
              jurisdictionProvince: jur.province,
              jurisdictionLocality: jur.locality,
              openedByUserId: ownerUserId,
              openedByOrganizationId: tieToOrg ? seedOrgId : null,
              openedReason: "auto: status_changed to lost (seed-perf)",
            });

            // Emit the corresponding status_changed event
            await db.insert(petEvents).values({
              petId: pet.id,
              eventType: "status_changed",
              occurredAt: new Date(),
              recordedByUserId: ownerUserId,
              authorRole: "owner",
              authorVerified: false,
              payload: {
                from_status: "active",
                to_status: "lost",
                source: "seed-perf",
                location_description: `${jur.locality}, ${jur.province}`,
              },
              ...coordFields,
            });
          }
        }

        created++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log("WARN", `  pet ${i} (${token}) failed — skipping: ${msg}`);
      }
    }

    log("OK", `  batch done — created so far: ${created}, skipped: ${skipped}`);
  }

  log("DONE", `Seed complete — created: ${created}, skipped (already existed): ${skipped}`);
  log("INFO", `Total PERF pets in DB: ~${created + skipped}`);
}

// ---------------------------------------------------------------------------
// 11. Main entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const hostLabel = DATABASE_URL ? (parsePgHost(DATABASE_URL) ?? "(parse error)") : "(not set)";
  log("INFO", `seed-perf starting — host: ${hostLabel}`);
  log(
    "INFO",
    `Flags: count=${COUNT} allow-remote=${ALLOW_REMOTE} clean=${CLEAN} dry-run=${DRY_RUN}`,
  );

  if (DRY_RUN) {
    const lostCount = Math.floor(COUNT * 0.1);
    const withCoords = Math.floor(COUNT * 0.5);
    log("INFO", "=== DRY RUN — no writes will be made ===");
    log("INFO", `Would create        : ${COUNT} pets`);
    log("INFO", `Lost + cases (~10%) : ${lostCount}`);
    log("INFO", `With coords (~50%)  : ${withCoords}`);
    log(
      "INFO",
      `Jurisdictions       : ${JURISDICTIONS.length} distinct (province, locality) pairs`,
    );
    log("INFO", `Batch size          : ${BATCH_SIZE}`);
    log("INFO", `Batches             : ${Math.ceil(COUNT / BATCH_SIZE)}`);
    log("INFO", "Events per pet      : 1–5");
    log("INFO", `Cleanup key         : pets.name LIKE 'PERF-%'`);
    log(
      "INFO",
      `Idempotency key     : pets.publicToken IN PERF-000000..PERF-${String(COUNT - 1).padStart(6, "0")}`,
    );
    log("DONE", "Dry run complete — nothing written");
    return;
  }

  const supabase = createSdkClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (CLEAN) {
    await runClean();
    return;
  }

  log("STEP", `Resolving ${OWNER_EMAIL} via admin SDK`);
  const ownerUserId = await findAuthUserIdByEmail(supabase, OWNER_EMAIL);
  if (!ownerUserId) {
    log("FAIL", `${OWNER_EMAIL} not found in auth.users. Run pnpm seed:test first.`);
    process.exit(1);
  }
  log("OK", `${OWNER_EMAIL} → ${ownerUserId.slice(0, 8)}…`);

  const seedOrgId = await findSeedOrgId();
  if (!seedOrgId) {
    log(
      "WARN",
      "Refugio Test (Seed) org (cuit 30-99999999-9) not found — org case-linking skipped",
    );
  } else {
    log("INFO", `Refugio Test (Seed) → ${seedOrgId.slice(0, 8)}…`);
  }

  await runSeed(ownerUserId, seedOrgId);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("\n[FATAL]", err);
    process.exit(1);
  });
