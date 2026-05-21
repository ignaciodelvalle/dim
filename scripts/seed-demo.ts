/**
 * DIM Demo Seed — Loader (the entry point).
 *
 * Run with:
 *   pnpm tsx scripts/seed-demo.ts            # full seed against local Supabase
 *   pnpm tsx scripts/seed-demo.ts --stats    # print coverage stats (no DB)
 *
 * What this file does:
 *   1. Bootstraps 7 demo users (shared password "Test1234!").
 *   2. Creates 5 organizations and Lucas's govt assignments (CABA C1/C2/C14).
 *   3. Wires memberships (Alejo as multi-org coordinator, Lilian as vet,
 *      Noelí + Graciela as foster volunteers).
 *   4. Creates the `seed-photos` Supabase Storage bucket and uploads pet
 *      avatars from `docs/archive/Fotos/`.
 *   5. Inserts every Storyline registered in STORYLINES — currently the
 *      7 iconic-pet timelines from `seed-storylines-iconic.ts`. As additional
 *      storyline modules land (original-10 rewrite, Cujo, Roco, supporting
 *      cast), they get appended to STORYLINES and loaded here without
 *      changing this file.
 *
 * Rules / conventions:
 *   - Refuses to run against non-local Supabase or NODE_ENV=production.
 *   - Idempotent end-to-end — every entity (auth user, profile, org,
 *     membership, govt_assignment, pet, ownership, attachment, pet_event)
 *     is upserted on `(stable key)` so re-running converges to the same
 *     state.
 *   - Historical pets retain their closed-cycle status; replacement pets
 *     register as separate rows under the SAME owner per the canon-friend
 *     rule (Hachiko Ni Sei to Ignacio; Hanako to whoever holds Kabosu).
 *
 * Mirrors the patterns established in `scripts/seed-test-users.ts`:
 *   - dotenv loaded BEFORE any heavy import that touches DATABASE_URL.
 *   - Local-URL safety check.
 *   - log("STEP" | "OK" | "SKIP" | "WARN" | "INFO" | "DONE" | "FAIL", msg).
 *   - syncDniVerified bypass for the Mi Argentina OAuth (not wired yet).
 */

// ---------------------------------------------------------------------------
// 1. Env bootstrap + safety guards (must run before db/index.ts imports)
// ---------------------------------------------------------------------------

import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const STATS_ONLY = process.argv.includes("--stats");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const isLocalUrl = (u: string) => u.includes("127.0.0.1") || u.includes("localhost");

if (!STATS_ONLY) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — aborting.",
    );
    process.exit(2);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed: NODE_ENV=production.");
    process.exit(2);
  }
  if (!isLocalUrl(SUPABASE_URL) || !isLocalUrl(DATABASE_URL)) {
    console.error(
      `Refusing to seed: NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) or DATABASE_URL is not local.`,
    );
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// 2. Imports — EVENT_TYPES and Storyline data load eagerly (data-only files),
// DB-touching modules load lazily via loadDbDeps() after env is set.
// ---------------------------------------------------------------------------

import { EVENT_TYPES, type EventType } from "../db/schema";
import { DANGEROUS_STORYLINES } from "./seed-storylines-dangerous";
import { STORYLINES as ICONIC_STORYLINES } from "./seed-storylines-iconic";
import { ORIGINAL_10_STORYLINES } from "./seed-storylines-original10";
import { SUPPORTING_STORYLINES } from "./seed-storylines-supporting";

// Aggregated registry — single source of truth for the loader.
export const STORYLINES = [
  ...ICONIC_STORYLINES,
  ...ORIGINAL_10_STORYLINES,
  ...DANGEROUS_STORYLINES,
  ...SUPPORTING_STORYLINES,
];

type DbDeps = {
  db: any;
  drizzle: { and: any; eq: any; isNull: any; sql: any };
  supabase: any;
  schemas: {
    profiles: any;
    pets: any;
    ownerships: any;
    petEvents: any;
    organizations: any;
    organizationMemberships: any;
    organizationCoverage: any;
    govtAssignments: any;
    attachments: any;
    reminders: any;
    notifications: any;
    auditLog: any;
  };
  publicTokenLib: { generatePublicToken: () => string };
};

async function loadDbDeps(): Promise<DbDeps> {
  const { createClient: createSdkClient } = await import("@supabase/supabase-js");
  const drizzle = await import("drizzle-orm");
  const db = (await import("../db")) as any;
  const publicTokenLib = await import("../lib/publicToken");

  const supabase = createSdkClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    db: db.db,
    drizzle: { and: drizzle.and, eq: drizzle.eq, isNull: drizzle.isNull, sql: drizzle.sql },
    supabase,
    schemas: {
      profiles: db.profiles,
      pets: db.pets,
      ownerships: db.ownerships,
      petEvents: db.petEvents,
      organizations: db.organizations,
      organizationMemberships: db.organizationMemberships,
      organizationCoverage: db.organizationCoverage,
      govtAssignments: db.govtAssignments,
      attachments: db.attachments,
      reminders: db.reminders,
      notifications: db.notifications,
      auditLog: db.auditLog,
    },
    publicTokenLib,
  };
}

