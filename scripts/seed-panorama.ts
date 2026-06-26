/**
 * DIM Panorama Demo Dataset Seed — seed-panorama.ts
 *
 * Generates a deterministic, idempotent synthetic dataset so the national
 * situational console (Centro de Situación Nacional) and government dashboards
 * render with realistic national density.
 *
 * ─── ENV KNOBS ─────────────────────────────────────────────────────────────
 *   PETS_PER_CAPITA       default 0.5    — fraction of people that own a pet
 *   SCALE                 default 0.002  — down-sample ratio (1:500 ≈ 46k pets)
 *   PANORAMA_WINDOW_DAYS  default 90     — event window in days back from anchor
 *
 * ─── DETERMINISM CONTRACT ──────────────────────────────────────────────────
 *   A fixed-seed mulberry32 PRNG drives ALL random choices. Re-running
 *   produces an identical dataset. The anchor date is a hardcoded ISO string
 *   (2026-06-20) — not `new Date()` — so the temporal distribution is stable.
 *
 * ─── PANO- TAG ─────────────────────────────────────────────────────────────
 *   Every synthetic pet's `name` starts with "PANO-" (e.g. "PANO-000042 Luna").
 *   Synthetic orgs use publicToken "PANO-ORG-<slug>". Welfare reports are
 *   tagged by the same provincial distribution. Cleanup keys off PANO- prefix.
 *
 * ─── LOCAL-ONLY GUARD ──────────────────────────────────────────────────────
 *   Refuses to run against a non-local DATABASE_URL host unless --allow-remote
 *   is passed. ALWAYS refuses when NODE_ENV=production.
 *   Allowed local hosts: 127.0.0.1, localhost, host.docker.internal, ::1.
 *   Exit code 4 on guard failure (mirrors db-bootstrap.ts).
 *
 * ─── IDEMPOTENCY ───────────────────────────────────────────────────────────
 *   Default run: delete all PANO-tagged rows (FK-safe order, same
 *   app.allow_event_mutation override as seed-perf), then re-insert fresh.
 *   --clean flag: delete only (no re-insert).
 *
 * ─── CLI FLAGS ─────────────────────────────────────────────────────────────
 *   --allow-remote   Target non-local DB (staging).
 *   --clean          Delete all PANO-tagged data then exit.
 *   --dry-run        Print plan and exit without writing.
 */

// ---------------------------------------------------------------------------
// 0. Type-only imports
// ---------------------------------------------------------------------------

import type { EventType } from "../db/schema";

// Pure date/trend helpers for the multi-year history seed. Side-effect-free and
// db-free, so a static import here is safe (it does NOT trigger the deferred
// db/index.ts load that the env bootstrap below must precede).
import {
  dateInYear,
  monthlyEventCount,
  pickDateInMonth,
  pickRegisteredYear,
  provinceProfile,
} from "./seed-history-utils";

// ---------------------------------------------------------------------------
// 1. Env bootstrap (must run before db/index.ts is imported)
// ---------------------------------------------------------------------------

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ---------------------------------------------------------------------------
// 2. Parse CLI flags
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

const ALLOW_REMOTE = argv.includes("--allow-remote");
const CLEAN = argv.includes("--clean");
const DRY_RUN = argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// 3. Safety guards
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL ?? "";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal", "::1"]);

function parsePgHost(url: string): string | null {
  const match = url.match(/^postgres(?:ql)?:\/\/[^@]+@([^:/]+)/);
  return match ? match[1] : null;
}

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL in .env.local — aborting.");
  process.exit(2);
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV=production. Aborting.");
  process.exit(2);
}

const dbHost = parsePgHost(DATABASE_URL);
const isLocalDb = dbHost ? LOCAL_HOSTS.has(dbHost) : true;

if (!ALLOW_REMOTE && !isLocalDb) {
  console.error(
    [
      "",
      "==============================================================",
      "  ABORT: seed-panorama target is NOT a local Postgres.",
      "==============================================================",
      `  DATABASE_URL host : ${dbHost ?? "(not set)"}`,
      `  Allowed local hosts: ${[...LOCAL_HOSTS].join(", ")}`,
      "",
      "  This script inserts tens of thousands of rows. Running it",
      "  against a remote DB by mistake is a real incident.",
      "",
      "  If you meant to target this host, re-run with --allow-remote.",
      "  Otherwise edit .env.local to point at the local Postgres.",
      "==============================================================",
      "",
    ].join("\n"),
  );
  process.exit(4);
}

if (ALLOW_REMOTE && !isLocalDb) {
  console.warn(
    [
      "",
      "==============================================================",
      "  WARNING: --allow-remote in effect.",
      `  DATABASE_URL host: ${dbHost}`,
      "  About to write synthetic data to a REMOTE database.",
      "==============================================================",
      "",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// 4. Deferred imports (after env is populated)
// ---------------------------------------------------------------------------

const { eq, inArray, isNull, like, sql } = await import("drizzle-orm");
const {
  db,
  pets,
  ownerships,
  petEvents,
  organizations,
  welfareReports,
  arLocalities,
  jurisdictionsCensus,
  cases,
  custodyDisputes,
  enoProcessingQueue,
  eventNotificationOutbox,
  serviceOfferings,
  serviceScheduleRules,
  timeSlots,
  appointments,
} = await import("../db");
const { writePoint } = await import("../lib/location");
const { PROVINCES } = await import("../lib/ar-provincias");
const { generateReferenceCode } = await import("../src/modules/welfare/domain/reference-code");

// ---------------------------------------------------------------------------
// 5. Constants + helpers
// ---------------------------------------------------------------------------

const PANO_TAG = "PANO-";

/** Hardcoded anchor date — NOT Date.now() so the window is reproducible. */
const ANCHOR_ISO = "2026-06-20T00:00:00.000Z";
const ANCHOR_MS = new Date(ANCHOR_ISO).getTime();

const WINDOW_DAYS = Number(process.env.PANORAMA_WINDOW_DAYS ?? "90");
const WINDOW_MS = WINDOW_DAYS * 24 * 3600 * 1000;

const PETS_PER_CAPITA = Number(process.env.PETS_PER_CAPITA ?? "0.5");
const SCALE = Number(process.env.SCALE ?? "0.002");

/**
 * Multiplier applied to the base monthly event rate inside
 * seedModelProvinceHistory. Default 1 keeps the seed fast while still
 * producing enough rows to populate every event dimension. Set to 2–5
 * for denser stress-test datasets or to 0.1 for quick CI runs.
 */
const HISTORY_SCALE = Number(process.env.HISTORY_SCALE ?? "1");

const BATCH_SIZE = 500;

// ─── Operational / derived family rates (env-tunable) ───────────────────────
// These drive the families that were structurally empty before this seed:
// sterilization, PPP attestation, adoption, reunification, dangerous-breed flag.
// All are fractions [0..1]; per-province spread is layered on top (see helpers).
const STERILIZATION_RATE = Number(process.env.PANO_STERILIZATION_RATE ?? "0.28");
const DANGEROUS_BREED_FLAG_RATE = Number(process.env.PANO_DANGEROUS_BREED_RATE ?? "0.04");
const PPP_ATTEST_RATE = Number(process.env.PANO_PPP_ATTEST_RATE ?? "0.45"); // of flagged pets
const ADOPTION_ACQUISITION_RATE = Number(process.env.PANO_ADOPTION_RATE ?? "0.12");
const REUNIFICATION_RATE = Number(process.env.PANO_REUNIFICATION_RATE ?? "0.45"); // of lost pets

// ─── Health campaign rates (env-tunable) — feeds /gob/campanas ──────────────
// A health campaign is a service_offering (vacunación / desparasitación /
// esterilización) hosted by a seeded org. Slots are booked at a per-province
// rate; each booking resolves to a mixed outcome so enrollment / completion /
// no-show / geographic-reach KPIs all populate with varied-by-jurisdiction data.
// CAMPAIGN_BOOKING_RATE is the baseline share of materialized slot capacity that
// gets booked; a per-province multiplier (see PROVINCE_CAMPAIGN_DEMAND) layers
// jurisdiction spread on top.
const CAMPAIGN_BOOKING_RATE = Number(process.env.PANO_CAMPAIGN_BOOKING_RATE ?? "0.62");

type LogTag = "STEP" | "OK" | "SKIP" | "WARN" | "INFO" | "DONE" | "FAIL";
function log(tag: LogTag, msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${tag.padEnd(4)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// 5a. Seeded deterministic PRNG — mulberry32
// ---------------------------------------------------------------------------

const RNG_SEED = 0x4e415441; // "NATA" — fixed forever

function makeMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 0x100000000;
  };
}

// Single global RNG — all callers draw from this to keep the sequence stable.
const rng = makeMulberry32(RNG_SEED);

function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted<T extends { weight: number }>(dist: readonly T[]): T {
  const total = dist.reduce((s, d) => s + d.weight, 0);
  let r = rng() * total;
  for (const d of dist) {
    r -= d.weight;
    if (r <= 0) return d;
  }
  return dist[dist.length - 1];
}

/** Gaussian jitter using Box-Muller. Uses two RNG draws. */
function gaussianJitter(stdDev: number): number {
  const u1 = rng();
  const u2 = rng();
  return stdDev * Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

/** Random timestamp within the event window (before anchor). */
function randomWindowDate(maxDaysBack = WINDOW_DAYS): Date {
  const daysBack = rng() * maxDaysBack;
  return new Date(ANCHOR_MS - daysBack * 24 * 3600 * 1000);
}

/** Deterministic public token for a panorama pet by global index. */
function panoPublicToken(i: number): string {
  return `PANO-${String(i).padStart(6, "0")}`;
}

/** Pet name with PANO- tag prefix. */
function panoName(i: number, baseName: string): string {
  return `${PANO_TAG}${String(i).padStart(6, "0")} ${baseName}`;
}

// ---------------------------------------------------------------------------
// 5b. Static data tables
// ---------------------------------------------------------------------------

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
  "Perla",
  "Fido",
  "Kiara",
  "Zeus",
  "Apolo",
] as const;

const SPECIES_DIST = [
  { species: "dog", weight: 55 },
  { species: "cat", weight: 38 },
  { species: "rabbit", weight: 4 },
  { species: "other", weight: 3 },
] as const;

const SEXES = ["male", "female", "unknown"] as const;

/**
 * Per-province vaccination (rabies) target coverage [0..1] and microchip rate.
 * Intentionally varied to produce spread in the choropleth.
 * Values represent % of pets in that province with a vaccination event.
 */
const PROVINCE_COVERAGE: Record<string, { vacc: number; chip: number; ster: number }> = {
  "Buenos Aires": { vacc: 0.45, chip: 0.18, ster: 0.4 },
  CABA: { vacc: 0.4, chip: 0.2, ster: 0.38 },
  Córdoba: { vacc: 0.35, chip: 0.13, ster: 0.34 },
  "Santa Fe": { vacc: 0.32, chip: 0.12, ster: 0.32 },
  Mendoza: { vacc: 0.28, chip: 0.1, ster: 0.28 },
  Tucumán: { vacc: 0.2, chip: 0.08, ster: 0.22 },
  Salta: { vacc: 0.15, chip: 0.06, ster: 0.18 },
  "Entre Ríos": { vacc: 0.25, chip: 0.09, ster: 0.26 },
  Misiones: { vacc: 0.18, chip: 0.07, ster: 0.2 },
  Chaco: { vacc: 0.12, chip: 0.05, ster: 0.16 },
  Corrientes: { vacc: 0.14, chip: 0.06, ster: 0.17 },
  Jujuy: { vacc: 0.1, chip: 0.05, ster: 0.15 },
  "Río Negro": { vacc: 0.22, chip: 0.09, ster: 0.27 },
  Neuquén: { vacc: 0.24, chip: 0.09, ster: 0.29 },
  Formosa: { vacc: 0.08, chip: 0.05, ster: 0.14 },
  "San Juan": { vacc: 0.18, chip: 0.07, ster: 0.21 },
  "San Luis": { vacc: 0.19, chip: 0.07, ster: 0.22 },
  Catamarca: { vacc: 0.11, chip: 0.05, ster: 0.16 },
  "La Pampa": { vacc: 0.21, chip: 0.08, ster: 0.25 },
  "La Rioja": { vacc: 0.1, chip: 0.05, ster: 0.15 },
  "Santiago del Estero": { vacc: 0.09, chip: 0.05, ster: 0.15 },
  Chubut: { vacc: 0.2, chip: 0.08, ster: 0.24 },
  "Santa Cruz": { vacc: 0.17, chip: 0.07, ster: 0.2 },
  "Tierra del Fuego": { vacc: 0.3, chip: 0.11, ster: 0.36 },
};

/**
 * ~30 curated metro anchors. Each absorbs a Zipf/Pareto share of
 * its province's pets (the "urban concentration" heuristic).
 * weight is relative within-province; first entries get more pets.
 */
interface MetroAnchor {
  readonly province: string;
  readonly locality: string;
  readonly weight: number; // relative intra-province weight
}

const METRO_ANCHORS: readonly MetroAnchor[] = [
  // Buenos Aires — spread across the province
  { province: "Buenos Aires", locality: "La Plata", weight: 18 },
  { province: "Buenos Aires", locality: "Mar del Plata", weight: 14 },
  { province: "Buenos Aires", locality: "Quilmes", weight: 12 },
  { province: "Buenos Aires", locality: "Lanús", weight: 11 },
  { province: "Buenos Aires", locality: "Lomas de Zamora", weight: 10 },
  { province: "Buenos Aires", locality: "Morón", weight: 9 },
  { province: "Buenos Aires", locality: "Tigre", weight: 8 },
  { province: "Buenos Aires", locality: "San Isidro", weight: 8 },
  { province: "Buenos Aires", locality: "Bahía Blanca", weight: 7 },
  { province: "Buenos Aires", locality: "San Justo", weight: 6 },
  // CABA
  { province: "CABA", locality: "Palermo", weight: 20 },
  { province: "CABA", locality: "Caballito", weight: 15 },
  { province: "CABA", locality: "Belgrano", weight: 14 },
  { province: "CABA", locality: "Recoleta", weight: 12 },
  { province: "CABA", locality: "Flores", weight: 10 },
  // Córdoba
  { province: "Córdoba", locality: "Córdoba", weight: 30 },
  { province: "Córdoba", locality: "Río Cuarto", weight: 10 },
  { province: "Córdoba", locality: "Villa Carlos Paz", weight: 8 },
  // Santa Fe
  { province: "Santa Fe", locality: "Rosario", weight: 30 },
  { province: "Santa Fe", locality: "Santa Fe", weight: 20 },
  // Mendoza
  { province: "Mendoza", locality: "Mendoza", weight: 30 },
  { province: "Mendoza", locality: "San Rafael", weight: 12 },
  // Tucumán
  { province: "Tucumán", locality: "San Miguel de Tucumán", weight: 40 },
  // Salta
  { province: "Salta", locality: "Salta", weight: 35 },
  { province: "Salta", locality: "Tartagal", weight: 10 },
  // Misiones
  { province: "Misiones", locality: "Posadas", weight: 35 },
  // Chaco
  { province: "Chaco", locality: "Resistencia", weight: 40 },
  // Corrientes
  { province: "Corrientes", locality: "Corrientes", weight: 40 },
  // Jujuy
  { province: "Jujuy", locality: "San Salvador de Jujuy", weight: 40 },
  // Entre Ríos
  { province: "Entre Ríos", locality: "Paraná", weight: 35 },
  // Río Negro
  { province: "Río Negro", locality: "Bariloche", weight: 25 },
  { province: "Río Negro", locality: "Viedma", weight: 15 },
  // Neuquén
  { province: "Neuquén", locality: "Neuquén", weight: 40 },
  // Chubut
  { province: "Chubut", locality: "Comodoro Rivadavia", weight: 30 },
  { province: "Chubut", locality: "Rawson", weight: 15 },
  // Tierra del Fuego
  { province: "Tierra del Fuego", locality: "Ushuaia", weight: 40 },
  // Formosa
  { province: "Formosa", locality: "Formosa", weight: 50 },
  // Santiago del Estero
  { province: "Santiago del Estero", locality: "Santiago del Estero", weight: 45 },
  // San Juan
  { province: "San Juan", locality: "San Juan", weight: 50 },
  // San Luis
  { province: "San Luis", locality: "San Luis", weight: 50 },
  // La Rioja
  { province: "La Rioja", locality: "La Rioja", weight: 55 },
  // Catamarca
  { province: "Catamarca", locality: "San Fernando del Valle de Catamarca", weight: 55 },
  // La Pampa
  { province: "La Pampa", locality: "Santa Rosa", weight: 55 },
  // Santa Cruz
  { province: "Santa Cruz", locality: "Río Gallegos", weight: 50 },
];

// Province → metro anchor weight total (for normalizing intra-province shares)
const METRO_WEIGHT_BY_PROVINCE = new Map<string, number>();
for (const anchor of METRO_ANCHORS) {
  METRO_WEIGHT_BY_PROVINCE.set(
    anchor.province,
    (METRO_WEIGHT_BY_PROVINCE.get(anchor.province) ?? 0) + anchor.weight,
  );
}

// Welfare report kinds with weights (mostly moderate, a few critical)
const WELFARE_KINDS = [
  { kind: "abandonment", weight: 30 },
  { kind: "neglect", weight: 28 },
  { kind: "physical_abuse", weight: 12 },
  { kind: "chained", weight: 10 },
  { kind: "no_shelter", weight: 9 },
  { kind: "hoarding", weight: 5 },
  { kind: "dog_fighting", weight: 3 },
  { kind: "trafficking", weight: 2 },
  { kind: "other", weight: 1 },
] as const;

const WELFARE_SEVERITIES = [
  { severity: "low", weight: 20 },
  { severity: "medium", weight: 45 },
  { severity: "high", weight: 25 },
  { severity: "critical", weight: 10 },
] as const;

// ---------------------------------------------------------------------------
// 5c. Province → ISO code map (for ar_localities lookup)
// ---------------------------------------------------------------------------

const PROVINCE_TO_CODE = new Map<string, string>(PROVINCES.map((p) => [p.name, p.code]));

// ---------------------------------------------------------------------------
// 6. Load reference data from DB (localities + census)
// ---------------------------------------------------------------------------

interface LocalityRow {
  id: string;
  provinceCode: string;
  localityName: string;
  lat: number;
  lng: number;
}

async function loadLocalities(): Promise<Map<string, LocalityRow[]>> {
  log("STEP", "Loading ar_localities with coordinates…");

  const rows = await db
    .select({
      id: arLocalities.id,
      provinceCode: arLocalities.provinceCode,
      localityName: arLocalities.localityName,
      latitude: arLocalities.latitude,
      longitude: arLocalities.longitude,
    })
    .from(arLocalities)
    .where(
      sql`${arLocalities.removedAt} IS NULL
          AND ${arLocalities.latitude} IS NOT NULL
          AND ${arLocalities.longitude} IS NOT NULL`,
    );

  const byProvince = new Map<string, LocalityRow[]>();
  for (const row of rows) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!byProvince.has(row.provinceCode)) byProvince.set(row.provinceCode, []);
    byProvince.get(row.provinceCode)!.push({
      id: row.id,
      provinceCode: row.provinceCode,
      localityName: row.localityName,
      lat,
      lng,
    });
  }

  const total = [...byProvince.values()].reduce((s, arr) => s + arr.length, 0);
  log("INFO", `Loaded ${total} localities across ${byProvince.size} province codes`);
  return byProvince;
}

interface CensusRow {
  provinceName: string;
  population: number;
}

async function loadCensus(): Promise<CensusRow[]> {
  log("STEP", "Loading jurisdictions_census…");
  const rows = await db
    .select({
      provinceName: jurisdictionsCensus.provinceName,
      population: jurisdictionsCensus.population,
    })
    .from(jurisdictionsCensus);
  log("INFO", `Loaded ${rows.length} census rows`);
  return rows;
}

// ---------------------------------------------------------------------------
// 7. Locality picker — Zipf/Pareto for metro anchors, uniform for the rest
// ---------------------------------------------------------------------------

/**
 * Pick a locality for a pet in `provinceName`.
 * Metro anchors absorb ~70% of the province's pets (by weight ratio).
 * The remaining ~30% spread uniformly over other localities.
 * Always returns a locality with valid coordinates.
 */
function pickLocality(
  provinceName: string,
  localitiesByCode: Map<string, LocalityRow[]>,
): LocalityRow | null {
  const code = PROVINCE_TO_CODE.get(provinceName);
  if (!code) return null;

  const allLocalities = localitiesByCode.get(code);
  if (!allLocalities || allLocalities.length === 0) return null;

  // Build a locality name → row map for fast metro anchor lookup
  const byName = new Map<string, LocalityRow>();
  for (const loc of allLocalities) {
    byName.set(loc.localityName.toLowerCase(), loc);
  }

  // Gather province metro anchors and their available localities
  const metroAnchors = METRO_ANCHORS.filter((a) => a.province === provinceName);
  const totalMetroWeight = metroAnchors.reduce((s, a) => s + a.weight, 0);

  // 70% metro, 30% rural
  if (metroAnchors.length > 0 && rng() < 0.7) {
    // Pick a metro anchor weighted by its share
    let r = rng() * totalMetroWeight;
    for (const anchor of metroAnchors) {
      r -= anchor.weight;
      if (r <= 0) {
        // Find closest locality name match
        const found = byName.get(anchor.locality.toLowerCase());
        if (found) return found;
        // Fallback: first locality in province
        break;
      }
    }
  }

  // Rural / spillover: uniform over all available localities
  return allLocalities[Math.floor(rng() * allLocalities.length)];
}

/**
 * Apply gaussian geo jitter to a coordinate (simulate per-pet location
 * variance from the locality centroid). Urban radius ≈ 0.02°, rural ≈ 0.08°.
 */
function jitteredCoord(
  lat: number,
  lng: number,
  radiusDeg = 0.03,
): {
  lat: number;
  lng: number;
} {
  return {
    lat: lat + gaussianJitter(radiusDeg),
    lng: lng + gaussianJitter(radiusDeg),
  };
}

// ---------------------------------------------------------------------------
// 8. Seed organizations (shelters)
// ---------------------------------------------------------------------------

interface PanoOrg {
  id: string;
  provinceName: string;
  locality: string;
  lat: number;
  lng: number;
}

const SEED_ORGS: ReadonlyArray<{
  readonly slug: string;
  readonly province: string;
  readonly locality: string;
  readonly legalName: string;
  readonly orgType: "shelter" | "clinic" | "rescue_network" | "sanitary_authority" | "other";
}> = [
  {
    slug: "refugio-ba-01",
    province: "Buenos Aires",
    locality: "La Plata",
    legalName: "Refugio Panorama La Plata (Seed)",
    orgType: "shelter",
  },
  {
    slug: "refugio-caba-01",
    province: "CABA",
    locality: "Caballito",
    legalName: "Refugio Panorama CABA (Seed)",
    orgType: "shelter",
  },
  {
    slug: "refugio-cordoba-01",
    province: "Córdoba",
    locality: "Córdoba",
    legalName: "Refugio Panorama Córdoba (Seed)",
    orgType: "shelter",
  },
  {
    slug: "refugio-salta-01",
    province: "Salta",
    locality: "Salta",
    legalName: "Refugio Panorama Salta (Seed)",
    orgType: "shelter",
  },
  {
    slug: "clinica-rosario-01",
    province: "Santa Fe",
    locality: "Rosario",
    legalName: "Clínica Panorama Rosario (Seed)",
    orgType: "clinic",
  },
  {
    slug: "autoridad-chaco-01",
    province: "Chaco",
    locality: "Resistencia",
    legalName: "Autoridad Sanitaria Panorama Chaco (Seed)",
    orgType: "sanitary_authority",
  },
];

async function seedOrganizations(localitiesByCode: Map<string, LocalityRow[]>): Promise<PanoOrg[]> {
  log("STEP", "Seeding PANO organizations…");

  const result: PanoOrg[] = [];

  for (const spec of SEED_ORGS) {
    const token = `PANO-ORG-${spec.slug}`;

    // Check if exists
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(sql`${organizations.publicToken} = ${token}`)
      .limit(1);

    const code = PROVINCE_TO_CODE.get(spec.province);
    const locs = code ? (localitiesByCode.get(code) ?? []) : [];
    const loc =
      locs.find((l) => l.localityName.toLowerCase() === spec.locality.toLowerCase()) ?? locs[0];

    const lat = loc ? loc.lat + gaussianJitter(0.01) : -34.6;
    const lng = loc ? loc.lng + gaussianJitter(0.01) : -58.4;

    if (existing.length > 0) {
      log("SKIP", `  Org ${token} already exists`);
      result.push({
        id: existing[0].id,
        provinceName: spec.province,
        locality: spec.locality,
        lat,
        lng,
      });
      continue;
    }

    const [inserted] = await db
      .insert(organizations)
      .values({
        publicToken: token,
        legalName: spec.legalName,
        displayName: spec.legalName,
        orgType: spec.orgType,
        email: `${spec.slug}@pano.seed.local`,
        verified: false,
        jurisdictionCountry: "AR",
        jurisdictionProvince: spec.province,
        jurisdictionLocality: spec.locality,
        ...writePoint({ lat, lng }),
      })
      .returning({ id: organizations.id });

    log("OK", `  Created org ${token}`);
    result.push({
      id: inserted.id,
      provinceName: spec.province,
      locality: spec.locality,
      lat,
      lng,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 9. Seed owner profile (synthetic — no auth.users entry needed for FK ownerships)
// ---------------------------------------------------------------------------
// ownerships.owner_user_id → profiles.id. We need a profile in the DB.
// Use the existing owner@dim.test profile if available, else create a synthetic
// profile row directly (no auth.users side-effect needed for INSERT on profiles).

async function findOrCreateSeedOwnerProfileId(): Promise<string> {
  // Try to find owner@dim.test in profiles via display_name heuristic
  const rows = (await db.execute(
    sql`SELECT id FROM profiles WHERE display_name = 'PANO-Seed-Owner' LIMIT 1`,
  )) as unknown as Array<{ id: string }>;

  if (rows.length > 0) return rows[0].id;

  // Create a synthetic profile. Profiles.id must be a UUID — use a deterministic
  // one derived from the seed tag so idempotent re-runs don't create duplicates.
  const deterministicId = "00000000-4e41-4154-b000-000000000001";

  const exists = (await db.execute(
    sql`SELECT id FROM profiles WHERE id = ${deterministicId} LIMIT 1`,
  )) as unknown as Array<{ id: string }>;

  if (exists.length > 0) return deterministicId;

  await db.execute(sql`
    INSERT INTO profiles (id, display_name, role, account_type, created_at, updated_at)
    VALUES (
      ${deterministicId}::uuid,
      'PANO-Seed-Owner',
      'owner',
      'personal',
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING
  `);

  log("OK", `Created synthetic owner profile ${deterministicId}`);
  return deterministicId;
}

// ---------------------------------------------------------------------------
// 10. --clean: delete all PANO-tagged data in FK-safe order
// ---------------------------------------------------------------------------

async function runClean(): Promise<void> {
  log("STEP", "--clean / pre-clean: removing all PANO-tagged data");

  // 10-pre. Health campaigns (service_offerings + slots + appointments).
  // FK-safe order is appointments → time_slots → service_schedule_rules →
  // service_offerings. appointments.slot_id is ON DELETE RESTRICT, so the
  // bookings MUST go before their slots. We MUST also run this BEFORE the pet
  // delete below: appointments.pet_id is ON DELETE CASCADE, so deleting PANO
  // pets first would silently remove the bookings and leave orphaned PANO slots
  // + offerings (which then never get cleaned, breaking idempotency). Keyed off
  // the deterministic PANO-SVO- offering token (offerings are the root of the
  // cascade) plus the PANO-APT- appointment token as a belt-and-suspenders.
  const panoOfferings = await db
    .select({ id: serviceOfferings.id })
    .from(serviceOfferings)
    .where(like(serviceOfferings.publicToken, "PANO-SVO-%"));

  if (panoOfferings.length > 0) {
    const offeringIds = panoOfferings.map((o) => o.id);

    const panoSlots = await db
      .select({ id: timeSlots.id })
      .from(timeSlots)
      .where(inArray(timeSlots.serviceOfferingId, offeringIds));
    const slotIds = panoSlots.map((s) => s.id);

    if (slotIds.length > 0) {
      await db.delete(appointments).where(inArray(appointments.slotId, slotIds));
    }
    // Belt-and-suspenders: any stray PANO-APT- appointments not covered above.
    await db.delete(appointments).where(like(appointments.publicToken, "PANO-APT-%"));
    if (slotIds.length > 0) {
      await db.delete(timeSlots).where(inArray(timeSlots.id, slotIds));
    }
    await db
      .delete(serviceScheduleRules)
      .where(inArray(serviceScheduleRules.serviceOfferingId, offeringIds));
    await db.delete(serviceOfferings).where(inArray(serviceOfferings.id, offeringIds));
    log(
      "OK",
      `  Deleted ${panoOfferings.length} PANO campaigns (offerings + ${slotIds.length} slots + appointments)`,
    );
  }

  // 10a. Pets tagged with PANO-
  const panoPets = await db
    .select({ id: pets.id })
    .from(pets)
    .where(like(pets.name, `${PANO_TAG}%`));

  log("INFO", `Found ${panoPets.length} PANO-tagged pets`);

  if (panoPets.length > 0) {
    const actorRows = (await db.execute(sql`SELECT id FROM profiles LIMIT 1`)) as unknown as Array<{
      id: string;
    }>;
    const actorId = actorRows[0]?.id ?? null;

    if (!actorId) {
      log("WARN", "No profile found — skipping pet_events deletion (no actor for override)");
    }

    const panoIds = panoPets.map((p) => p.id);
    const DEL_BATCH = 500;

    for (let start = 0; start < panoIds.length; start += DEL_BATCH) {
      const batch = panoIds.slice(start, start + DEL_BATCH);

      await db.transaction(async (tx) => {
        // FK-safe order for the derived families seeded by the vigilancia +
        // enforcement steps. These reference PANO pet_events / pets and MUST be
        // removed before the pet_events / pets deletes below:
        //   1. eno_processing_queue.pet_event_id — NO FK (just a unique idx), so
        //      it never cascades; delete explicitly by the PANO pet_event IDs.
        //   2. event_notification_outbox.source_event_id — ON DELETE CASCADE on
        //      pet_events (auto-cleans), but we delete explicitly for clarity.
        //   3. cases.primary_pet_id — ON DELETE CASCADE on pets (auto-cleans);
        //      seeded cases never set pet_events.case_id (which is ON DELETE
        //      RESTRICT), so there is no restrict dependency to order around.
        const batchEventIds = (
          await tx
            .select({ id: petEvents.id })
            .from(petEvents)
            .where(inArray(petEvents.petId, batch))
        ).map((r) => r.id);

        if (batchEventIds.length > 0) {
          await tx
            .delete(enoProcessingQueue)
            .where(inArray(enoProcessingQueue.petEventId, batchEventIds));
          await tx
            .delete(eventNotificationOutbox)
            .where(inArray(eventNotificationOutbox.sourceEventId, batchEventIds));
        }
        await tx.delete(cases).where(inArray(cases.primaryPetId, batch));

        if (actorId) {
          await tx.execute(sql`SELECT set_config('app.allow_event_mutation', 'true', true)`);
          await tx.execute(
            sql`SELECT set_config('app.allow_event_mutation_actor', ${actorId}, true)`,
          );
          await tx.delete(petEvents).where(inArray(petEvents.petId, batch));
        }
        await tx.delete(ownerships).where(inArray(ownerships.petId, batch));
        await tx.delete(pets).where(inArray(pets.id, batch));
      });

      log("OK", `  Deleted pet batch [${start}..${start + batch.length - 1}]`);
    }
  }

  // 10a-bis. Belt-and-suspenders: remove any PANO-CASE-tagged cases that, for
  // whatever reason, did not cascade with their primary pet (e.g. a case whose
  // pet was already gone). Keyed off the deterministic public_code prefix.
  const deletedCases = await db.execute(
    sql`DELETE FROM cases WHERE public_code LIKE 'PANO-CASE-%'`,
  );
  log("OK", `  Deleted PANO cases (${JSON.stringify(deletedCases)})`);

  // 10b. PANO organizations
  const panoOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(like(organizations.publicToken, "PANO-ORG-%"));

  if (panoOrgs.length > 0) {
    await db.delete(organizations).where(
      inArray(
        organizations.id,
        panoOrgs.map((o) => o.id),
      ),
    );
    log("OK", `  Deleted ${panoOrgs.length} PANO organizations`);
  }

  // 10c. PANO welfare reports (description contains seed marker)
  const deletedWelfare = await db.execute(
    sql`DELETE FROM welfare_reports WHERE description LIKE 'PANO-%'`,
  );
  log("OK", `  Deleted PANO welfare reports (${JSON.stringify(deletedWelfare)})`);

  // 10d. PANO synthetic owner profile
  await db.execute(sql`DELETE FROM profiles WHERE display_name = 'PANO-Seed-Owner'`);

  log("DONE", "Clean complete");
}

// ---------------------------------------------------------------------------
// 11. Welfare reports seeding
// ---------------------------------------------------------------------------

async function seedWelfareReports(
  localitiesByCode: Map<string, LocalityRow[]>,
  census: CensusRow[],
  totalWelfare: number,
): Promise<number> {
  log("STEP", `Seeding ~${totalWelfare} welfare reports…`);

  const WELFARE_BATCH = 100;
  let inserted = 0;

  const rows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < totalWelfare; i++) {
    // Pick province weighted by population
    const totalPop = census.reduce((s, c) => s + c.population, 0);
    let popR = rng() * totalPop;
    let prov = census[census.length - 1];
    for (const c of census) {
      popR -= c.population;
      if (popR <= 0) {
        prov = c;
        break;
      }
    }

    const loc = pickLocality(prov.provinceName, localitiesByCode);
    const { lat, lng } = loc
      ? jitteredCoord(loc.lat, loc.lng, 0.05)
      : { lat: -34.6 + gaussianJitter(2), lng: -58.4 + gaussianJitter(4) };

    const kindEntry = pickWeighted(
      WELFARE_KINDS as unknown as Array<{ kind: string; weight: number }>,
    );
    const severityEntry = pickWeighted(
      WELFARE_SEVERITIES as unknown as Array<{ severity: string; weight: number }>,
    );

    const referenceCode = generateReferenceCode();
    const occurredAt = randomWindowDate();

    rows.push({
      referenceCode,
      kind: kindEntry.kind,
      severity: severityEntry.severity,
      description: `PANO-welfare-${String(i).padStart(5, "0")} — denuncia sintética de demostración`,
      subjectKind: pick(["unowned_animal", "location", "general", "unowned_animal"] as const),
      status: "open" as const,
      flagReasons: [],
      jurisdictionProvince: prov.provinceName,
      jurisdictionLocality: loc?.localityName ?? null,
      locationLat: lat.toFixed(7),
      locationLng: lng.toFixed(7),
      occurredAt,
    });
  }

  for (let b = 0; b < rows.length; b += WELFARE_BATCH) {
    const batch = rows.slice(b, b + WELFARE_BATCH);
    await db.insert(welfareReports).values(
      batch as Parameters<typeof db.insert<typeof welfareReports>>[0] extends {
        values: (v: infer V) => unknown;
      }
        ? V
        : never,
    );
    inserted += batch.length;
  }

  log("INFO", `  Inserted ${inserted} welfare reports`);
  return inserted;
}

// ---------------------------------------------------------------------------
// 12. Build per-pet event list
// ---------------------------------------------------------------------------

function buildPetEvents(
  petId: string,
  ownerUserId: string,
  species: string,
  provinceName: string,
  lat: number,
  lng: number,
  petIndex: number,
  opts: { shelterOrgId: string | null; dangerousBreed: boolean },
): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  const coverage = PROVINCE_COVERAGE[provinceName] ?? { vacc: 0.15, chip: 0.05, ster: 0.18 };

  // Acquisition method (D-adoption): a fraction of registrations are "adopted".
  // /gob/analytics derives the adoption rate from this pet_registered payload
  // field (acquisition_method='adopted'), NOT from adoption_finalized — so the
  // KPI only moves when this is populated. Shelter-custody pets always count
  // as adopted; the rest pick up the baseline rate.
  const acquisitionMethod: string =
    opts.shelterOrgId !== null || rng() < ADOPTION_ACQUISITION_RATE
      ? "adopted"
      : pick(["purchased", "found_stray", "gift", "born_in_litter", "other"] as const);

  // Always: pet_registered
  const registeredAt = randomWindowDate(WINDOW_DAYS + 180); // can be older than window
  events.push({
    petId,
    eventType: "pet_registered" satisfies EventType,
    occurredAt: registeredAt,
    recordedByUserId: ownerUserId,
    authorRole: "owner",
    authorVerified: false,
    payload: {
      source: "seed-panorama",
      species,
      pet_index: petIndex,
      acquisition_method: acquisitionMethod,
      potentially_dangerous_breed: opts.dangerousBreed,
    },
    ...writePoint(jitteredCoord(lat, lng, 0.02)),
  });

  // Vaccination: per coverage rate
  if (rng() < coverage.vacc) {
    const vaccinatedAt = randomWindowDate();
    events.push({
      petId,
      eventType: "vaccination_administered" satisfies EventType,
      occurredAt: vaccinatedAt,
      recordedByUserId: ownerUserId,
      authorRole: "owner",
      authorVerified: false,
      payload: {
        source: "seed-panorama",
        vaccine_name: "antirrábica",
        brand: pick(["Defensor 3", "Rabvac 3", "Nobivac Rabies"]),
        batch: `PANO-${String(petIndex % 9999).padStart(4, "0")}`,
        next_due_at: null,
      },
      ...writePoint(jitteredCoord(lat, lng, 0.02)),
    });
  }

  // Microchip: per coverage rate
  if (rng() < coverage.chip) {
    const chipBase = String(petIndex).padStart(9, "0");
    events.push({
      petId,
      eventType: "microchip_implanted" satisfies EventType,
      occurredAt: randomWindowDate(WINDOW_DAYS + 365),
      recordedByUserId: ownerUserId,
      authorRole: "owner",
      authorVerified: false,
      payload: {
        source: "seed-panorama",
        chip_number: `858${chipBase}`,
        country_code: "858",
        implanted_by: null,
        location_on_body: "interscapular",
        implant_date_known: true,
      },
    });
  }

  // Sterilization: per-province rate × global multiplier. The KPI
  // (fetchSterilizationMetrics) counts events in the LAST 30 DAYS and the
  // distinct author orgs, so we date these within the 28-day window and
  // attribute a share to the shelter org (org ranking) — the rest stay
  // owner-vet logged.
  if (rng() < coverage.ster * (STERILIZATION_RATE / 0.28)) {
    const attributeToOrg = opts.shelterOrgId !== null || rng() < 0.35;
    events.push({
      petId,
      eventType: "sterilization_performed" satisfies EventType,
      occurredAt: randomWindowDate(28),
      recordedByUserId: ownerUserId,
      authorRole: attributeToOrg ? "vet" : "owner",
      authorVerified: attributeToOrg,
      ...(opts.shelterOrgId !== null ? { authorOrganizationId: opts.shelterOrgId } : {}),
      payload: {
        source: "seed-panorama",
        procedure: species === "cat" || rng() < 0.5 ? "castration" : "spay",
        performed_by: attributeToOrg ? "Veterinaria municipal (seed)" : null,
        clinic: opts.shelterOrgId !== null ? "Red de esterilización (seed)" : null,
      },
      ...writePoint(jitteredCoord(lat, lng, 0.02)),
    });
  }

  // Dangerous-breed attestation (PPP / C7): only a fraction of flagged pets
  // are actually attested → Registro PPP coverage stays < 100% (the
  // compliance-gap story). attested_at is an ISO date string per the schema.
  if (opts.dangerousBreed && rng() < PPP_ATTEST_RATE) {
    const attestedAt = randomWindowDate(WINDOW_DAYS + 120);
    events.push({
      petId,
      eventType: "dangerous_breed_attested" satisfies EventType,
      occurredAt: attestedAt,
      recordedByUserId: ownerUserId,
      authorRole: "owner",
      authorVerified: false,
      payload: {
        source: "seed-panorama",
        registry: pick(["caba_4078", "prov_14107", "other"] as const),
        registry_id: `PPP-${String(petIndex % 99999).padStart(5, "0")}`,
        attested_at: attestedAt.toISOString().slice(0, 10),
      },
      ...writePoint(jitteredCoord(lat, lng, 0.02)),
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// 13. Main seeding loop — pets by province
// ---------------------------------------------------------------------------

async function seedPets(
  localitiesByCode: Map<string, LocalityRow[]>,
  census: CensusRow[],
  ownerUserId: string,
  shelterOrgs: PanoOrg[],
): Promise<{
  totalPets: number;
  lostPets: number;
  deceasedPets: number;
  eventCounts: Record<string, number>;
  globalIndex: number;
}> {
  log("STEP", "Seeding pets by province…");

  let globalIndex = 0;
  let totalPets = 0;
  let lostPets = 0;
  let deceasedPets = 0;
  const eventCounts: Record<string, number> = {};

  for (const censusProv of census) {
    const provinceName = censusProv.provinceName;
    const provinceCount = Math.max(1, Math.round(censusProv.population * PETS_PER_CAPITA * SCALE));

    log(
      "INFO",
      `  ${provinceName}: ${provinceCount} pets (pop ${censusProv.population.toLocaleString()})`,
    );

    // Collect pet rows for this province
    const petRows: Array<Record<string, unknown>> = [];
    const perPetMeta: Array<{
      index: number;
      status: "active" | "lost" | "deceased";
      lat: number;
      lng: number;
      provinceName: string;
      species: string;
      dangerousBreed: boolean;
      reunified: boolean;
    }> = [];

    for (let i = 0; i < provinceCount; i++) {
      const idx = globalIndex + i;
      const speciesEntry = pickWeighted(
        SPECIES_DIST as unknown as Array<{ species: string; weight: number }>,
      );
      const species = speciesEntry.species;
      const name = pick(PET_NAMES);
      const sex = pick(SEXES);

      const loc = pickLocality(provinceName, localitiesByCode);
      const baseLat = loc ? loc.lat : -34.6 + gaussianJitter(4);
      const baseLng = loc ? loc.lng : -58.4 + gaussianJitter(6);
      const { lat, lng } = jitteredCoord(baseLat, baseLng, 0.03);

      // Status: ~0.4% lost, ~0.3% deceased, rest active
      const r = rng();
      let status: "active" | "lost" | "deceased" = "active";
      if (r < 0.004) {
        status = "lost";
        lostPets++;
      } else if (r < 0.007) {
        status = "deceased";
        deceasedPets++;
      }

      // PPP flag (potentially dangerous breed). Only dogs qualify (Ley CABA
      // 4078 / Prov 14.107). Drives the dangerous_breed_attested attestation
      // event later so the Registro PPP shows < 100% coverage.
      const dangerousBreed = species === "dog" && rng() < DANGEROUS_BREED_FLAG_RATE;

      // Reunification (D4): a fraction of lost pets are later found/returned.
      // The draw happens here so the per-pet RNG sequence stays stable; the
      // found event + status flip are emitted alongside the lost event below.
      const reunified = status === "lost" && rng() < REUNIFICATION_RATE;

      const publicToken = panoPublicToken(idx);
      const petName = panoName(idx, name);

      petRows.push({
        publicToken,
        species,
        name: petName,
        sex,
        // A reunified pet ends back "active" — the status flip is captured by
        // the paired lost→found status_changed events on the timeline.
        status: status === "lost" && reunified ? "active" : status,
        jurisdictionCountry: "AR",
        jurisdictionProvince: provinceName,
        jurisdictionLocality: loc?.localityName ?? null,
        potentiallyDangerousBreed: dangerousBreed,
        emergencyInfoVisible: false,
        ...(status === "deceased" ? { deceasedAt: randomWindowDate(WINDOW_DAYS) } : {}),
      });

      perPetMeta.push({
        index: idx,
        status,
        lat,
        lng,
        provinceName,
        species,
        dangerousBreed,
        reunified,
      });
    }

    // Batch insert pets
    for (let b = 0; b < petRows.length; b += BATCH_SIZE) {
      const batch = petRows.slice(b, b + BATCH_SIZE);
      await db.insert(pets).values(
        batch as Parameters<typeof db.insert<typeof pets>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never,
      );
    }

    // Fetch inserted pet IDs by publicToken
    const startToken = panoPublicToken(globalIndex);
    const endToken = panoPublicToken(globalIndex + provinceCount - 1);
    const insertedPets = await db
      .select({ id: pets.id, publicToken: pets.publicToken })
      .from(pets)
      .where(sql`${pets.publicToken} >= ${startToken} AND ${pets.publicToken} <= ${endToken}`)
      .orderBy(pets.publicToken);

    const tokenToId = new Map(insertedPets.map((p) => [p.publicToken, p.id]));

    // Build ownerships + events
    const ownershipRows: Array<Record<string, unknown>> = [];
    const eventRows: Array<Record<string, unknown>> = [];

    for (let i = 0; i < provinceCount; i++) {
      const meta = perPetMeta[i];
      const petId = tokenToId.get(panoPublicToken(meta.index));
      if (!petId) continue;

      // ~2% of pets belong to a shelter org (if available)
      const useShelterOrg = shelterOrgs.length > 0 && rng() < 0.02;
      const shelterOrg = useShelterOrg
        ? (shelterOrgs.find((o) => o.provinceName === meta.provinceName) ?? shelterOrgs[0])
        : null;

      if (shelterOrg) {
        ownershipRows.push({
          petId,
          ownerOrganizationId: shelterOrg.id,
          role: "shelter_custody",
        });
      } else {
        ownershipRows.push({
          petId,
          ownerUserId,
          role: "owner",
        });
      }

      // Build events
      const evts = buildPetEvents(
        petId,
        ownerUserId,
        meta.species,
        meta.provinceName,
        meta.lat,
        meta.lng,
        meta.index,
        { shelterOrgId: shelterOrg?.id ?? null, dangerousBreed: meta.dangerousBreed },
      );

      // Lost pet → status_changed event (active → lost).
      if (meta.status === "lost") {
        const lostAt = randomWindowDate(30); // recent
        evts.push({
          petId,
          eventType: "status_changed" satisfies EventType,
          occurredAt: lostAt,
          recordedByUserId: ownerUserId,
          authorRole: "owner",
          authorVerified: false,
          payload: {
            source: "seed-panorama",
            from_status: "active",
            to_status: "lost",
            location_description: "AMBA / zona de búsqueda activa",
          },
          ...writePoint(jitteredCoord(meta.lat, meta.lng, 0.04)),
        });

        // Reunification (D4): a fraction are found/returned → a second
        // status_changed (lost → active) a few days after the loss. The pet
        // row was created back in "active" for these so the timeline + the
        // current status reconcile. Realistic reunification rate for /gob.
        if (meta.reunified) {
          evts.push({
            petId,
            eventType: "status_changed" satisfies EventType,
            occurredAt: new Date(lostAt.getTime() + randInt(1, 9) * 24 * 3600 * 1000),
            recordedByUserId: ownerUserId,
            authorRole: "owner",
            authorVerified: false,
            payload: {
              source: "seed-panorama",
              from_status: "lost",
              to_status: "active",
              location_description: "Reencuentro con la familia (seed)",
              reunified: true,
            },
            ...writePoint(jitteredCoord(meta.lat, meta.lng, 0.04)),
          });
        }
      }

      // Shelter-custody pet → adoption_finalized event (D-adoption). Models the
      // org→owner handoff so the adoption-event family is non-empty; the
      // analytics adoption RATE is separately driven by pet_registered
      // acquisition_method='adopted' (set in buildPetEvents).
      if (shelterOrg && rng() < 0.5) {
        evts.push({
          petId,
          eventType: "adoption_finalized" satisfies EventType,
          occurredAt: randomWindowDate(WINDOW_DAYS),
          recordedByUserId: ownerUserId,
          authorRole: "shelter",
          authorVerified: true,
          authorOrganizationId: shelterOrg.id,
          payload: {
            source: "seed-panorama",
            previous_owner_organization_id: shelterOrg.id,
            adopter_user_id: ownerUserId,
            foster_user_id: null,
            contract_attachment_id: null,
            post_adoption_followup_months: pick([6, 12]),
            notes: null,
          },
        });
      }

      // Deceased pet → death_recorded event
      if (meta.status === "deceased") {
        evts.push({
          petId,
          eventType: "death_recorded" satisfies EventType,
          occurredAt: randomWindowDate(WINDOW_DAYS),
          recordedByUserId: ownerUserId,
          authorRole: "owner",
          authorVerified: false,
          payload: {
            source: "seed-panorama",
            // "disease" is the canonical DEATH_CAUSES value (deathCauseLabel maps
            // it to "Enfermedad"); "illness" rendered raw (dashboards D3).
            cause: pick(["natural", "accident", "disease", "euthanasia"]),
            cause_detail: null,
            confirmed_by_vet: rng() < 0.4,
            vet_name: null,
            disposition_method: pick([
              "owner_burial",
              "cremation",
              "authorized_cemetery",
              "unknown",
            ]),
            // Institutional disposals carry a facility → traceable (B3). Without
            // any facilities the traceability KPI read a misleading 0% (D4).
            facility: rng() < 0.45 ? "Establecimiento habilitado (seed)" : null,
            death_at_clinic: false,
            vet_contacted_owner: "unknown",
            vet_decided_alone: null,
            is_reportable: false,
            during_rabies_observation: false,
          },
        });
      }

      for (const e of evts) eventRows.push(e);
      for (const e of evts) {
        const t = e.eventType as string;
        eventCounts[t] = (eventCounts[t] ?? 0) + 1;
      }
    }

    // Batch insert ownerships
    for (let b = 0; b < ownershipRows.length; b += BATCH_SIZE) {
      const batch = ownershipRows.slice(b, b + BATCH_SIZE);
      await db.insert(ownerships).values(
        batch as Parameters<typeof db.insert<typeof ownerships>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never,
      );
    }

    // Batch insert events
    for (let b = 0; b < eventRows.length; b += BATCH_SIZE) {
      const batch = eventRows.slice(b, b + BATCH_SIZE);
      await db.insert(petEvents).values(
        batch as Parameters<typeof db.insert<typeof petEvents>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never,
      );
    }

    totalPets += provinceCount;
    globalIndex += provinceCount;
  }

  return { totalPets, lostPets, deceasedPets, eventCounts, globalIndex };
}

// ---------------------------------------------------------------------------
// 14. Set-pieces: rabies cluster (NOA), La Plata zoonosis cluster, k-anon localities
// ---------------------------------------------------------------------------

async function seedSetPieces(
  localitiesByCode: Map<string, LocalityRow[]>,
  ownerUserId: string,
  globalIndexStart: number,
): Promise<{ globalIndex: number; eventCounts: Record<string, number> }> {
  log("STEP", "Seeding set-pieces (clusters + k-anon localities)…");

  const eventCounts: Record<string, number> = {};
  let gIdx = globalIndexStart;

  // Helper to insert a single set-piece pet + ownership + events
  async function insertSetPiecePet(
    provinceName: string,
    localityName: string,
    lat: number,
    lng: number,
    extraEvents: Array<Record<string, unknown>>,
    status: "active" | "lost" | "deceased" = "active",
  ): Promise<string> {
    const token = panoPublicToken(gIdx);
    const petName = panoName(gIdx, pick(PET_NAMES));
    gIdx++;

    const [petRow] = await db
      .insert(pets)
      .values({
        publicToken: token,
        species: "dog",
        name: petName,
        sex: "unknown",
        status,
        jurisdictionCountry: "AR",
        jurisdictionProvince: provinceName,
        jurisdictionLocality: localityName,
        potentiallyDangerousBreed: false,
        emergencyInfoVisible: false,
        ...(status === "deceased" ? { deceasedAt: randomWindowDate(30) } : {}),
      })
      .returning({ id: pets.id });

    await db.insert(ownerships).values({ petId: petRow.id, ownerUserId, role: "owner" });

    // Base registration event
    const baseEvts: Array<Record<string, unknown>> = [
      {
        petId: petRow.id,
        eventType: "pet_registered" satisfies EventType,
        occurredAt: randomWindowDate(WINDOW_DAYS + 180),
        recordedByUserId: ownerUserId,
        authorRole: "owner",
        authorVerified: false,
        payload: { source: "seed-panorama-setpiece" },
        ...writePoint(jitteredCoord(lat, lng, 0.01)),
      },
      ...extraEvents.map((e) => ({ ...e, petId: petRow.id })),
    ];

    if (baseEvts.length > 0) {
      await db.insert(petEvents).values(
        baseEvts as Parameters<typeof db.insert<typeof petEvents>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never,
      );
    }

    for (const e of baseEvts) {
      const t = e.eventType as string;
      eventCounts[t] = (eventCounts[t] ?? 0) + 1;
    }

    return petRow.id;
  }

  // --- 14a. Rabies cluster: Salta — 4 bite events + 2 deaths within 12 days ---
  {
    const code = PROVINCE_TO_CODE.get("Salta");
    const locs = code ? (localitiesByCode.get(code) ?? []) : [];
    const saltaLoc = locs.find((l) => l.localityName.toLowerCase() === "salta") ?? locs[0];
    const baseLat = saltaLoc?.lat ?? -24.78;
    const baseLng = saltaLoc?.lng ?? -65.41;
    const clusterStart = ANCHOR_MS - 14 * 24 * 3600 * 1000; // 14 days ago

    log("INFO", "  Set-piece: rabies cluster (Salta)");

    for (let k = 0; k < 6; k++) {
      const dayOffset = k * 2; // spread over 12 days
      const occurredAt = new Date(clusterStart + dayOffset * 24 * 3600 * 1000);
      const isDeath = k >= 4;

      const extraEvents: Array<Record<string, unknown>> = [
        {
          eventType: "incident_reported" satisfies EventType,
          occurredAt,
          recordedByUserId: ownerUserId,
          authorRole: "vet",
          authorVerified: true,
          payload: {
            source: "seed-panorama-setpiece",
            incident_type: "bite_inflicted",
            severity: isDeath ? "severe" : "moderate",
            injuries_summary: `Mordedura NOA set-piece #${k + 1}`,
            vet_involved: true,
            location_description: "Salta capital — cluster rabia (seed)",
            rabies_vaccine_valid_at_incident: false,
          },
          ...writePoint(jitteredCoord(baseLat, baseLng, 0.005)),
        },
        {
          // D2: /gob/vigilancia counts pet_events.eventType='outbreak_signal'
          // (scoped via payload jurisdiction). Without these the surveillance
          // surface read 0 signals despite the bite cluster. Emit one per pet so
          // the Salta rabies cluster is visible + queryable.
          eventType: "outbreak_signal" satisfies EventType,
          occurredAt,
          recordedByUserId: ownerUserId,
          authorRole: "govt",
          authorVerified: true,
          payload: {
            source: "seed-panorama-setpiece",
            disease_code: isDeath ? "rabies_confirmed" : "rabies_suspected",
            disease_label: isDeath ? "Rabia (confirmada)" : "Rabia (sospechada)",
            pet_jurisdiction_province: "Salta",
            pet_jurisdiction_locality: saltaLoc?.localityName ?? "Salta",
            status: "open",
          },
          ...writePoint(jitteredCoord(baseLat, baseLng, 0.005)),
        },
      ];

      if (isDeath) {
        extraEvents.push({
          eventType: "death_recorded" satisfies EventType,
          occurredAt: new Date(occurredAt.getTime() + 2 * 24 * 3600 * 1000),
          recordedByUserId: ownerUserId,
          authorRole: "vet",
          authorVerified: true,
          payload: {
            source: "seed-panorama-setpiece",
            cause: "disease",
            cause_detail: "sospecha de rabia — cluster NOA",
            confirmed_by_vet: true,
            vet_name: null,
            disposition_method: "cremation",
            facility: "Crematorio Veterinario Salta (seed)",
            death_at_clinic: true,
            vet_contacted_owner: "yes",
            vet_decided_alone: null,
            is_reportable: true,
            during_rabies_observation: true,
          },
        });
      }

      await insertSetPiecePet(
        "Salta",
        saltaLoc?.localityName ?? "Salta",
        baseLat,
        baseLng,
        extraEvents,
        isDeath ? "deceased" : "active",
      );
    }
  }

  // --- 14b. La Plata zoonosis cluster — 3 disease_reported events ---
  {
    const code = PROVINCE_TO_CODE.get("Buenos Aires");
    const locs = code ? (localitiesByCode.get(code) ?? []) : [];
    const laPlataLoc = locs.find((l) => l.localityName.toLowerCase() === "la plata") ?? locs[0];
    const baseLat = laPlataLoc?.lat ?? -34.92;
    const baseLng = laPlataLoc?.lng ?? -57.95;

    log("INFO", "  Set-piece: La Plata zoonosis cluster");

    for (let k = 0; k < 3; k++) {
      const occurredAt = randomWindowDate(21);
      await insertSetPiecePet(
        "Buenos Aires",
        laPlataLoc?.localityName ?? "La Plata",
        baseLat,
        baseLng,
        [
          {
            eventType: "disease_reported" satisfies EventType,
            occurredAt,
            recordedByUserId: ownerUserId,
            authorRole: "vet",
            authorVerified: true,
            payload: {
              source: "seed-panorama-setpiece",
              disease: pick(["lepto", "hidatidosis", "other"]),
              confirmed_by_lab: k === 0,
              date_of_onset: new Date(occurredAt.getTime() - 3 * 24 * 3600 * 1000)
                .toISOString()
                .slice(0, 10),
              clinical_notes: `Zoonosis cluster La Plata #${k + 1} (seed-panorama)`,
            },
            ...writePoint(jitteredCoord(baseLat, baseLng, 0.01)),
          },
        ],
      );
    }
  }

  // --- 14c. AMBA lost hotspot — 8 additional lost pets in conurbano sur ---
  {
    const code = PROVINCE_TO_CODE.get("Buenos Aires");
    const locs = code ? (localitiesByCode.get(code) ?? []) : [];
    const hotspotLocalities = ["Quilmes", "Lanús", "Lomas de Zamora"];

    log("INFO", "  Set-piece: AMBA lost hotspot (conurbano sur)");

    for (let k = 0; k < 8; k++) {
      const locality = hotspotLocalities[k % hotspotLocalities.length];
      const loc =
        locs.find((l) => l.localityName.toLowerCase() === locality.toLowerCase()) ?? locs[0];
      const baseLat = loc?.lat ?? -34.72;
      const baseLng = loc?.lng ?? -58.26;

      await insertSetPiecePet(
        "Buenos Aires",
        loc?.localityName ?? "Quilmes",
        baseLat,
        baseLng,
        [
          {
            eventType: "status_changed" satisfies EventType,
            occurredAt: randomWindowDate(14),
            recordedByUserId: ownerUserId,
            authorRole: "owner",
            authorVerified: false,
            payload: {
              source: "seed-panorama-setpiece",
              from_status: "active",
              to_status: "lost",
              location_description: `${locality}, conurbano sur — hotspot AMBA (seed)`,
            },
            ...writePoint(jitteredCoord(baseLat, baseLng, 0.02)),
          },
        ],
        "lost",
      );
    }
  }

  // --- 14d. Small localities (<5 pets) for k-anon suppression demo ---
  {
    const smallLocalities: Array<{ province: string; locality: string; lat: number; lng: number }> =
      [
        { province: "Tierra del Fuego", locality: "Tolhuin", lat: -54.5, lng: -67.19 },
        { province: "Santa Cruz", locality: "Caleta Olivia", lat: -46.44, lng: -67.52 },
        { province: "La Pampa", locality: "General Pico", lat: -35.66, lng: -63.75 },
        { province: "Catamarca", locality: "Andalgalá", lat: -27.59, lng: -66.3 },
      ];

    log("INFO", "  Set-piece: small localities for k-anon suppression");

    for (const sl of smallLocalities) {
      // Insert exactly 2-3 pets in each to land below k-anon threshold
      const count = randInt(2, 3);
      for (let k = 0; k < count; k++) {
        await insertSetPiecePet(sl.province, sl.locality, sl.lat, sl.lng, []);
      }
    }
  }

  return { globalIndex: gIdx, eventCounts };
}

// ---------------------------------------------------------------------------
// 15. Seed bite / incident events on random existing PANO pets
// ---------------------------------------------------------------------------

async function seedBiteEvents(
  ownerUserId: string,
  census: CensusRow[],
  localitiesByCode: Map<string, LocalityRow[]>,
  biteCount: number,
): Promise<number> {
  log("STEP", `Seeding ~${biteCount} additional bite/incident events…`);

  // Fetch a sample of PANO pet IDs to attach bite events to
  const sample = await db
    .select({ id: petEvents.petId, petId: petEvents.petId })
    .from(petEvents)
    .where(
      sql`${petEvents.eventType} = 'pet_registered' AND ${petEvents.payload}->>'source' = 'seed-panorama'`,
    )
    .limit(biteCount * 3);

  if (sample.length === 0) {
    log("WARN", "  No PANO pet_registered events found — skipping bite events");
    return 0;
  }

  const eventRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < biteCount; i++) {
    // Pick a random pet from sample (weighted by population — approximate via index)
    const petRow = sample[Math.floor(rng() * sample.length)];
    const petId = petRow.id;

    // Pick a province weighted by population for geo
    const totalPop = census.reduce((s, c) => s + c.population, 0);
    let popR = rng() * totalPop;
    let prov = census[census.length - 1];
    for (const c of census) {
      popR -= c.population;
      if (popR <= 0) {
        prov = c;
        break;
      }
    }
    const loc = pickLocality(prov.provinceName, localitiesByCode);
    const { lat, lng } = loc
      ? jitteredCoord(loc.lat, loc.lng, 0.03)
      : { lat: -34.6 + gaussianJitter(2), lng: -58.4 + gaussianJitter(4) };

    eventRows.push({
      petId,
      eventType: "incident_reported" satisfies EventType,
      occurredAt: randomWindowDate(),
      recordedByUserId: ownerUserId,
      authorRole: "vet",
      authorVerified: false,
      payload: {
        source: "seed-panorama-bites",
        incident_type: "bite_inflicted",
        severity: pick(["minor", "moderate", "severe"] as const),
        injuries_summary: `Mordedura sintética #${i + 1} (seed-panorama)`,
        vet_involved: rng() < 0.6,
        location_description: `${loc?.localityName ?? prov.provinceName} (seed)`,
        rabies_vaccine_valid_at_incident: rng() < 0.5,
      },
      ...writePoint({ lat, lng }),
    });
  }

  for (let b = 0; b < eventRows.length; b += BATCH_SIZE) {
    const batch = eventRows.slice(b, b + BATCH_SIZE);
    await db.insert(petEvents).values(
      batch as Parameters<typeof db.insert<typeof petEvents>>[0] extends {
        values: (v: infer V) => unknown;
      }
        ? V
        : never,
    );
  }

  return eventRows.length;
}

// ---------------------------------------------------------------------------
// 15b. Vigilancia chain — rabies-observation lifecycle + ENO notification SLA
// ---------------------------------------------------------------------------
// Materializes the surveillance surface that bite EVENTS alone never light:
//   - rabies_observation_started / _ended pet_events (paired via
//     payload.observation_started_event_id) + pets.rabies_observation_status
//     in mixed states (in_progress / closed within 10d / overdue) → A8/A9
//     compliance + the "X rabia" KPI.
//   - open cases case_kind='rabies_observation' → fetchVigilanciaMetrics
//     rabiesActiveCount + the /gob/vigilancia map.
//   - eno_processing_queue rows (the worker queue) + event_notification_outbox
//     rows target_kind='eno_authority' (what fetchEnoSla A7 actually reads),
//     with mixed SLA (on-time delivered / overdue pending breach).
//
// NOTE (v2 fidelity): inserting these derived records directly is acceptable
// for the demo dataset. Running the real bite→observation use-case
// (reportBiteAction + the daily cron + eno-trigger) would be more faithful —
// it would also exercise the projection in lib/projections/pet-rabies-observation.ts.
async function seedVigilanceChain(
  ownerUserId: string,
  shelterOrgs: PanoOrg[],
): Promise<{ observations: number; cases: number; enoQueue: number; outbox: number }> {
  log("STEP", "Seeding vigilancia chain (rabies observations + ENO SLA)…");

  // Attach observations to a mix: the Salta rabies set-piece pets (the bite
  // cluster) + a thin national baseline of PANO pets. Fetch deceased/reportable
  // set-piece pets first, then top up with random PANO pets.
  const setpiecePets = await db
    .select({ petId: petEvents.petId })
    .from(petEvents)
    .where(
      sql`${petEvents.eventType} = 'incident_reported'
          AND ${petEvents.payload}->>'source' = 'seed-panorama-setpiece'
          AND ${petEvents.payload}->>'incident_type' = 'bite_inflicted'`,
    )
    .limit(20);

  const baselinePets = await db
    .select({ petId: petEvents.petId, province: pets.jurisdictionProvince })
    .from(petEvents)
    .innerJoin(pets, sql`${pets.id} = ${petEvents.petId}`)
    .where(
      sql`${petEvents.eventType} = 'pet_registered' AND ${petEvents.payload}->>'source' = 'seed-panorama'`,
    )
    .limit(30);

  // Dedup pet ids; cap the chain at a demo-friendly size.
  const seen = new Set<string>();
  const targets: Array<{ petId: string; province: string | null }> = [];
  for (const r of setpiecePets) {
    if (!seen.has(r.petId)) {
      seen.add(r.petId);
      targets.push({ petId: r.petId, province: "Salta" });
    }
  }
  for (const r of baselinePets) {
    if (targets.length >= 24) break;
    if (!seen.has(r.petId)) {
      seen.add(r.petId);
      targets.push({ petId: r.petId, province: r.province });
    }
  }

  if (targets.length === 0) {
    log("WARN", "  No PANO pets found for vigilancia chain — skipping");
    return { observations: 0, cases: 0, enoQueue: 0, outbox: 0 };
  }

  const sanitaryOrg = shelterOrgs.find((o) => o.provinceName === "Chaco") ?? shelterOrgs[0] ?? null;

  let observations = 0;
  let caseCount = 0;
  let enoQueueCount = 0;
  let outboxCount = 0;

  // Each target gets one observation in a deterministic mixed state:
  //   0 → in_progress (recent)         → "X rabia" KPI + open case
  //   1 → closed within 10 days        → A8 compliant
  //   2 → overdue open (started > 10d)  → A9 live breach
  //   3 → closed past 10 days          → A8 non-compliant
  for (let t = 0; t < targets.length; t++) {
    const { petId, province } = targets[t];
    const bucket = t % 4;

    // Start date: overdue/closed-late buckets start well before the 10d window.
    const startDaysBack = bucket === 2 || bucket === 3 ? randInt(13, 25) : randInt(2, 8);
    const startedAt = new Date(ANCHOR_MS - startDaysBack * 24 * 3600 * 1000);

    const [startedEvent] = await db
      .insert(petEvents)
      .values({
        petId,
        eventType: "rabies_observation_started" satisfies EventType,
        occurredAt: startedAt,
        recordedByUserId: ownerUserId,
        authorRole: "vet",
        authorVerified: true,
        ...(sanitaryOrg ? { authorOrganizationId: sanitaryOrg.id } : {}),
        payload: {
          source: "seed-panorama-vigilancia",
          incident_type: "bite_inflicted",
          observation_days: 10,
        },
      } as Parameters<typeof db.insert<typeof petEvents>>[0] extends {
        values: (v: infer V) => unknown;
      }
        ? V
        : never)
      .returning({ id: petEvents.id });

    observations++;

    let rabiesStatus: string;
    if (bucket === 1 || bucket === 3) {
      // Closed: emit a paired ended event. Bucket 1 closes within 10d,
      // bucket 3 closes after 10d (compliance non-compliant).
      const elapsedDays = bucket === 1 ? randInt(6, 10) : randInt(12, 16);
      const endedAt = new Date(startedAt.getTime() + elapsedDays * 24 * 3600 * 1000);
      await db.insert(petEvents).values({
        petId,
        eventType: "rabies_observation_ended" satisfies EventType,
        occurredAt: endedAt,
        recordedByUserId: ownerUserId,
        authorRole: "vet",
        authorVerified: true,
        ...(sanitaryOrg ? { authorOrganizationId: sanitaryOrg.id } : {}),
        payload: {
          source: "seed-panorama-vigilancia",
          observation_started_event_id: startedEvent.id,
          outcome: "negative",
        },
      } as Parameters<typeof db.insert<typeof petEvents>>[0] extends {
        values: (v: infer V) => unknown;
      }
        ? V
        : never);
      rabiesStatus = "completed_negative";
    } else {
      // Open: in_progress (bucket 0 recent, bucket 2 overdue breach).
      rabiesStatus = "in_progress";
    }

    // Dual-write the denormalized status column on the pet (mirrors the cron).
    await db.execute(
      sql`UPDATE pets SET rabies_observation_status = ${rabiesStatus} WHERE id = ${petId}`,
    );

    // Open a case for in_progress observations so rabiesActiveCount + the map
    // light up. caseKind='rabies_observation' is read literally by
    // fetchVigilanciaMetrics; case_kind is unconstrained text in the DB.
    if (rabiesStatus === "in_progress") {
      const prov = province ?? "Salta";
      await db.insert(cases).values({
        publicCode: `PANO-CASE-RABOBS-${String(t).padStart(4, "0")}`,
        caseKind: "rabies_observation",
        status: "open",
        primarySubjectKind: "registered_pet",
        primaryPetId: petId,
        jurisdictionCountry: "AR",
        jurisdictionProvince: prov,
        openedReason: "auto: observación rábica de 10 días (seed-panorama)",
        openedAt: startedAt,
      } as Parameters<typeof db.insert<typeof cases>>[0] extends {
        values: (v: infer V) => unknown;
      }
        ? V
        : never);
      caseCount++;
    }

    // ENO pipeline: enqueue a processing-queue row (the worker queue) AND an
    // event_notification_outbox row (target_kind='eno_authority' — what A7
    // reads). Mixed SLA: even buckets delivered on-time, odd buckets are an
    // overdue pending breach.
    const onTime = t % 2 === 0;
    const createdAt = new Date(ANCHOR_MS - randInt(1, 20) * 24 * 3600 * 1000);
    const slaHours = 48;
    const slaDueAt = new Date(createdAt.getTime() + slaHours * 3600 * 1000);

    await db.insert(enoProcessingQueue).values({
      petEventId: startedEvent.id,
      status: onTime ? "processed" : "pending",
      queuedAt: createdAt,
      ...(onTime ? { processedAt: new Date(createdAt.getTime() + 6 * 3600 * 1000) } : {}),
      retryCount: onTime ? 0 : 1,
    } as Parameters<typeof db.insert<typeof enoProcessingQueue>>[0] extends {
      values: (v: infer V) => unknown;
    }
      ? V
      : never);
    enoQueueCount++;

    await db.insert(eventNotificationOutbox).values({
      sourceEventId: startedEvent.id,
      targetKind: "eno_authority",
      targetJurisdictionProvince: province ?? "Salta",
      targetJurisdictionLocality: province === "Salta" || !province ? "Salta" : null,
      payloadSnapshot: { source: "seed-panorama-vigilancia" },
      slaDueAt,
      // onTime → delivered before the deadline; breach → still pending past it.
      status: onTime ? "delivered" : "pending",
      ...(onTime
        ? { deliveredAt: new Date(createdAt.getTime() + (slaHours - 6) * 3600 * 1000) }
        : {}),
      createdAt,
    } as Parameters<typeof db.insert<typeof eventNotificationOutbox>>[0] extends {
      values: (v: infer V) => unknown;
    }
      ? V
      : never);
    outboxCount++;
  }

  log(
    "INFO",
    `  Vigilancia chain: ${observations} observations, ${caseCount} rabies cases, ${enoQueueCount} ENO-queue, ${outboxCount} outbox`,
  );
  return {
    observations,
    cases: caseCount,
    enoQueue: enoQueueCount,
    outbox: outboxCount,
  };
}

// ---------------------------------------------------------------------------
// 15c. Enforcement — decomiso (Ley 14.346) + custody-dispute cases
// ---------------------------------------------------------------------------
// The Panorama decomisos/disputas layers + drawer and /gob/analytics
// (custodyDisputes) read the `cases` table. There is no `decomiso` case_kind:
// app/actions/decomiso.ts materializes a decomiso as a `custody_episode` case
// with notes 'from_decomiso=true'. Disputes are case_kind='custody_dispute'
// (fetchAnalyticsMetrics counts the open ones).
//
// IMPORTANT: registered_pet cases must NOT set location_lat/lng — the
// cases_subject_location_consistency CHECK is a biconditional
// (primary_subject_kind='location') = (lat/lng NOT NULL). The Panorama
// decomisos/disputas layers + the /gob/vigilancia map read the case's
// jurisdiction (fetchCasesPerLocality groups by province/locality), not these
// coordinate columns, so location is correctly derived from the pet.
async function seedEnforcementCases(): Promise<{ decomisos: number; disputes: number }> {
  log("STEP", "Seeding enforcement cases (decomisos + custody disputes)…");

  // Attach to existing PANO pets (primary_pet_id ON DELETE CASCADE → auto-clean)
  // so the cases_subject_pet_consistency CHECK holds for registered_pet.
  const panoPets = await db
    .select({
      id: pets.id,
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
    })
    .from(pets)
    .where(like(pets.name, `${PANO_TAG}%`))
    .limit(40);

  if (panoPets.length === 0) {
    log("WARN", "  No PANO pets found for enforcement cases — skipping");
    return { decomisos: 0, disputes: 0 };
  }

  const SEIZURE_MOTIVES = ["maltrato", "abandono", "tenencia_ilegal", "orden_judicial"] as const;

  let decomisos = 0;
  let disputes = 0;
  let cursor = 0;

  // 6 decomisos (custody_episode, from_decomiso=true) spread across provinces.
  for (let k = 0; k < 6 && cursor < panoPets.length; k++, cursor++) {
    const pet = panoPets[cursor];
    const prov = pet.province ?? "Buenos Aires";
    const motive = pick(SEIZURE_MOTIVES);
    await db.insert(cases).values({
      publicCode: `PANO-CASE-DECOMISO-${String(k).padStart(4, "0")}`,
      caseKind: "custody_episode",
      status: "open",
      primarySubjectKind: "registered_pet",
      primaryPetId: pet.id,
      jurisdictionCountry: "AR",
      jurisdictionProvince: prov,
      jurisdictionLocality: pet.locality,
      openedReason: `auto: decomiso motivo=${motive} (Ley 14.346) judicial_ref=sin_ref (seed)`,
      openedAt: randomWindowDate(WINDOW_DAYS),
    } as Parameters<typeof db.insert<typeof cases>>[0] extends {
      values: (v: infer V) => unknown;
    }
      ? V
      : never);
    decomisos++;
  }

  // 5 custody disputes (open). A real dispute is created in lockstep with its
  // case (ARCH-E, app/actions/custody-disputes.ts): the case row, a
  // custody_dispute_raised pet_event, and the custody_disputes row the case
  // links back to via custody_dispute_id. /gob/analytics counts the open
  // `cases`; /gob/disputas lists the `custody_disputes` table — seeding only the
  // case half left the disputas list empty for everyone while analytics showed 5.
  for (let k = 0; k < 5 && cursor < panoPets.length; k++, cursor++) {
    const pet = panoPets[cursor];
    const prov = pet.province ?? "Buenos Aires";
    // custody_disputes.jurisdiction_locality is NOT NULL; coalesce so a pet
    // without a locality still yields a valid dispute row.
    const locality = pet.locality ?? "Sin especificar";
    const raisedAt = randomWindowDate(WINDOW_DAYS);

    const [disputeCase] = await db
      .insert(cases)
      .values({
        publicCode: `PANO-CASE-DISPUTE-${String(k).padStart(4, "0")}`,
        caseKind: "custody_dispute",
        status: "open",
        primarySubjectKind: "registered_pet",
        primaryPetId: pet.id,
        jurisdictionCountry: "AR",
        jurisdictionProvince: prov,
        jurisdictionLocality: locality,
        openedReason: "auto: disputa de custodia entre partes (seed-panorama)",
        openedAt: raisedAt,
      } as Parameters<typeof db.insert<typeof cases>>[0] extends {
        values: (v: infer V) => unknown;
      }
        ? V
        : never)
      .returning({ id: cases.id });

    // Raising event — custody_disputes.raising_event_id is NOT NULL and FKs to
    // pet_events (ON DELETE CASCADE, so it cleans up with the pet).
    const [raisingEvent] = await db
      .insert(petEvents)
      .values({
        petId: pet.id,
        eventType: "custody_dispute_raised" satisfies EventType,
        occurredAt: raisedAt,
        authorRole: "govt",
        payload: { source: "seed-panorama-enforcement", motive: "disputa de custodia" },
      })
      .returning({ id: petEvents.id });

    const [dispute] = await db
      .insert(custodyDisputes)
      .values({
        publicToken: `DIS-PANO-${String(k).padStart(4, "0")}`,
        petId: pet.id,
        raisedByRole: "govt",
        raisingEventId: raisingEvent.id,
        jurisdictionCountry: "AR",
        jurisdictionProvince: prov,
        jurisdictionLocality: locality,
        status: "open",
      })
      .returning({ id: custodyDisputes.id });

    // Link the case to its dispute (the production lockstep invariant) and flip
    // the pet's in_custody_dispute flag, mirroring openDisputeFromEvent.
    await db
      .update(cases)
      .set({ custodyDisputeId: dispute.id, updatedAt: new Date() })
      .where(eq(cases.id, disputeCase.id));
    await db.update(pets).set({ inCustodyDispute: true }).where(eq(pets.id, pet.id));

    disputes++;
  }

  log("INFO", `  Enforcement: ${decomisos} decomisos, ${disputes} custody disputes`);
  return { decomisos, disputes };
}

// ---------------------------------------------------------------------------
// 15d. Health campaigns — service_offerings + time_slots + appointments
// ---------------------------------------------------------------------------
// Backs /gob/campanas (lib/campaign-metrics.ts → fetchCampaignDashboard). A
// "campaign" is a health-service offering (vacunación / desparasitación /
// esterilización) hosted by a seeded org. The projection aggregates:
//   enrollment  = appointments in {confirmed, attended, no_show}     (period)
//   completion  = appointments status='attended'
//   no_show     = appointments status='no_show'
//   geo_reach   = distinct service_offerings.jurisdiction_locality with ≥1
//                 attended appointment
// The hasData gate is simply offerings-in-scope > 0, but we book a mixed-outcome
// distribution so every KPI populates with non-trivial, varied-by-jurisdiction
// values. Dates are ANCHOR-relative (NOT new Date) and land within the last ~28
// days of the anchor so the 30d preset AND the 12m default window both catch
// them; a few older slots feed the 6-month enrollment sparkline.
//
// Per-province demand multiplier — layered on CAMPAIGN_BOOKING_RATE to spread
// enrollment/attendance across jurisdictions (mirrors PROVINCE_COVERAGE intent).
const PROVINCE_CAMPAIGN_DEMAND: Record<string, { demand: number; attend: number }> = {
  "Buenos Aires": { demand: 1.0, attend: 0.72 },
  CABA: { demand: 0.95, attend: 0.78 },
  Córdoba: { demand: 0.85, attend: 0.66 },
  "Santa Fe": { demand: 0.8, attend: 0.63 },
  Salta: { demand: 0.6, attend: 0.52 },
  Chaco: { demand: 0.5, attend: 0.45 },
};

// Campaign offering templates. serviceKind values are free text in the DB but
// align with lib/service-kinds (vaccination / deworming / sterilization) so the
// per-offering table renders a human label.
const CAMPAIGN_TEMPLATES: ReadonlyArray<{
  readonly kind: string;
  readonly label: string;
  readonly durationMinutes: number;
  readonly slotCapacity: number;
  readonly species: readonly string[];
}> = [
  {
    kind: "vaccination",
    label: "Campaña de vacunación antirrábica",
    durationMinutes: 15,
    slotCapacity: 8,
    species: ["dog", "cat"],
  },
  {
    kind: "deworming",
    label: "Campaña de desparasitación",
    durationMinutes: 10,
    slotCapacity: 10,
    species: ["dog", "cat"],
  },
  {
    kind: "sterilization",
    label: "Campaña de esterilización gratuita",
    durationMinutes: 45,
    slotCapacity: 4,
    species: ["dog", "cat"],
  },
];

async function seedHealthCampaigns(
  ownerUserId: string,
  shelterOrgs: PanoOrg[],
): Promise<{
  offerings: number;
  slots: number;
  appointments: number;
  attended: number;
  noShow: number;
  confirmed: number;
}> {
  log("STEP", "Seeding health campaigns (service_offerings + slots + appointments)…");

  if (shelterOrgs.length === 0) {
    log("WARN", "  No PANO orgs available — skipping campaigns");
    return { offerings: 0, slots: 0, appointments: 0, attended: 0, noShow: 0, confirmed: 0 };
  }

  // Pre-fetch a pool of PANO pet IDs per province (appointments.pet_id NOT NULL,
  // FK → pets, ON DELETE CASCADE). Reuse existing PANO pets so the cleanup
  // cascade stays consistent.
  const petPoolRows = await db
    .select({ id: pets.id, province: pets.jurisdictionProvince })
    .from(pets)
    .where(like(pets.name, `${PANO_TAG}%`));

  const petsByProvince = new Map<string, string[]>();
  for (const r of petPoolRows) {
    const key = r.province ?? "Buenos Aires";
    if (!petsByProvince.has(key)) petsByProvince.set(key, []);
    petsByProvince.get(key)!.push(r.id);
  }
  const allPetIds = petPoolRows.map((r) => r.id);
  if (allPetIds.length === 0) {
    log("WARN", "  No PANO pets found — skipping campaigns");
    return { offerings: 0, slots: 0, appointments: 0, attended: 0, noShow: 0, confirmed: 0 };
  }

  let svoIdx = 0;
  let aptIdx = 0;
  let totalSlots = 0;
  let totalAppointments = 0;
  let attendedCount = 0;
  let noShowCount = 0;
  let confirmedCount = 0;

  for (const org of shelterOrgs) {
    const demand = PROVINCE_CAMPAIGN_DEMAND[org.provinceName] ?? { demand: 0.5, attend: 0.5 };

    // Each org hosts 1–2 campaign offerings (the larger metros host both
    // vaccination + one rotating second kind) so we get several offerings
    // spread across jurisdictions without flooding the dataset.
    const offeringCount = demand.demand >= 0.8 ? 2 : 1;

    for (let t = 0; t < offeringCount; t++) {
      const template = CAMPAIGN_TEMPLATES[(svoIdx + t) % CAMPAIGN_TEMPLATES.length];
      const svoToken = `PANO-SVO-${String(svoIdx).padStart(4, "0")}`;
      svoIdx++;

      const [offeringRow] = await db
        .insert(serviceOfferings)
        .values({
          publicToken: svoToken,
          organizationId: org.id,
          jurisdictionCountry: "AR",
          jurisdictionProvince: org.provinceName,
          jurisdictionLocality: org.locality,
          serviceKind: template.kind,
          displayName: `PANO — ${template.label} (${org.locality})`,
          description: "Campaña sanitaria sintética de demostración (seed-panorama)",
          durationMinutes: template.durationMinutes,
          slotCapacity: template.slotCapacity,
          eligibilitySpecies: [...template.species],
          status: "approved",
          isPublic: false,
        } as Parameters<typeof db.insert<typeof serviceOfferings>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never)
        .returning({ id: serviceOfferings.id });

      // One weekly schedule rule (Mon/Wed/Fri mornings). effective_* are date
      // strings; anchor the window around ANCHOR so it reads as a live campaign.
      const effFrom = new Date(ANCHOR_MS - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const effUntil = new Date(ANCHOR_MS + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const [ruleRow] = await db
        .insert(serviceScheduleRules)
        .values({
          serviceOfferingId: offeringRow.id,
          daysOfWeek: [1, 3, 5],
          startTimeLocal: "09:00:00",
          endTimeLocal: "12:00:00",
          effectiveFrom: effFrom,
          effectiveUntil: effUntil,
          status: "active",
        } as Parameters<typeof db.insert<typeof serviceScheduleRules>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never)
        .returning({ id: serviceScheduleRules.id });

      // Materialize slots. Most land within the last 28 days of the anchor (so
      // the 30d window catches them); a handful are placed 35–150 days back to
      // populate the 6-month enrollment sparkline; a couple are future-dated for
      // the "confirmed (booked)" enrollment bucket.
      const slotPlan: Array<{ daysFromAnchor: number; future: boolean }> = [];
      // 8 recent slots within the 28d window (past).
      for (let s = 0; s < 8; s++) slotPlan.push({ daysFromAnchor: randInt(1, 27), future: false });
      // 3 older slots for the sparkline (35–150 days back).
      for (let s = 0; s < 3; s++)
        slotPlan.push({ daysFromAnchor: randInt(35, 150), future: false });
      // 2 future slots (1–14 days ahead) for confirmed/booked-future bookings.
      for (let s = 0; s < 2; s++) slotPlan.push({ daysFromAnchor: randInt(1, 14), future: true });

      // Each slot gets a distinct hour offset (the morning campaign block runs
      // 09:00–12:00 → 12:00–15:00Z), so two slots that draw the same day still
      // produce a unique starts_at and never collide on the
      // time_slots_unique_starts (service_offering_id, starts_at) constraint.

      // Province pet pool (fallback to national pool when the province is sparse).
      const provincePets = petsByProvince.get(org.provinceName) ?? [];
      const pool = provincePets.length >= 4 ? provincePets : allPetIds;

      // Per-offering booking probability, layered with the province demand.
      const bookingProb = Math.min(0.95, CAMPAIGN_BOOKING_RATE * demand.demand + 0.1);

      for (let slotSeq = 0; slotSeq < slotPlan.length; slotSeq++) {
        const plan = slotPlan[slotSeq];
        const offsetMs = plan.daysFromAnchor * 24 * 3600 * 1000;
        const slotStartMs = plan.future ? ANCHOR_MS + offsetMs : ANCHOR_MS - offsetMs;
        // 12:00Z base (~09:00 local) + a per-slot hour offset (0–12h) so every
        // slot in an offering has a unique starts_at even on a colliding day.
        const hourOffset = (slotSeq % 13) * 3600 * 1000;
        const startsAt = new Date(slotStartMs + 12 * 3600 * 1000 + hourOffset);
        const endsAt = new Date(startsAt.getTime() + template.durationMinutes * 60 * 1000);
        const capacity = template.slotCapacity;

        // How many of the slot's capacity get booked.
        let bookings = 0;
        for (let c = 0; c < capacity; c++) {
          if (rng() < bookingProb) bookings++;
        }
        // Guarantee at least one booking on recent past slots so every offering
        // shows enrollment (and the within-capacity CHECK still holds).
        if (bookings === 0 && !plan.future && plan.daysFromAnchor <= 27) bookings = 1;

        const slotStatus = bookings >= capacity ? "full" : "open";
        const [slotRow] = await db
          .insert(timeSlots)
          .values({
            serviceOfferingId: offeringRow.id,
            ruleId: ruleRow.id,
            startsAt,
            endsAt,
            capacity,
            bookingsCount: bookings,
            status: slotStatus,
          } as Parameters<typeof db.insert<typeof timeSlots>>[0] extends {
            values: (v: infer V) => unknown;
          }
            ? V
            : never)
          .returning({ id: timeSlots.id });
        totalSlots++;

        if (bookings === 0) continue;

        const apptRows: Array<Record<string, unknown>> = [];
        for (let b = 0; b < bookings; b++) {
          const petId = pool[Math.floor(rng() * pool.length)];
          const aptToken = `PANO-APT-${String(aptIdx).padStart(5, "0")}`;
          aptIdx++;

          // Outcome resolution:
          //   future slot          → always "confirmed" (booked, not yet held)
          //   past slot            → attended (per-province attend rate) /
          //                          no_show (the rest) — mixed by jurisdiction
          let status: "confirmed" | "attended" | "no_show";
          let attendedAt: Date | null = null;
          let noShowMarkedAt: Date | null = null;
          if (plan.future) {
            status = "confirmed";
            confirmedCount++;
          } else if (rng() < demand.attend) {
            status = "attended";
            attendedAt = new Date(startsAt.getTime() + template.durationMinutes * 60 * 1000);
            attendedCount++;
          } else {
            status = "no_show";
            noShowMarkedAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
            noShowCount++;
          }

          // createdAt drives the projection window: book a few days before the
          // slot start, but never in the future relative to the anchor (so the
          // 30d/12m windows that end at "now" still include them).
          const leadDays = randInt(2, 10);
          let createdMs = startsAt.getTime() - leadDays * 24 * 3600 * 1000;
          if (createdMs > ANCHOR_MS) createdMs = ANCHOR_MS - randInt(1, 5) * 24 * 3600 * 1000;
          const createdAt = new Date(createdMs);

          apptRows.push({
            publicToken: aptToken,
            slotId: slotRow.id,
            petId,
            ownerUserId,
            serviceOfferingId: offeringRow.id,
            organizationId: org.id,
            status,
            ...(attendedAt ? { attendedAt, attendedByUserId: ownerUserId } : {}),
            ...(noShowMarkedAt ? { noShowMarkedAt } : {}),
            createdAt,
            updatedAt: createdAt,
          });
          totalAppointments++;
        }

        if (apptRows.length > 0) {
          await db.insert(appointments).values(
            apptRows as Parameters<typeof db.insert<typeof appointments>>[0] extends {
              values: (v: infer V) => unknown;
            }
              ? V
              : never,
          );
        }
      }
    }
  }

  log(
    "INFO",
    `  Campaigns: ${svoIdx} offerings, ${totalSlots} slots, ${totalAppointments} appointments ` +
      `(${attendedCount} attended / ${noShowCount} no-show / ${confirmedCount} confirmed)`,
  );
  return {
    offerings: svoIdx,
    slots: totalSlots,
    appointments: totalAppointments,
    attended: attendedCount,
    noShow: noShowCount,
    confirmed: confirmedCount,
  };
}

// ---------------------------------------------------------------------------
// 15b. Multi-year, locality-level synthetic history (model provinces)
// ---------------------------------------------------------------------------

/**
 * Calendar years covered by the multi-year history seed. Used for both the
 * per-pet coverage draw and the per-province monthly event generation.
 */
const HISTORY_YEARS = [2024, 2025, 2026] as const;
type HistoryYear = (typeof HISTORY_YEARS)[number];

// Target ~a few hundred history pets per province. Pets-per-locality is
// derived per province so the per-locality count stays sane across all locality
// counts (Córdoba has 532 coord'd localities; Salta has 163).
const HISTORY_TARGET_PETS_PER_PROVINCE = 300;
const HISTORY_MIN_PETS_PER_LOCALITY = 5;
const HISTORY_MAX_PETS_PER_LOCALITY = 300;

/** Pets per locality so the province total lands near the target, within sane bounds. */
function historyPetsPerLocality(localityCount: number): number {
  if (localityCount <= 0) return 0;
  const ideal = Math.ceil(HISTORY_TARGET_PETS_PER_PROVINCE / localityCount);
  return Math.min(HISTORY_MAX_PETS_PER_LOCALITY, Math.max(HISTORY_MIN_PETS_PER_LOCALITY, ideal));
}

/**
 * Seed multi-year locality-level history for ALL 24 Argentine provinces.
 * ADDITIVE — does not touch the main per-province seed. All pets use the
 * `PANO-HIST-` token prefix so `runClean()`'s `name LIKE 'PANO-%'` filter
 * removes them automatically (no runClean change needed).
 *
 * Coverage and zoonosis trends come from `provinceProfile()` in
 * seed-history-utils.ts:
 *   - Córdoba: improving (vacc/ster rise, zoonosis declines)
 *   - Salta:   worsening (vacc/ster fall, zoonosis rises)
 *   - other:   uniform (mild upward trend, flat-ish zoonosis)
 *
 * New vs. existing dimensions added by this function:
 *   existing  → pet_registered, vaccination_administered, sterilization_performed,
 *               outbreak_signal, disease_reported
 *   new       → death_recorded, incident_reported (bite), status_changed
 *               (kind=pet_lost / kind=pet_found_sighting), shelter_intake_recorded,
 *               foster_assigned, adoption_finalized
 *
 * Payload keys mirror the base-seed generators so dashboard/map loaders read
 * the same JSONB paths.
 */
async function seedModelProvinceHistory(
  localitiesByCode: Map<string, LocalityRow[]>,
  ownerUserId: string,
): Promise<{
  pets: number;
  eventCounts: Record<string, number>;
  localitiesCovered: Record<string, number>;
}> {
  log("STEP", "Seeding multi-year locality-level history (all provinces)…");

  const eventCounts: Record<string, number> = {};
  const localitiesCovered: Record<string, number> = {};
  let totalHistoryPets = 0;
  let histIdx = 0;

  const ANCHOR = new Date(ANCHOR_ISO);

  // Deterministic, collision-free token + name for history rows. Distinct from
  // the numeric PANO-NNNNNN tokens used by the main seed.
  const histToken = (i: number): string => `PANO-HIST-${String(i).padStart(6, "0")}`;
  const histName = (i: number, base: string): string =>
    `${PANO_TAG}HIST-${String(i).padStart(6, "0")} ${base}`;

  for (const province of PROVINCES) {
    const provinceName = province.name;
    const code = PROVINCE_TO_CODE.get(provinceName);
    const localities = code ? (localitiesByCode.get(code) ?? []) : [];

    if (localities.length === 0) {
      log("WARN", `  ${provinceName}: no localities with coordinates — skipping`);
      continue;
    }

    localitiesCovered[provinceName] = localities.length;
    const petsPerLocality = historyPetsPerLocality(localities.length);

    // Coverage and zoonosis trends for this province.
    const { archetype, coverageByYear, zoonosisByYear } = provinceProfile(provinceName);

    // Per-province / per-year tallies for the validation summary lines.
    const perYear: Record<HistoryYear, { pets: number; vacc: number; ster: number; zoon: number }> =
      {
        2024: { pets: 0, vacc: 0, ster: 0, zoon: 0 },
        2025: { pets: 0, vacc: 0, ster: 0, zoon: 0 },
        2026: { pets: 0, vacc: 0, ster: 0, zoon: 0 },
      };

    const petRows: Array<Record<string, unknown>> = [];
    const perPetMeta: Array<{
      token: string;
      registeredYear: HistoryYear;
      species: string;
      lat: number;
      lng: number;
    }> = [];

    // 1. Build pet rows: a fixed number per locality, registration year spread
    //    across 2024–2026.
    for (const loc of localities) {
      for (let p = 0; p < petsPerLocality; p++) {
        const speciesEntry = pickWeighted(
          SPECIES_DIST as unknown as Array<{ species: string; weight: number }>,
        );
        const species = speciesEntry.species;
        const baseName = pick(PET_NAMES);
        const sex = pick(SEXES);
        const registeredYear = pickRegisteredYear(rng, HISTORY_YEARS);
        const { lat, lng } = jitteredCoord(loc.lat, loc.lng, 0.02);

        const token = histToken(histIdx);
        petRows.push({
          publicToken: token,
          species,
          name: histName(histIdx, baseName),
          sex,
          status: "active",
          jurisdictionCountry: "AR",
          jurisdictionProvince: provinceName,
          jurisdictionLocality: loc.localityName,
          potentiallyDangerousBreed: false,
          emergencyInfoVisible: false,
        });
        perPetMeta.push({ token, registeredYear, species, lat, lng });
        perYear[registeredYear].pets++;
        histIdx++;
      }
    }

    // 2. Batch insert pets, then fetch their ids by token.
    for (let b = 0; b < petRows.length; b += BATCH_SIZE) {
      const batch = petRows.slice(b, b + BATCH_SIZE);
      await db.insert(pets).values(
        batch as Parameters<typeof db.insert<typeof pets>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never,
      );
    }

    const tokens = perPetMeta.map((m) => m.token);
    const tokenToId = new Map<string, string>();
    for (let b = 0; b < tokens.length; b += BATCH_SIZE) {
      const batchTokens = tokens.slice(b, b + BATCH_SIZE);
      const inserted = await db
        .select({ id: pets.id, publicToken: pets.publicToken })
        .from(pets)
        .where(inArray(pets.publicToken, batchTokens));
      for (const row of inserted) tokenToId.set(row.publicToken, row.id);
    }

    // 3. Build ownerships + per-pet, per-year coverage events.
    const ownershipRows: Array<Record<string, unknown>> = [];
    const eventRows: Array<Record<string, unknown>> = [];

    const bump = (type: string): void => {
      eventCounts[type] = (eventCounts[type] ?? 0) + 1;
    };

    for (const meta of perPetMeta) {
      const petId = tokenToId.get(meta.token);
      if (!petId) continue;

      ownershipRows.push({ petId, ownerUserId, role: "owner" });

      // pet_registered — dated in the registration year. Mirrors the main seed's
      // pet_registered payload shape + writePoint location.
      eventRows.push({
        petId,
        eventType: "pet_registered" satisfies EventType,
        occurredAt: dateInYear(meta.registeredYear, rng),
        recordedByUserId: ownerUserId,
        authorRole: "owner",
        authorVerified: false,
        payload: {
          source: "seed-panorama-history",
          species: meta.species,
          acquisition_method: pick([
            "purchased",
            "found_stray",
            "gift",
            "born_in_litter",
            "other",
          ] as const),
          potentially_dangerous_breed: false,
        },
        ...writePoint(jitteredCoord(meta.lat, meta.lng, 0.01)),
      });
      bump("pet_registered");

      // Per year ≥ registeredYear: emit vaccination / sterilization per that
      // province-year's coverage rate. This makes the measured coverage rate
      // climb (Córdoba) or stagnate (Salta) as `asOf` advances.
      for (const year of HISTORY_YEARS) {
        if (year < meta.registeredYear) continue;
        const cov = coverageByYear[year];

        if (rng() < cov.vacc) {
          eventRows.push({
            petId,
            eventType: "vaccination_administered" satisfies EventType,
            occurredAt: dateInYear(year, rng),
            recordedByUserId: ownerUserId,
            authorRole: "owner",
            authorVerified: false,
            payload: {
              source: "seed-panorama-history",
              vaccine_name: "antirrábica",
              brand: pick(["Defensor 3", "Rabvac 3", "Nobivac Rabies"]),
              batch: `PANO-HIST-${String(histIdx % 9999).padStart(4, "0")}`,
              next_due_at: null,
            },
            ...writePoint(jitteredCoord(meta.lat, meta.lng, 0.01)),
          });
          bump("vaccination_administered");
          perYear[year].vacc++;
        }

        if (rng() < cov.ster) {
          eventRows.push({
            petId,
            eventType: "sterilization_performed" satisfies EventType,
            occurredAt: dateInYear(year, rng),
            recordedByUserId: ownerUserId,
            authorRole: "owner",
            authorVerified: false,
            payload: {
              source: "seed-panorama-history",
              procedure: meta.species === "cat" || rng() < 0.5 ? "castration" : "spay",
              performed_by: null,
              clinic: null,
            },
            ...writePoint(jitteredCoord(meta.lat, meta.lng, 0.01)),
          });
          bump("sterilization_performed");
          perYear[year].ster++;
        }
      }
    }

    // 4. Build petsByLocality map for zoonosis and per-province event attachment.
    const petsByLocality = new Map<string, string[]>();
    for (let i = 0; i < perPetMeta.length; i++) {
      const meta = perPetMeta[i];
      const petId = tokenToId.get(meta.token);
      if (!petId) continue;
      // Recover the locality from the row order: pets were generated locality by
      // locality in petsPerLocality-sized contiguous blocks.
      const localityIndex = Math.floor(i / petsPerLocality);
      const loc = localities[localityIndex];
      if (!loc) continue;
      if (!petsByLocality.has(loc.localityName)) petsByLocality.set(loc.localityName, []);
      petsByLocality.get(loc.localityName)!.push(petId);
    }

    // 5. Per-locality, per-year zoonosis events per the trend intensity. Attach
    //    each to one of that locality's history pets (in that province) so the
    //    event has a valid pet_id and inherits the locality's jurisdiction.
    for (const loc of localities) {
      const carrierPets = petsByLocality.get(loc.localityName) ?? [];
      if (carrierPets.length === 0) continue;

      for (const year of HISTORY_YEARS) {
        const intensity = zoonosisByYear[year];
        // floor guaranteed events + one Bernoulli draw on the fractional part.
        const guaranteed = Math.floor(intensity);
        const remainder = intensity - guaranteed;
        const count = guaranteed + (rng() < remainder ? 1 : 0);

        for (let z = 0; z < count; z++) {
          const petId = carrierPets[Math.floor(rng() * carrierPets.length)];
          const useOutbreak = rng() < 0.5;
          const occurredAt = dateInYear(year, rng);
          const { lat, lng } = jitteredCoord(loc.lat, loc.lng, 0.01);

          if (useOutbreak) {
            eventRows.push({
              petId,
              eventType: "outbreak_signal" satisfies EventType,
              occurredAt,
              recordedByUserId: ownerUserId,
              authorRole: "govt",
              authorVerified: true,
              payload: {
                source: "seed-panorama-history",
                disease_code: "rabies_suspected",
                disease_label: "Rabia (sospechada)",
                // pet_jurisdiction_province is read by petEventsScopeClause;
                // province is read by the panorama per-unit aggregation loader.
                pet_jurisdiction_province: provinceName,
                pet_jurisdiction_locality: loc.localityName,
                province: provinceName,
                locality: loc.localityName,
                status: "open",
              },
              ...writePoint({ lat, lng }),
            });
            bump("outbreak_signal");
          } else {
            eventRows.push({
              petId,
              eventType: "disease_reported" satisfies EventType,
              occurredAt,
              recordedByUserId: ownerUserId,
              authorRole: "vet",
              authorVerified: true,
              payload: {
                source: "seed-panorama-history",
                disease: pick(["lepto", "hidatidosis", "other"] as const),
                confirmed_by_lab: rng() < 0.5,
                date_of_onset: new Date(occurredAt.getTime() - 3 * 24 * 3600 * 1000)
                  .toISOString()
                  .slice(0, 10),
                clinical_notes: `Zoonosis history ${provinceName} ${year} (seed-panorama-history)`,
                pet_jurisdiction_province: provinceName,
                pet_jurisdiction_locality: loc.localityName,
              },
              ...writePoint({ lat, lng }),
            });
            bump("disease_reported");
          }
          perYear[year].zoon++;
        }
      }
    }

    // 6. Per-province, per-month additional event dimensions.
    // Uses monthlyEventCount (trend + seasonal) + pickDateInMonth (deterministic
    // dates). Base rate is scaled by locality count so bigger provinces generate
    // more events proportionally. HISTORY_SCALE (env knob, default 1) multiplies
    // all base rates so the caller can tune volume without touching code.
    //
    // Payload keys MIRROR the base-seed generators so dashboard/map loaders read
    // the correct JSONB paths (pet_jurisdiction_province for the metrics scope
    // clause; province/locality/kind for the perdidas and per-unit panorama
    // loaders).
    const allProvincePetIds = [...petsByLocality.values()].flat();
    if (allProvincePetIds.length > 0) {
      // Monthly base count for the province (scales with its locality footprint).
      const monthlyBase = HISTORY_SCALE * Math.max(1, Math.round(localities.length / 50));

      // Lost events collected within this province for the subsequent found-sighting pass.
      const lostEvents: Array<{
        petId: string;
        lostAt: Date;
        localityName: string;
        lat: number;
        lng: number;
      }> = [];

      for (const year of HISTORY_YEARS) {
        for (let month = 0; month < 12; month++) {
          // --- death_recorded (mirrors base-seed payload exactly) ---
          const deathCount = monthlyEventCount(monthlyBase, archetype, year, month, rng);
          for (let d = 0; d < deathCount; d++) {
            const petId = allProvincePetIds[Math.floor(rng() * allProvincePetIds.length)];
            const loc = localities[Math.floor(rng() * localities.length)];
            const { lat, lng } = jitteredCoord(loc.lat, loc.lng, 0.02);
            const occurredAt = pickDateInMonth(year, month, rng, ANCHOR);
            eventRows.push({
              petId,
              eventType: "death_recorded" satisfies EventType,
              occurredAt,
              recordedByUserId: ownerUserId,
              authorRole: "owner",
              authorVerified: false,
              payload: {
                source: "seed-panorama-history",
                cause: pick(["natural", "accident", "disease", "euthanasia"] as const),
                cause_detail: null,
                confirmed_by_vet: rng() < 0.4,
                vet_name: null,
                disposition_method: pick([
                  "owner_burial",
                  "cremation",
                  "authorized_cemetery",
                  "unknown",
                ] as const),
                facility: rng() < 0.45 ? "Establecimiento habilitado (seed)" : null,
                death_at_clinic: false,
                vet_contacted_owner: "unknown",
                vet_decided_alone: null,
                is_reportable: false,
                during_rabies_observation: false,
                pet_jurisdiction_province: provinceName,
                pet_jurisdiction_locality: loc.localityName,
              },
              ...writePoint({ lat, lng }),
            });
            bump("death_recorded");
          }

          // --- incident_reported / bite (mirrors base-seed payload exactly) ---
          const biteCount = monthlyEventCount(monthlyBase, archetype, year, month, rng);
          for (let b = 0; b < biteCount; b++) {
            const petId = allProvincePetIds[Math.floor(rng() * allProvincePetIds.length)];
            const loc = localities[Math.floor(rng() * localities.length)];
            const { lat, lng } = jitteredCoord(loc.lat, loc.lng, 0.02);
            const occurredAt = pickDateInMonth(year, month, rng, ANCHOR);
            eventRows.push({
              petId,
              eventType: "incident_reported" satisfies EventType,
              occurredAt,
              recordedByUserId: ownerUserId,
              authorRole: "vet",
              authorVerified: false,
              payload: {
                source: "seed-panorama-history",
                incident_type:
                  rng() < 0.7 ? ("bite_inflicted" as const) : ("bite_suffered" as const),
                severity: pick(["minor", "moderate", "severe"] as const),
                injuries_summary: `Mordedura ${provinceName} history (seed-panorama-history)`,
                vet_involved: rng() < 0.6,
                location_description: `${loc.localityName}, ${provinceName} (seed)`,
                rabies_vaccine_valid_at_incident: rng() < 0.5,
                // 'province'/'locality' read by loadMordedurassByUnit / loadUnitHistory('mordeduras').
                province: provinceName,
                locality: loc.localityName,
                // 'pet_jurisdiction_*' read by petEventsScopeClause (metrics scope).
                pet_jurisdiction_province: provinceName,
                pet_jurisdiction_locality: loc.localityName,
              },
              ...writePoint({ lat, lng }),
            });
            bump("incident_reported");
          }

          // --- status_changed / pet_lost (mirrors perdidas loader: kind + province) ---
          const lostCount = monthlyEventCount(
            Math.max(1, Math.round(monthlyBase * 0.8)),
            archetype,
            year,
            month,
            rng,
          );
          for (let l = 0; l < lostCount; l++) {
            const petId = allProvincePetIds[Math.floor(rng() * allProvincePetIds.length)];
            const loc = localities[Math.floor(rng() * localities.length)];
            const { lat, lng } = jitteredCoord(loc.lat, loc.lng, 0.02);
            const lostAt = pickDateInMonth(year, month, rng, ANCHOR);
            eventRows.push({
              petId,
              eventType: "status_changed" satisfies EventType,
              occurredAt: lostAt,
              recordedByUserId: ownerUserId,
              authorRole: "owner",
              authorVerified: false,
              payload: {
                source: "seed-panorama-history",
                kind: "pet_lost",
                from_status: "active",
                to_status: "lost",
                // 'province'/'locality' read by perdidas panorama loader.
                province: provinceName,
                locality: loc.localityName,
                // 'pet_jurisdiction_*' read by petEventsScopeClause (metrics).
                pet_jurisdiction_province: provinceName,
                pet_jurisdiction_locality: loc.localityName,
              },
              ...writePoint({ lat, lng }),
            });
            bump("status_changed");
            lostEvents.push({
              petId,
              lostAt,
              localityName: loc.localityName,
              lat: loc.lat,
              lng: loc.lng,
            });
          }

          // --- adoption funnel: shelter_intake_recorded + foster_assigned + adoption_finalized ---
          // Each "chain" models one pet moving through the full custody pipeline.
          // The custody funnel counts them independently via JOIN to pets, so
          // emitting the events (without changing ownerships) is sufficient.
          const adoptCount = monthlyEventCount(
            Math.max(1, Math.round(monthlyBase * 0.6)),
            archetype,
            year,
            month,
            rng,
          );
          for (let a = 0; a < adoptCount; a++) {
            const petId = allProvincePetIds[Math.floor(rng() * allProvincePetIds.length)];
            const loc = localities[Math.floor(rng() * localities.length)];
            const intakeAt = pickDateInMonth(year, month, rng, ANCHOR);
            const fosterAt = new Date(
              Math.min(intakeAt.getTime() + randInt(7, 21) * 86_400_000, ANCHOR.getTime()),
            );
            const adoptionAt = new Date(
              Math.min(intakeAt.getTime() + randInt(21, 60) * 86_400_000, ANCHOR.getTime()),
            );

            eventRows.push({
              petId,
              eventType: "shelter_intake_recorded" satisfies EventType,
              occurredAt: intakeAt,
              recordedByUserId: ownerUserId,
              authorRole: "shelter",
              authorVerified: true,
              payload: {
                source: "seed-panorama-history",
                intake_reason: pick(["stray", "surrender", "transfer"] as const),
                pet_jurisdiction_province: provinceName,
                pet_jurisdiction_locality: loc.localityName,
              },
            });
            bump("shelter_intake_recorded");

            eventRows.push({
              petId,
              eventType: "foster_assigned" satisfies EventType,
              occurredAt: fosterAt,
              recordedByUserId: ownerUserId,
              authorRole: "shelter",
              authorVerified: true,
              payload: {
                source: "seed-panorama-history",
                foster_user_id: ownerUserId,
                pet_jurisdiction_province: provinceName,
                pet_jurisdiction_locality: loc.localityName,
              },
            });
            bump("foster_assigned");

            eventRows.push({
              petId,
              eventType: "adoption_finalized" satisfies EventType,
              occurredAt: adoptionAt,
              recordedByUserId: ownerUserId,
              authorRole: "shelter",
              authorVerified: true,
              payload: {
                source: "seed-panorama-history",
                previous_owner_organization_id: null,
                adopter_user_id: ownerUserId,
                foster_user_id: null,
                contract_attachment_id: null,
                post_adoption_followup_months: pick([6, 12] as const),
                notes: null,
                pet_jurisdiction_province: provinceName,
                pet_jurisdiction_locality: loc.localityName,
              },
            });
            bump("adoption_finalized");
          }
        }
      }

      // 7. pet_found_sighting: ~40 % of lost pets get a sighting event some days later.
      //    Payload mirrors the perdidas panorama loader: kind + province + locality.
      for (const lost of lostEvents) {
        if (rng() < 0.4) {
          const daysLater = 7 + Math.floor(rng() * 30);
          const foundAt = new Date(
            Math.min(lost.lostAt.getTime() + daysLater * 86_400_000, ANCHOR.getTime()),
          );
          const { lat, lng } = jitteredCoord(lost.lat, lost.lng, 0.02);
          eventRows.push({
            petId: lost.petId,
            eventType: "status_changed" satisfies EventType,
            occurredAt: foundAt,
            recordedByUserId: ownerUserId,
            authorRole: "owner",
            authorVerified: false,
            payload: {
              source: "seed-panorama-history",
              kind: "pet_found_sighting",
              from_status: "lost",
              to_status: "active",
              province: provinceName,
              locality: lost.localityName,
              pet_jurisdiction_province: provinceName,
              pet_jurisdiction_locality: lost.localityName,
            },
            ...writePoint({ lat, lng }),
          });
          bump("status_changed");
        }
      }
    }

    // 8. Batch insert ownerships + events.
    for (let b = 0; b < ownershipRows.length; b += BATCH_SIZE) {
      const batch = ownershipRows.slice(b, b + BATCH_SIZE);
      await db.insert(ownerships).values(
        batch as Parameters<typeof db.insert<typeof ownerships>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never,
      );
    }
    for (let b = 0; b < eventRows.length; b += BATCH_SIZE) {
      const batch = eventRows.slice(b, b + BATCH_SIZE);
      await db.insert(petEvents).values(
        batch as Parameters<typeof db.insert<typeof petEvents>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never,
      );
    }

    const provincePets = perPetMeta.length;
    totalHistoryPets += provincePets;

    // 9. Validation evidence — per-province / per-year summary lines.
    log(
      "INFO",
      `  ${provinceName} (${archetype}): ${provincePets} pets across ${localities.length} localities`,
    );
    for (const year of HISTORY_YEARS) {
      const y = perYear[year];
      log(
        "INFO",
        `    ${provinceName} ${year}: pets=${y.pets} vacc=${y.vacc} ster=${y.ster} zoonosis=${y.zoon}`,
      );
    }
  }

  log("INFO", `  History total: ${totalHistoryPets} pets (all provinces)`);
  return { pets: totalHistoryPets, eventCounts, localitiesCovered };
}

// ---------------------------------------------------------------------------
// 17. Historical welfare_reports + enforcement cases — 2024-2026 all provinces
// ---------------------------------------------------------------------------
// All rows are PANO-tagged so runClean()'s existing patterns remove them:
//   welfare_reports: description LIKE 'PANO-%'    ← 'PANO-HIST-WEL-*' matches
//   cases:           public_code LIKE 'PANO-CASE-%' ← 'PANO-CASE-HIST-*' matches
//
// Jurisdiction scoped by COLUMN (jurisdictionProvince/jurisdictionLocality),
// matching jurisdictionColumnsScope() in the panorama repository consumers:
//   loadDenunciaCentroids, loadDenunciasByUnit, loadUnitHistory('denuncias')
//   loadDecomisos (custody_episode), fetchAnalyticsMetrics custodyDisputes
//
// custody_episode (decomiso) + custody_dispute cases use
//   primarySubjectKind = 'location'
// which satisfies the cases_subject_location_consistency biconditional by
// providing locationLat/Lng.  No registered pet FK required.
//
// Welfare-report createdAt is set explicitly to a past date (not defaultNow)
// so the consumer's gte(welfareReports.createdAt, since) temporal filter
// correctly returns rows from 2024 and 2025.

async function seedHistoryWelfareAndCases(
  localitiesByCode: Map<string, LocalityRow[]>,
): Promise<{ welfare: number; decomisos: number; disputes: number }> {
  log("STEP", "Seeding multi-year welfare_reports + cases history (all provinces)…");

  const ANCHOR = new Date(ANCHOR_ISO);
  const WEL_BATCH = 200;

  const SEIZURE_MOTIVES_HIST = [
    "maltrato",
    "abandono",
    "tenencia_ilegal",
    "orden_judicial",
  ] as const;

  let welIdx = 0;
  let decIdx = 0;
  let disIdx = 0;
  let totalWelfare = 0;
  let totalDecomisos = 0;
  let totalDisputes = 0;

  for (const province of PROVINCES) {
    const provinceName = province.name;
    const code = PROVINCE_TO_CODE.get(provinceName);
    const localities = code ? (localitiesByCode.get(code) ?? []) : [];

    if (localities.length === 0) {
      log("WARN", `  [HIST-WEL] ${provinceName}: no localities — skipping`);
      continue;
    }

    const { archetype } = provinceProfile(provinceName);

    // Per-province monthly base rate: minimum 2, grows with locality count so
    // provinces with more localities (Buenos Aires ~2000, Córdoba ~532) produce
    // proportionally more welfare events than smaller provinces.
    const monthlyBase = HISTORY_SCALE * Math.max(2, Math.round(localities.length / 80));

    // ---- welfare_reports ----
    const welRows: Array<Record<string, unknown>> = [];

    for (const year of HISTORY_YEARS) {
      for (let month = 0; month < 12; month++) {
        const n = monthlyEventCount(monthlyBase, archetype, year, month, rng);
        for (let w = 0; w < n; w++) {
          const loc = localities[Math.floor(rng() * localities.length)];
          const { lat, lng } = jitteredCoord(loc.lat, loc.lng, 0.05);
          // createdAt must be set explicitly so the consumer's
          // gte(welfareReports.createdAt, since) filter returns these history rows.
          const createdAt = pickDateInMonth(year, month, rng, ANCHOR);
          const kindEntry = pickWeighted(
            WELFARE_KINDS as unknown as Array<{ kind: string; weight: number }>,
          );
          const sevEntry = pickWeighted(
            WELFARE_SEVERITIES as unknown as Array<{ severity: string; weight: number }>,
          );
          // ~60 % open (drives the queue), ~30 % closed, ~10 % in_progress/triaged.
          const roll = rng();
          const status =
            roll < 0.6
              ? ("open" as const)
              : roll < 0.9
                ? ("closed" as const)
                : roll < 0.95
                  ? ("triaged" as const)
                  : ("in_progress" as const);

          welRows.push({
            referenceCode: generateReferenceCode(),
            kind: kindEntry.kind,
            severity: sevEntry.severity,
            description: `PANO-HIST-WEL-${String(welIdx).padStart(6, "0")} denuncia histórica (seed)`,
            subjectKind: pick(["unowned_animal", "location", "general", "unowned_animal"] as const),
            status,
            flagReasons: [],
            jurisdictionProvince: provinceName,
            jurisdictionLocality: loc.localityName,
            locationLat: lat.toFixed(7),
            locationLng: lng.toFixed(7),
            occurredAt: createdAt,
            createdAt,
          });
          welIdx++;
        }
      }
    }

    for (let b = 0; b < welRows.length; b += WEL_BATCH) {
      const batch = welRows.slice(b, b + WEL_BATCH);
      await db.insert(welfareReports).values(
        batch as Parameters<typeof db.insert<typeof welfareReports>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never,
      );
    }
    totalWelfare += welRows.length;

    // ---- cases: custody_episode (decomiso) + custody_dispute per quarter ----
    // One location is drawn per quarter-slot so all cases in that slot share a
    // single locality (realistic — a seizure event clusters geographically).
    let provDecomisos = 0;
    let provDisputes = 0;

    for (const year of HISTORY_YEARS) {
      for (const quarterMonth of [0, 3, 6, 9] as const) {
        const loc = localities[Math.floor(rng() * localities.length)];
        const { lat, lng } = jitteredCoord(loc.lat, loc.lng, 0.05);
        const openedAt = pickDateInMonth(year, quarterMonth, rng, ANCHOR);

        // 1–2 decomisos (custody_episode) per quarter per province.
        // Panorama's loadDecomisos queries case_kind='custody_episode'.
        const deciCount = 1 + (rng() < 0.4 ? 1 : 0);
        for (let d = 0; d < deciCount; d++) {
          const motive = pick(SEIZURE_MOTIVES_HIST);
          const isClosed = rng() < 0.45;
          // cases_closed_consistency: (status IN ('closed','merged')) = (closedAt IS NOT NULL)
          const closedAt = isClosed
            ? new Date(
                Math.min(
                  openedAt.getTime() + (1 + Math.floor(rng() * 89)) * 86_400_000,
                  ANCHOR.getTime(),
                ),
              )
            : null;
          await db.insert(cases).values({
            publicCode: `PANO-CASE-HIST-DEC-${String(decIdx).padStart(6, "0")}`,
            caseKind: "custody_episode",
            status: isClosed ? "closed" : "open",
            // 'location' subject: satisfies cases_subject_location_consistency by
            // providing locationLat/Lng; primaryPetId stays null.
            primarySubjectKind: "location",
            locationLat: lat.toFixed(7),
            locationLng: lng.toFixed(7),
            jurisdictionCountry: "AR",
            jurisdictionProvince: provinceName,
            jurisdictionLocality: loc.localityName,
            openedReason: `auto: decomiso motivo=${motive} (Ley 14.346) seed histórico`,
            openedAt,
            ...(isClosed && closedAt ? { closedAt, closedReason: "resolved" as const } : {}),
          } as Parameters<typeof db.insert<typeof cases>>[0] extends {
            values: (v: infer V) => unknown;
          }
            ? V
            : never);
          decIdx++;
          provDecomisos++;
        }

        // 1 custody_dispute per quarter (mix open/closed; open ones surface in
        // fetchAnalyticsMetrics custodyDisputes count).
        const disIsClosed = rng() < 0.5;
        const disClosedAt = disIsClosed
          ? new Date(
              Math.min(
                openedAt.getTime() + (1 + Math.floor(rng() * 89)) * 86_400_000,
                ANCHOR.getTime(),
              ),
            )
          : null;
        await db.insert(cases).values({
          publicCode: `PANO-CASE-HIST-DIS-${String(disIdx).padStart(6, "0")}`,
          caseKind: "custody_dispute",
          status: disIsClosed ? "closed" : "open",
          primarySubjectKind: "location",
          locationLat: lat.toFixed(7),
          locationLng: lng.toFixed(7),
          jurisdictionCountry: "AR",
          jurisdictionProvince: provinceName,
          jurisdictionLocality: loc.localityName,
          openedReason: "auto: disputa de custodia entre partes seed histórico",
          openedAt,
          ...(disIsClosed && disClosedAt
            ? { closedAt: disClosedAt, closedReason: "resolved" as const }
            : {}),
        } as Parameters<typeof db.insert<typeof cases>>[0] extends {
          values: (v: infer V) => unknown;
        }
          ? V
          : never);
        disIdx++;
        provDisputes++;
      }
    }

    totalDecomisos += provDecomisos;
    totalDisputes += provDisputes;

    log(
      "INFO",
      `  [HIST-WEL] ${provinceName} (${archetype}): ${welRows.length} welfare, ` +
        `${provDecomisos} decomisos, ${provDisputes} disputes`,
    );
  }

  log(
    "INFO",
    `  History welfare+cases: ${totalWelfare} welfare_reports, ` +
      `${totalDecomisos} decomisos, ${totalDisputes} disputes`,
  );
  return { welfare: totalWelfare, decomisos: totalDecomisos, disputes: totalDisputes };
}

// ---------------------------------------------------------------------------
// 16. Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("STEP", "=== seed-panorama: Panorama demo dataset ===");
  log("INFO", `PETS_PER_CAPITA=${PETS_PER_CAPITA}  SCALE=${SCALE}  WINDOW_DAYS=${WINDOW_DAYS}`);
  log("INFO", `DRY_RUN=${DRY_RUN}  CLEAN=${CLEAN}  ALLOW_REMOTE=${ALLOW_REMOTE}`);
  log("INFO", `ANCHOR_DATE=${ANCHOR_ISO}`);

  if (DRY_RUN) {
    log("INFO", "DRY RUN — no writes. Estimating counts:");
    // Print what we would do
    const censusMock = PROVINCES.map((p) => ({ provinceName: p.name, population: 1_000_000 }));
    const total = censusMock.reduce(
      (s, c) => s + Math.round(c.population * PETS_PER_CAPITA * SCALE),
      0,
    );
    log("INFO", `  Would insert ~${total} pets (with mock 1M pop each province)`);
    process.exit(0);
  }

  // Always clean PANO data before re-inserting (idempotent)
  await runClean();

  if (CLEAN) {
    log("DONE", "Clean-only mode — exiting.");
    process.exit(0);
  }

  // Load reference data
  const [localitiesByCode, census] = await Promise.all([loadLocalities(), loadCensus()]);

  if (census.length === 0) {
    log("FAIL", "jurisdictions_census is empty — run db:bootstrap first.");
    process.exit(1);
  }

  // Seed organizations
  const shelterOrgs = await seedOrganizations(localitiesByCode);

  // Seed owner profile
  const ownerUserId = await findOrCreateSeedOwnerProfileId();
  log("INFO", `Using owner profile: ${ownerUserId}`);

  // Seed pets
  const { totalPets, lostPets, deceasedPets, eventCounts, globalIndex } = await seedPets(
    localitiesByCode,
    census,
    ownerUserId,
    shelterOrgs,
  );

  // Seed set-pieces
  const { globalIndex: finalIndex, eventCounts: setPieceEventCounts } = await seedSetPieces(
    localitiesByCode,
    ownerUserId,
    globalIndex,
  );

  for (const [k, v] of Object.entries(setPieceEventCounts)) {
    eventCounts[k] = (eventCounts[k] ?? 0) + v;
  }

  // Seed bite/incident events (~200 national)
  const biteCount = Math.round(totalPets * 0.004);
  const insertedBites = await seedBiteEvents(ownerUserId, census, localitiesByCode, biteCount);
  eventCounts.incident_reported = (eventCounts.incident_reported ?? 0) + insertedBites;

  // Seed welfare reports (~300 national)
  const welfareCount = Math.round(totalPets * 0.006);
  const insertedWelfare = await seedWelfareReports(localitiesByCode, census, welfareCount);

  // Seed vigilancia chain (rabies observations + ENO SLA surfaces).
  const vigilance = await seedVigilanceChain(ownerUserId, shelterOrgs);
  eventCounts.rabies_observation_started =
    (eventCounts.rabies_observation_started ?? 0) + vigilance.observations;

  // Seed enforcement cases (decomisos + custody disputes).
  const enforcement = await seedEnforcementCases();

  // Seed health campaigns (service_offerings + slots + appointments) → /gob/campanas.
  const campaigns = await seedHealthCampaigns(ownerUserId, shelterOrgs);

  // Seed multi-year, locality-level history for ALL provinces. Additive —
  // uses PANO-HIST- names so runClean cleans it. Runs LAST so it does not
  // perturb the main seed's RNG-dependent counts above.
  const history = await seedModelProvinceHistory(localitiesByCode, ownerUserId);
  for (const [k, v] of Object.entries(history.eventCounts)) {
    eventCounts[k] = (eventCounts[k] ?? 0) + v;
  }

  // Seed multi-year welfare_reports + enforcement cases (denuncias + decomisos
  // + custody disputes) history across 2024-2026 for ALL provinces.
  // Runs after seedModelProvinceHistory to preserve RNG sequence for pet events.
  const historyWelfCases = await seedHistoryWelfareAndCases(localitiesByCode);

  // Final summary
  const totalEvents = Object.values(eventCounts).reduce((s, v) => s + v, 0);

  log("DONE", "=== seed-panorama complete ===");
  log("INFO", `Total pets inserted     : ${totalPets + (finalIndex - globalIndex) + history.pets}`);
  log("INFO", `  Lost                  : ${lostPets}`);
  log("INFO", `  Deceased              : ${deceasedPets}`);
  log("INFO", `Total events            : ${totalEvents}`);
  log("INFO", `Total welfare reports   : ${insertedWelfare}`);
  log("INFO", `Total orgs created      : ${shelterOrgs.length}`);
  log("INFO", `Rabies observations     : ${vigilance.observations}`);
  log("INFO", `Rabies-obs cases        : ${vigilance.cases}`);
  log("INFO", `ENO queue rows          : ${vigilance.enoQueue}`);
  log("INFO", `ENO outbox rows         : ${vigilance.outbox}`);
  log("INFO", `Decomisos (cases)       : ${enforcement.decomisos}`);
  log("INFO", `Custody disputes (cases): ${enforcement.disputes}`);
  log("INFO", `Campaign offerings      : ${campaigns.offerings}`);
  log("INFO", `Campaign time slots     : ${campaigns.slots}`);
  log(
    "INFO",
    `Campaign appointments   : ${campaigns.appointments} ` +
      `(${campaigns.attended} attended / ${campaigns.noShow} no-show / ${campaigns.confirmed} confirmed)`,
  );
  log(
    "INFO",
    `History pets (all prov) : ${history.pets} ` +
      `(${Object.keys(history.localitiesCovered).length} provinces covered)`,
  );
  log("INFO", `Hist welfare reports    : ${historyWelfCases.welfare}`);
  log("INFO", `Hist decomisos (cases)  : ${historyWelfCases.decomisos}`);
  log("INFO", `Hist disputes (cases)   : ${historyWelfCases.disputes}`);
  log("INFO", "Event breakdown:");
  for (const [k, v] of Object.entries(eventCounts).sort((a, b) => b[1] - a[1])) {
    log("INFO", `  ${k.padEnd(35)}: ${v}`);
  }
}

// postgres-js keeps idle pool connections open, so the process does NOT exit
// on its own once main() resolves — without this it hangs indefinitely AFTER a
// fully successful seed (looks like a stall but the data is already committed).
// Force a clean exit, mirroring the explicit process.exit calls above.
await main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[FAIL]", err);
    process.exit(1);
  });