// ---------------------------------------------------------------------------
// 3. Constants — users, orgs, locations, photo manifest
// ---------------------------------------------------------------------------

const SHARED_PASSWORD = "Test1234!";

export const USERS = {
  ignacio: {
    email: "ignacio@dim.test",
    displayName: "Ignacio del Valle",
    role: "owner" as const,
    phone: "+54 9 11 5555-2001",
  },
  noeli: {
    email: "noeli@dim.test",
    displayName: "Noelí Assandri",
    role: "owner" as const,
    phone: "+54 9 11 5555-2002",
  },
  graciela: {
    email: "graciela@dim.test",
    displayName: "Graciela Saavedra",
    role: "owner" as const,
    phone: "+54 9 11 5555-2003",
  },
  lilian: {
    email: "lilian@dim.test",
    displayName: "Dra. Lilian Marrone",
    role: "vet" as const,
    phone: "+54 9 11 5555-2004",
  },
  alejo: {
    email: "alejo@dim.test",
    displayName: "Alejo Caride",
    role: "owner" as const,
    phone: "+54 9 11 5555-2005",
  },
  lucas: {
    email: "lucas@dim.test",
    displayName: "Lucas Etcheverry",
    role: "govt" as const,
    phone: "+54 9 11 5555-2006",
  },
  admin: {
    email: "admin@dim.test",
    displayName: "DIM Admin",
    role: "admin" as const,
    phone: null,
  },
} as const;

export type UserKey = keyof typeof USERS;

export const ORGS = {
  "patitas-del-norte": {
    name: "Refugio Patitas del Norte",
    legalName: "Asociación Civil Patitas del Norte",
    orgType: "shelter" as const,
    cuit: "30-71000001-1",
    email: "contacto@patitasdelnorte.test",
    phone: "+54 9 11 5555-3001",
    jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
    jurisdictionLocality: "Palermo",
    coverage: [
      { province: "Ciudad Autónoma de Buenos Aires", locality: "Palermo", isPrimary: true },
      { province: "Ciudad Autónoma de Buenos Aires", locality: "Recoleta", isPrimary: false },
    ],
    verified: true,
  },
  "clinica-recoleta": {
    name: "Clínica Veterinaria Recoleta",
    legalName: "Clínica Veterinaria Recoleta S.A.",
    orgType: "clinic" as const,
    cuit: "30-71000002-2",
    email: "turnos@clinicarecoleta.test",
    phone: "+54 9 11 5555-3002",
    jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
    jurisdictionLocality: "Recoleta",
    coverage: [
      { province: "Ciudad Autónoma de Buenos Aires", locality: "Recoleta", isPrimary: true },
    ],
    verified: true,
  },
  "rescate-puerto-madero": {
    name: "Red de Rescate Puerto Madero",
    legalName: "Red de Rescate Puerto Madero Asoc. Civil",
    orgType: "rescue_network" as const,
    cuit: "30-71000003-3",
    email: "rescate@puertomadero.test",
    phone: "+54 9 11 5555-3003",
    jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
    jurisdictionLocality: "Puerto Madero",
    coverage: [
      { province: "Ciudad Autónoma de Buenos Aires", locality: "Puerto Madero", isPrimary: true },
      { province: "Ciudad Autónoma de Buenos Aires", locality: "Retiro", isPrimary: false },
      { province: "Ciudad Autónoma de Buenos Aires", locality: "San Nicolás", isPrimary: false },
    ],
    verified: true,
  },
  "mascotas-ba-centro": {
    name: "Mascotas BA Centro",
    legalName: "Mascotas BA — Comuna 1 (placeholder)",
    orgType: "sanitary_authority" as const,
    cuit: "30-71000004-4",
    email: "centro@mascotasba.test",
    phone: "+54 9 11 5555-3004",
    jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
    jurisdictionLocality: "Retiro",
    coverage: [
      { province: "Ciudad Autónoma de Buenos Aires", locality: "Retiro", isPrimary: true },
      { province: "Ciudad Autónoma de Buenos Aires", locality: "Puerto Madero", isPrimary: false },
      { province: "Ciudad Autónoma de Buenos Aires", locality: "San Nicolás", isPrimary: false },
    ],
    verified: true,
  },
  "refugio-pendiente": {
    name: "Refugio Pendiente Verificación",
    legalName: "Refugio Pendiente Verificación Asoc. Civil",
    orgType: "shelter" as const,
    cuit: "30-71000005-5",
    email: "pendiente@refugio.test",
    phone: "+54 9 11 5555-3005",
    jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
    jurisdictionLocality: "Recoleta",
    coverage: [
      { province: "Ciudad Autónoma de Buenos Aires", locality: "Recoleta", isPrimary: true },
    ],
    verified: false, // pending in /admin queue
  },
} as const;

export type OrgKey = keyof typeof ORGS;

const GOVT_ASSIGNMENTS = [
  { province: "Ciudad Autónoma de Buenos Aires", locality: "Retiro" },
  { province: "Ciudad Autónoma de Buenos Aires", locality: "Puerto Madero" },
  { province: "Ciudad Autónoma de Buenos Aires", locality: "San Nicolás" },
  { province: "Ciudad Autónoma de Buenos Aires", locality: "Recoleta" },
  { province: "Ciudad Autónoma de Buenos Aires", locality: "Palermo" },
];

const PHOTO_DIR_ABS = path.join(process.cwd(), "docs", "archive", "Fotos");

// Map storyline acquisition_method strings (rescued, bred, unknown, etc.) to
// the canonical DB enum values (adopted, purchased, found_stray, gift,
// born_in_litter, other). Storylines were authored before the enum was
// finalised; this adapter keeps the storyline data readable while satisfying
// the DB constraint.
function toDbAcquisition(
  raw: string | undefined,
): "adopted" | "purchased" | "found_stray" | "gift" | "born_in_litter" | "other" | null {
  if (!raw) return null;
  switch (raw) {
    case "adopted":
    case "purchased":
    case "found_stray":
    case "gift":
    case "born_in_litter":
    case "other":
      return raw;
    case "rescued":
      return "found_stray";
    case "bred":
      return "born_in_litter";
    case "unknown":
      return "other";
    default:
      return "other";
  }
}
const SEED_STORAGE_BUCKET = "seed-photos";

// ---------------------------------------------------------------------------
// 4. Owner-key resolution glue for the existing Storyline shape
//
// The Storyline objects in seed-storylines-iconic.ts use string keys to point
// at owners (e.g. owner_of_record: "Vladimir Yazdovsky (INVAP-Bariloche)").
// For demo seeding we collapse these to the seed users — Ignacio is the
// curatorial owner of every historical pet. This adapter maps token → UserKey.
// ---------------------------------------------------------------------------

/**
 * Resolves a storyline's owner field to a concrete user or org. Storylines in
 * the new modules (original10, dangerous, supporting) set `pet.owner` directly
 * as either a UserKey or an "org:..." string. The historical iconic file's
 * Storyline shape uses `pet.owner_of_record` instead — we fall back to a
 * token-prefix table for that subset.
 */
function resolveOwnerForStoryline(pet: any): { user?: UserKey; org?: OrgKey } {
  // Preferred: explicit pet.owner field (new storyline modules)
  if (typeof pet?.owner === "string") {
    const owner = pet.owner as string;
    if (owner.startsWith("org:")) {
      return { org: owner.slice(4) as OrgKey };
    }
    return { user: owner as UserKey };
  }

  // Legacy fallback for the iconic storyline file: map by public_token prefix.
  const publicToken: string = pet?.public_token ?? "";
  if (publicToken.startsWith("DIM-LAIK")) return { user: "ignacio" };
  if (publicToken.startsWith("DIM-HACH")) return { user: "ignacio" };
  if (publicToken.startsWith("DIM-HCN2")) return { user: "ignacio" };
  if (publicToken.startsWith("DIM-PAL2")) return { user: "ignacio" };
  if (publicToken.startsWith("DIM-TRRY")) return { user: "ignacio" };
  if (publicToken.startsWith("DIM-KABO")) return { user: "noeli" };
  if (publicToken.startsWith("DIM-HNKO")) return { user: "noeli" };
  return { user: "ignacio" };
}

// Map any author_role we see on storylines to a concrete user from USERS.
// Storyline events carry author_role only; we pick the closest seed user.
// For org-owned pets (shelter custody), owner-attributed events fall back to
// Alejo, since he's the personal-account human authoring on behalf of the org.
function pickAuthorFromRole(
  authorRole: string | undefined,
  petOwnerUserKey: UserKey | null,
  userIds: Record<UserKey, string>,
): string | null {
  switch (authorRole) {
    case "vet":
      return userIds.lilian;
    case "govt":
      return userIds.lucas;
    case "admin":
      return userIds.admin;
    case "system":
      return null;
    case "shelter":
      return userIds.alejo;
    default:
      return petOwnerUserKey ? userIds[petOwnerUserKey] : userIds.alejo;
  }
}

// ---------------------------------------------------------------------------
// 5. Logging
// ---------------------------------------------------------------------------

type LogTag = "STEP" | "OK" | "SKIP" | "WARN" | "INFO" | "DONE" | "FAIL";
function log(tag: LogTag, msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${tag.padEnd(4)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// 6. User + profile provisioning
// ---------------------------------------------------------------------------

async function findAuthUserIdByEmail(supabase: any, email: string): Promise<string | null> {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message ?? "(no message)"}`);
    const hit = data.users.find((u: any) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function ensureAuthUser(
  deps: DbDeps,
  email: string,
  displayName: string,
  userRole: "owner" | "admin" = "owner",
): Promise<{ id: string; created: boolean }> {
  const existing = await findAuthUserIdByEmail(deps.supabase, email);
  if (existing) return { id: existing, created: false };
  const { data, error } = await deps.supabase.auth.admin.createUser({
    email,
    password: SHARED_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName, user_role: userRole },
  });
  if (error || !data.user)
    throw new Error(`createUser(${email}) failed: ${error?.message ?? "no user"}`);
  return { id: data.user.id, created: true };
}

async function syncDniVerified(deps: DbDeps, userId: string): Promise<void> {
  const { db, drizzle, schemas } = deps;
  await db
    .update(schemas.profiles)
    .set({ dniVerified: true, updatedAt: new Date() })
    .where(
      drizzle.and(
        drizzle.eq(schemas.profiles.id, userId),
        drizzle.eq(schemas.profiles.dniVerified, false),
      ),
    );
}

async function setProfileFields(
  deps: DbDeps,
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { db, drizzle, schemas } = deps;
  await db
    .update(schemas.profiles)
    .set({ ...fields, updatedAt: new Date() })
    .where(drizzle.eq(schemas.profiles.id, userId));
}

async function provisionUsers(deps: DbDeps): Promise<Record<UserKey, string>> {
  log("STEP", "Provisioning 7 users");
  const ids: Partial<Record<UserKey, string>> = {};
  for (const [key, u] of Object.entries(USERS) as Array<[UserKey, (typeof USERS)[UserKey]]>) {
    const initialRole = u.role === "admin" ? "admin" : "owner";
    const { id, created } = await ensureAuthUser(deps, u.email, u.displayName, initialRole);
    log(created ? "OK" : "SKIP", `${u.email.padEnd(24)} (${u.displayName})`);
    await syncDniVerified(deps, id);

    if (u.role === "admin") {
      await setProfileFields(deps, id, {
        role: "admin",
        accountType: "institutional",
        displayName: u.displayName,
      });
    } else if (u.role === "govt") {
      await setProfileFields(deps, id, {
        role: "govt",
        accountType: "institutional",
        displayName: u.displayName,
      });
    } else if (u.role === "vet") {
      await setProfileFields(deps, id, {
        role: "vet",
        accountType: "personal",
        displayName: u.displayName,
        phone: u.phone,
        matriculaVerified: true,
        matriculaNumber: "V-99001-CABA",
        matriculaJurisdiccion: "Ciudad Autónoma de Buenos Aires",
      });
    } else {
      await setProfileFields(deps, id, {
        role: "owner",
        accountType: "personal",
        displayName: u.displayName,
        phone: u.phone,
      });
    }
    ids[key] = id;
  }
  return ids as Record<UserKey, string>;
}

async function provisionGovtAssignments(
  deps: DbDeps,
  lucasId: string,
  adminId: string,
): Promise<void> {
  log("STEP", "Lucas govt assignments — CABA Comunas 1/2/14");
  const { db, drizzle, schemas } = deps;
  for (const loc of GOVT_ASSIGNMENTS) {
    const [existing] = await db
      .select({ id: schemas.govtAssignments.id })
      .from(schemas.govtAssignments)
      .where(
        drizzle.and(
          drizzle.eq(schemas.govtAssignments.userId, lucasId),
          drizzle.eq(schemas.govtAssignments.jurisdictionProvince, loc.province),
          drizzle.eq(schemas.govtAssignments.jurisdictionLocality, loc.locality),
          drizzle.isNull(schemas.govtAssignments.revokedAt),
        ),
      )
      .limit(1);
    if (existing) {
      log("SKIP", `${loc.province} / ${loc.locality}`);
      continue;
    }
    await db.insert(schemas.govtAssignments).values({
      userId: lucasId,
      jurisdictionProvince: loc.province,
      jurisdictionLocality: loc.locality,
      grantedByUserId: adminId,
    });
    log("OK", `${loc.province} / ${loc.locality}`);
  }
}

// ---------------------------------------------------------------------------
// 7. Org provisioning + memberships
// ---------------------------------------------------------------------------

async function provisionOrgs(deps: DbDeps, alejoId: string): Promise<Record<OrgKey, string>> {
  log("STEP", "Provisioning 5 organizations");
  const { db, drizzle, schemas, publicTokenLib } = deps;
  const orgIds: Partial<Record<OrgKey, string>> = {};
  for (const [key, org] of Object.entries(ORGS) as Array<[OrgKey, (typeof ORGS)[OrgKey]]>) {
    const [existing] = await db
      .select({ id: schemas.organizations.id })
      .from(schemas.organizations)
      .where(drizzle.eq(schemas.organizations.cuit, org.cuit))
      .limit(1);
    let id: string;
    if (existing) {
      id = existing.id;
      log("SKIP", `${org.name}`);
    } else {
      const token = publicTokenLib.generatePublicToken();
      const [row] = await db
        .insert(schemas.organizations)
        .values({
          publicToken: token,
          displayName: org.name,
          legalName: org.legalName,
          orgType: org.orgType,
          cuit: org.cuit,
          email: org.email,
          phone: org.phone,
          jurisdictionCountry: "AR",
          jurisdictionProvince: org.jurisdictionProvince,
          jurisdictionLocality: org.jurisdictionLocality,
          verified: org.verified,
          createdByUserId: alejoId,
        })
        .returning({ id: schemas.organizations.id });
      id = row.id;
      log("OK", `${org.name} ${org.verified ? "(verified)" : "(PENDING admin review)"}`);
    }
    orgIds[key] = id;

    for (const zone of org.coverage) {
      const [existingZone] = await db
        .select({ id: schemas.organizationCoverage.id })
        .from(schemas.organizationCoverage)
        .where(
          drizzle.and(
            drizzle.eq(schemas.organizationCoverage.organizationId, id),
            drizzle.eq(schemas.organizationCoverage.jurisdictionProvince, zone.province),
            drizzle.eq(schemas.organizationCoverage.jurisdictionLocality, zone.locality),
          ),
        )
        .limit(1);
      if (!existingZone) {
        await db.insert(schemas.organizationCoverage).values({
          organizationId: id,
          jurisdictionProvince: zone.province,
          jurisdictionLocality: zone.locality,
          isPrimary: zone.isPrimary,
        });
      }
    }
  }
  return orgIds as Record<OrgKey, string>;
}

async function provisionMemberships(
  deps: DbDeps,
  userIds: Record<UserKey, string>,
  orgIds: Record<OrgKey, string>,
): Promise<void> {
  log("STEP", "Memberships — Alejo / Lilian / Noelí / Graciela");
  const { db, drizzle, schemas } = deps;
  const memberships: Array<{
    org: OrgKey;
    user: UserKey;
    role: string;
    title: string;
    canWritePetEvents: boolean;
  }> = [
    {
      org: "patitas-del-norte",
      user: "alejo",
      role: "admin",
      title: "Coordinador general",
      canWritePetEvents: true,
    },
    {
      org: "clinica-recoleta",
      user: "alejo",
      role: "admin",
      title: "Director administrativo",
      canWritePetEvents: false,
    },
    {
      org: "rescate-puerto-madero",
      user: "alejo",
      role: "admin",
      title: "Coordinador",
      canWritePetEvents: true,
    },
    {
      org: "mascotas-ba-centro",
      user: "alejo",
      role: "admin",
      title: "Operador",
      canWritePetEvents: false,
    },
    {
      org: "clinica-recoleta",
      user: "lilian",
      role: "vet_individual",
      title: "Vet de planta",
      canWritePetEvents: true,
    },
    {
      org: "patitas-del-norte",
      user: "noeli",
      role: "foster",
      title: "Voluntaria de tránsito",
      canWritePetEvents: true,
    },
    {
      org: "patitas-del-norte",
      user: "graciela",
      role: "foster",
      title: "Voluntaria de tránsito",
      canWritePetEvents: true,
    },
  ];
  for (const m of memberships) {
    const [existing] = await db
      .select({ id: schemas.organizationMemberships.id })
      .from(schemas.organizationMemberships)
      .where(
        drizzle.and(
          drizzle.eq(schemas.organizationMemberships.organizationId, orgIds[m.org]),
          drizzle.eq(schemas.organizationMemberships.userId, userIds[m.user]),
          drizzle.isNull(schemas.organizationMemberships.leftAt),
        ),
      )
      .limit(1);
    if (existing) {
      log("SKIP", `${m.user} @ ${m.org}`);
      continue;
    }
    await db.insert(schemas.organizationMemberships).values({
      organizationId: orgIds[m.org],
      userId: userIds[m.user],
      role: m.role,
      title: m.title,
      canWritePetEvents: m.canWritePetEvents,
    });
    log("OK", `${m.user} @ ${m.org} (${m.role})`);
  }
}

// ---------------------------------------------------------------------------
// 8. Photo upload — Supabase Storage
// ---------------------------------------------------------------------------

async function ensureStorageBucket(deps: DbDeps): Promise<void> {
  log("STEP", `Storage bucket '${SEED_STORAGE_BUCKET}'`);
  const { data: list, error: listErr } = await deps.supabase.storage.listBuckets();
  if (listErr) throw new Error(`listBuckets failed: ${listErr.message}`);
  const exists = list?.some((b: any) => b.name === SEED_STORAGE_BUCKET);
  if (exists) {
    log("SKIP", `bucket ${SEED_STORAGE_BUCKET} already exists`);
    return;
  }
  const { error } = await deps.supabase.storage.createBucket(SEED_STORAGE_BUCKET, { public: true });
  if (error) throw new Error(`createBucket failed: ${error.message}`);
  log("OK", `created bucket ${SEED_STORAGE_BUCKET}`);
}

/**
 * Photos. New storyline modules carry photo_file directly on each pet bio
 * (read at load time). The iconic storyline file predates that convention,
 * so we maintain a fallback manifest keyed by public_token for those entries.
 */
const ICONIC_PHOTO_MANIFEST: Record<string, string> = {
  "DIM-LAIK-0015": "russian dog.jpg",
  "DIM-HACH-0016": "hachi.jpg",
  "DIM-PAL2-0017": "totito.webp",
  "DIM-TRRY-0018": "toto.jpg",
  "DIM-KABO-0019": "Doge1.jpg",
};

function resolvePhotoFile(pet: any): string | null {
  if (typeof pet?.photo_file === "string") return pet.photo_file;
  const token: string = pet?.public_token ?? "";
  return ICONIC_PHOTO_MANIFEST[token] ?? null;
}

async function uploadPetPhoto(
  deps: DbDeps,
  petId: string,
  ownerUserId: string | null,
  filename: string,
): Promise<string | null> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const localPath = path.join(PHOTO_DIR_ABS, filename);
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(localPath);
  } catch {
    log("WARN", `photo not found: ${filename}`);
    return null;
  }

  const ext = path.extname(filename).slice(1).toLowerCase() || "jpg";
  const storageKey = `pets/${petId}/avatar.${ext}`;
  const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
  const { error: upErr } = await deps.supabase.storage
    .from(SEED_STORAGE_BUCKET)
    .upload(storageKey, bytes, { upsert: true, contentType });
  if (upErr) {
    log("WARN", `upload failed for ${filename}: ${upErr.message}`);
    return null;
  }

  const { data: pub } = deps.supabase.storage.from(SEED_STORAGE_BUCKET).getPublicUrl(storageKey);
  const publicUrl = pub?.publicUrl ?? null;

  const { db, drizzle, schemas } = deps;
  const [attachment] = await db
    .insert(schemas.attachments)
    .values({
      petId,
      uploadedByUserId: ownerUserId,
      storagePath: storageKey,
      storageBucket: SEED_STORAGE_BUCKET,
      mimeType: contentType,
      filename,
      publicUrl,
    })
    .returning({ id: schemas.attachments.id });

  await db
    .update(schemas.pets)
    .set({ primaryPhotoId: attachment.id })
    .where(drizzle.eq(schemas.pets.id, petId));

  return attachment.id;
}

// ---------------------------------------------------------------------------
// 9. Storyline loader
// ---------------------------------------------------------------------------

function dateAtNoonUtc(d: string): Date {
  return new Date(`${d}T12:00:00Z`);
}

async function loadStoryline(
  deps: DbDeps,
  story: any,
  userIds: Record<UserKey, string>,
  orgIds: Record<OrgKey, string>,
): Promise<void> {
  const { db, drizzle, schemas } = deps;
  const publicToken: string = story.pet.public_token;

  const [existing] = await db
    .select({ id: schemas.pets.id })
    .from(schemas.pets)
    .where(drizzle.eq(schemas.pets.publicToken, publicToken))
    .limit(1);
  if (existing) {
    log("SKIP", `${publicToken} (${story.pet.display_name}) — pet already seeded`);
    return;
  }

  const ownerResolved = resolveOwnerForStoryline(story.pet);
  const ownerUserId = ownerResolved.user ? userIds[ownerResolved.user] : null;
  const ownerOrgId = ownerResolved.org ? orgIds[ownerResolved.org] : null;

  if (!ownerUserId && !ownerOrgId) {
    log("FAIL", `${publicToken} — owner not resolved, skipping`);
    return;
  }

  const deceasedAt: Date | null = (() => {
    if (story.pet.status !== "deceased") return null;
    const deathEvent = story.events.find((e: any) => e.event_type === "death_recorded");
    return deathEvent ? dateAtNoonUtc(deathEvent.date) : null;
  })();

  const [pet] = await db
    .insert(schemas.pets)
    .values({
      publicToken: story.pet.public_token,
      species: story.pet.species,
      breed: story.pet.breed ?? null,
      name: story.pet.display_name,
      sex: story.pet.sex,
      dateOfBirth: story.pet.date_of_birth ?? null,
      birthDateIsEstimated: story.pet.birth_date_is_estimated ?? false,
      color: story.pet.color ?? null,
      distinguishingFeatures: story.pet.distinguishing_features ?? null,
      microchipId: story.pet.microchip_id ?? null,
      microchipCountryCode: story.pet.microchip_country_code ?? null,
      microchipImplantedAt: story.pet.microchip_implanted_at ?? null,
      microchipImplantedBy: story.pet.microchip_implanted_by ?? null,
      microchipLocation: story.pet.microchip_location ?? null,
      estimatedWeightKg: story.pet.estimated_weight_kg
        ? String(story.pet.estimated_weight_kg)
        : null,
      favouriteFoods: story.pet.favourite_foods ?? null,
      knownAllergies: story.pet.known_allergies ?? null,
      trainingLevel: story.pet.training_level ?? null,
      potentiallyDangerousBreed: story.pet.potentially_dangerous_breed ?? false,
      insuranceCompany: story.pet.insurance_company ?? null,
      insurancePolicyNumber: story.pet.insurance_policy_number ?? null,
      jurisdictionCountry: story.pet.jurisdiction_country ?? "AR",
      jurisdictionProvince: story.pet.jurisdiction_province ?? null,
      jurisdictionLocality: story.pet.jurisdiction_locality ?? null,
      acquisitionMethod: toDbAcquisition(story.pet.acquisition_method),
      emergencyInfoVisible: story.pet.emergency_info_visible ?? false,
      status: story.pet.status,
      deceasedAt,
    })
    .returning({ id: schemas.pets.id });

  await db.insert(schemas.ownerships).values({
    petId: pet.id,
    ownerUserId,
    ownerOrganizationId: ownerOrgId,
    role: ownerOrgId ? "shelter_custody" : "owner",
  });

  // Upload photo if the storyline / manifest carries one
  const photoFile = resolvePhotoFile(story.pet);
  if (photoFile) {
    await uploadPetPhoto(deps, pet.id, ownerUserId, photoFile);
  }

  // Insert events
  let eventCount = 0;
  for (const e of story.events) {
    const author = pickAuthorFromRole(e.author_role, ownerResolved.user ?? null, userIds);
    // If the event author_role is 'shelter' or the pet is org-owned, attribute
    // the event to that organization for the audit trail.
    const authorOrgId =
      e.author_role === "shelter" && ownerOrgId
        ? ownerOrgId
        : ownerOrgId && e.author_role === "owner"
          ? ownerOrgId
          : null;
    await db.insert(schemas.petEvents).values({
      petId: pet.id,
      eventType: e.event_type,
      occurredAt: dateAtNoonUtc(e.date),
      recordedByUserId: author,
      authorRole: e.author_role ?? "system",
      authorOrganizationId: authorOrgId,
      authorVerified: true,
      payload: e.payload ?? {},
    });
    eventCount++;
  }

  log("OK", `${publicToken} (${story.pet.display_name}) — ${eventCount} events`);
}

// ---------------------------------------------------------------------------
// 10. Stats helper — runs without DB access
// ---------------------------------------------------------------------------

function printStats(): void {
  const counts = new Map<EventType, number>();
  for (const t of EVENT_TYPES) counts.set(t, 0);
  for (const s of STORYLINES) {
    for (const e of s.events as Array<{ event_type: EventType }>) {
      counts.set(e.event_type, (counts.get(e.event_type) ?? 0) + 1);
    }
  }
  // eslint-disable-next-line no-console
  console.log("\n=== Per-pet event counts ===");
  for (const s of STORYLINES) {
    const uncommon = (s.events as Array<{ uncommon?: boolean }>).filter((e) => e.uncommon).length;
    console.log(
      `  ${(s.pet as any).public_token.padEnd(20)} ${(s.pet as any).display_name.padEnd(20)} events=${String(s.events.length).padStart(3)}  ⚑=${uncommon}`,
    );
  }
  console.log("\n=== Per-event_type hits ===");
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [t, n] of sorted) console.log(`  ${String(n).padStart(3)}  ${t}`);
  const missing = [...counts.entries()].filter(([, n]) => n === 0).map(([t]) => t);
  if (missing.length === 0) console.log("\nAll EVENT_TYPES exercised at least once. ✓");
  else console.log(`\nMissing (${missing.length}): ${missing.join(", ")}`);
}

// ---------------------------------------------------------------------------
// 11. Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (STATS_ONLY) {
    printStats();
    return;
  }

  log("INFO", `Seeding against ${SUPABASE_URL}`);
  log("INFO", `Shared password: ${SHARED_PASSWORD}`);
  log("INFO", `${STORYLINES.length} storylines registered`);

  const deps = await loadDbDeps();

  const userIds = await provisionUsers(deps);
  await provisionGovtAssignments(deps, userIds.lucas, userIds.admin);
  const orgIds = await provisionOrgs(deps, userIds.alejo);
  await provisionMemberships(deps, userIds, orgIds);
  await ensureStorageBucket(deps);

  log("STEP", `Loading ${STORYLINES.length} storylines`);
  for (const story of STORYLINES) {
    await loadStoryline(deps, story, userIds, orgIds);
  }

  log("DONE", "seed complete");
  // eslint-disable-next-line no-console
  console.log("\n=== Access summary ===");
  console.log(`Shared password: ${SHARED_PASSWORD}\n`);
  for (const [, u] of Object.entries(USERS)) {
    console.log(`  ${u.email.padEnd(24)}  role=${u.role}`);
  }
  console.log("\nLogin at /login and visit:");
  console.log("  /admin           — DIM Admin");
  console.log("  /gob             — Lucas (govt CABA)");
  console.log("  /cuenta          — Lilian (vet, resolves to /org/[token] if clinic exists)");
  console.log("  /mis-mascotas    — Ignacio / Noelí (owners)");
}

// ESM-safe entrypoint detection. tsx + Node 24 default to ESM, where
// CommonJS `require.main === module` would always be falsy. The script
// is always run directly via `pnpm tsx scripts/seed-demo.ts`, so we just
// call main() unconditionally.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("\n[FATAL]", err);
    process.exit(1);
  });
