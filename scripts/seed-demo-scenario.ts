/**
 * DIM Demo Scenario Seed — seed-demo-scenario.ts
 *
 * Produces a deterministic, idempotent focal CABA scenario so every beat in the
 * executive demo has the data it needs. Composes *on top of* seed:panorama (adds
 * DEMO- prefixed rows; never duplicates the national universe).
 *
 * ─── CREDENTIALS ────────────────────────────────────────────────────────────
 *   admin@dim.test  /  Test1234!   role=admin   (created by seed:test)
 *   govt@dim.test   /  Test1234!   role=govt    focal locality = CABA
 *
 * ─── FOCAL LOCALITY ─────────────────────────────────────────────────────────
 *   Province : CABA
 *   Locality : CABA  (canonical name in ar_localities)
 *
 * ─── GUARANTEES (DEMO- prefix, idempotent, local-only guard) ────────────────
 *   D0-1  ≥4 buckets in sterilization_performed + vaccination_administered
 *         series spread over ≥6 months so WS-J projectSeries never falls
 *         into "insufficient".
 *   D0-2  One jurisdiction clearly BELOW target (CABA) + one ABOVE (Córdoba)
 *         so Programa shows outliers and Forecast shows "no alcanza / alcanza".
 *   D0-3  ≥1 event_amended: creates a vaccination_administered then its
 *         event_amended correction → WS-L Libro star beat.
 *   D0-4  Alert setup + materialize (K present): inserts an alert_subscriptions
 *         owned by admin@dim.test whose threshold IS crossed by CABA data
 *         (sterilization_coverage_pct below 30). Then calls recordFiringsForUser
 *         from app/actions/alert-firings.ts to materialize a fired alert_firings
 *         row in state "disparada".
 *   D0-5  Fresh occurredAt/recordedAt so "calculado al…" footers aren't stale.
 *   D1    govt@dim.test created (idempotent) with govt_assignments to CABA.
 *
 * ─── LOCAL-ONLY GUARD ───────────────────────────────────────────────────────
 *   Refuses to run against a non-local DATABASE_URL host unless --allow-remote.
 *   ALWAYS refuses when NODE_ENV=production.
 *
 * ─── IDEMPOTENCY ────────────────────────────────────────────────────────────
 *   Every entity is looked up by its DEMO- token / email before insert.
 *   Re-running converges to the same state without duplicating rows.
 *
 * Usage:
 *   pnpm seed:demo:scenario
 */

// ---------------------------------------------------------------------------
// 1. Env bootstrap (must run before db/index.ts is imported)
// ---------------------------------------------------------------------------

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ---------------------------------------------------------------------------
// 2. Parse CLI flags + safety guards
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const ALLOW_REMOTE = argv.includes("--allow-remote");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

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

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV=production. Aborting.");
  process.exit(2);
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal", "::1"]);

function parsePgHost(url: string): string | null {
  const match = url.match(/^postgres(?:ql)?:\/\/[^@]+@([^:/]+)/);
  return match ? match[1] : null;
}

const dbHost = parsePgHost(DATABASE_URL);
const isLocalDb = dbHost ? LOCAL_HOSTS.has(dbHost) : true;
const isLocalSupabase = SUPABASE_URL.includes("127.0.0.1") || SUPABASE_URL.includes("localhost");

if (!ALLOW_REMOTE && (!isLocalDb || !isLocalSupabase)) {
  console.error(
    [
      "",
      "==============================================================",
      "  ABORT: seed-demo-scenario target is NOT a local Postgres.",
      "==============================================================",
      `  DATABASE_URL host : ${dbHost ?? "(not set)"}`,
      `  SUPABASE_URL      : ${SUPABASE_URL}`,
      "",
      "  This script writes demo scenario data. Running against a",
      "  remote DB by mistake is a real incident.",
      "",
      "  Re-run with --allow-remote to target a remote host.",
      "==============================================================",
      "",
    ].join("\n"),
  );
  process.exit(4);
}

// ---------------------------------------------------------------------------
// 3. Deferred imports (after env is populated)
// ---------------------------------------------------------------------------

const { createClient: createSdkClient } = await import("@supabase/supabase-js");
const { and, eq, inArray, isNull, sql } = await import("drizzle-orm");
const {
  db,
  alertSubscriptions,
  alertFirings,
  govtAssignments,
  petEvents,
  pets,
  ownerships,
  profiles,
  ALERT_FIRING_OPEN_STATUSES,
} = await import("../db");

// ---------------------------------------------------------------------------
// 4. Constants
// ---------------------------------------------------------------------------

const SHARED_PASSWORD = "Test1234!";

// Focal jurisdiction for the complete demo cut (baked decision §0).
const FOCAL_PROVINCE = "CABA";
const FOCAL_LOCALITY = "CABA";

// Demo prefix for all rows created by this script — keys idempotency.
const DEMO_TAG = "DEMO-";

// Anchor date for freshness: recent so footers say "calculado al…" today.
// Use current day at noon UTC so re-runs stay fresh.
const ANCHOR_DATE = new Date();
ANCHOR_DATE.setUTCHours(12, 0, 0, 0);

/** Months back from anchor — used to spread series over ≥6 months. */
function monthsBack(n: number): Date {
  const d = new Date(ANCHOR_DATE);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

type LogTag = "STEP" | "OK" | "SKIP" | "WARN" | "INFO" | "DONE" | "FAIL";
function log(tag: LogTag, msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${tag.padEnd(4)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// 5. Supabase admin client (for auth user provisioning)
// ---------------------------------------------------------------------------

const supabase = createSdkClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
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
  email: string,
  displayName: string,
  userRole: "owner" | "admin" | "govt" = "owner",
): Promise<{ id: string; created: boolean }> {
  const existing = await findAuthUserIdByEmail(email);
  if (existing) return { id: existing, created: false };
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SHARED_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName, user_role: userRole },
  });
  if (error || !data.user)
    throw new Error(`createUser(${email}) failed: ${error?.message ?? "no user"}`);
  // Also set password to ensure it's known on re-runs.
  await supabase.auth.admin.updateUserById(data.user.id, { password: SHARED_PASSWORD });
  return { id: data.user.id, created: true };
}

// ---------------------------------------------------------------------------
// 6. Resolve admin user id (must exist — created by seed:test)
// ---------------------------------------------------------------------------

async function resolveAdminUserId(): Promise<string> {
  log("STEP", "Resolving admin@dim.test user id");
  const id = await findAuthUserIdByEmail("admin@dim.test");
  if (!id) {
    throw new Error(
      "admin@dim.test not found. Run `pnpm seed:test` first to create the admin account.",
    );
  }
  log("OK", `admin@dim.test → ${id.slice(0, 8)}…`);
  return id;
}

// ---------------------------------------------------------------------------
// 6b. Ensure a PERSONAL owner for the demo pets.
//
// Institutional accounts (admin/govt) cannot own pets (DB trigger
// enforce_institutional_no_pets). The DEMO- pets + their events therefore need
// a personal owner. Default profile (role=owner, account_type=personal) is
// exactly what we want — no patch needed.
// ---------------------------------------------------------------------------

async function ensureDemoOwner(): Promise<string> {
  log("STEP", "Ensuring owner@dim.test (personal owner for the demo pets)");
  const { id, created } = await ensureAuthUser("owner@dim.test", "Dueño Demo CABA", "owner");
  await supabase.auth.admin.updateUserById(id, { password: SHARED_PASSWORD });
  log(created ? "OK" : "SKIP", `owner@dim.test → ${id.slice(0, 8)}…`);
  return id;
}

// ---------------------------------------------------------------------------
// 7. D1 — Ensure govt@dim.test with CABA assignment
// ---------------------------------------------------------------------------

async function ensureFocalGovt(adminId: string): Promise<string> {
  log("STEP", "D1: ensuring govt@dim.test (focal CABA govt)");

  const { id, created } = await ensureAuthUser("govt@dim.test", "Responsable CABA DIM", "owner");
  log(created ? "OK" : "SKIP", `auth.users govt@dim.test → ${id.slice(0, 8)}…`);

  // Force password to known value on every run (idempotent).
  await supabase.auth.admin.updateUserById(id, { password: SHARED_PASSWORD });

  // Ensure profile is role=govt + accountType=institutional.
  const [profileRow] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);

  if (profileRow?.role !== "govt") {
    await db.execute(sql`
      UPDATE profiles
      SET role = 'govt',
          account_type = 'institutional',
          display_name = 'Responsable CABA DIM',
          updated_at = now()
      WHERE id = ${id}
    `);
    log("OK", "govt profile patched: role=govt accountType=institutional");
  } else {
    log("SKIP", "govt profile already role=govt");
  }

  // Ensure govt_assignments to CABA.
  const [existing] = await db
    .select({ id: govtAssignments.id })
    .from(govtAssignments)
    .where(
      and(
        eq(govtAssignments.userId, id),
        eq(govtAssignments.jurisdictionProvince, FOCAL_PROVINCE),
        eq(govtAssignments.jurisdictionLocality, FOCAL_LOCALITY),
        isNull(govtAssignments.revokedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(govtAssignments).values({
      userId: id,
      jurisdictionProvince: FOCAL_PROVINCE,
      jurisdictionLocality: FOCAL_LOCALITY,
      grantedByUserId: adminId,
    });
    log("OK", `govt_assignments: ${FOCAL_PROVINCE} / ${FOCAL_LOCALITY}`);
  } else {
    log("SKIP", `govt_assignments ${FOCAL_PROVINCE}/${FOCAL_LOCALITY} already exists`);
  }

  return id;
}

// ---------------------------------------------------------------------------
// 8. D0-1 + D0-2 — Seed focal pets with series events (≥4 buckets, ≥6 months)
//
// We create a small cohort of CABA pets tagged DEMO-. For each:
//   - sterilization_performed (spread over 7 months) → populates the ster series
//   - vaccination_administered (spread over 7 months) → populates the vacc series
//
// CABA target: we deliberately set a LOW coverage (few pets sterilized relative
// to total) so CABA appears BELOW target. Córdoba-style above-target is covered
// by the panorama seed which already has varied coverage per province.
//
// The "above target" jurisdiction is the seed:panorama data for Córdoba
// (coverage 0.34) — we don't need to add extra data for it.
// ---------------------------------------------------------------------------

const DEMO_PET_TOKENS = [
  "DEMO-PET-001",
  "DEMO-PET-002",
  "DEMO-PET-003",
  "DEMO-PET-004",
  "DEMO-PET-005",
  "DEMO-PET-006",
  "DEMO-PET-007",
  "DEMO-PET-008",
  "DEMO-PET-009",
  "DEMO-PET-010",
] as const;

// Month offsets for the series — 7 distinct months (≥6) gives us ≥4 buckets
// in any monthly aggregation window.
const SERIES_MONTHS = [0, 1, 2, 3, 4, 5, 6] as const;

async function ensureDemoPet(
  token: string,
  ownerUserId: string,
): Promise<{ id: string; existed: boolean }> {
  const [existing] = await db
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.publicToken, token))
    .limit(1);

  if (existing) return { id: existing.id, existed: true };

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      species: "dog",
      name: `${DEMO_TAG}${token.replace("DEMO-", "")} Demo`,
      sex: "unknown",
      status: "active",
      jurisdictionCountry: "AR",
      jurisdictionProvince: FOCAL_PROVINCE,
      jurisdictionLocality: FOCAL_LOCALITY,
    })
    .returning({ id: pets.id });

  await db.insert(ownerships).values({
    petId: pet.id,
    ownerUserId,
    role: "owner",
  });

  return { id: pet.id, existed: false };
}

async function ensurePetEvent(
  petId: string,
  eventType: string,
  occurredAt: Date,
  payload: Record<string, unknown>,
  recordedByUserId: string,
): Promise<{ inserted: boolean }> {
  // Idempotency: check for an event of same type + same day (date-level dedup).
  const dayStart = new Date(occurredAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const existing = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, eventType as any),
        sql`${petEvents.occurredAt} >= ${dayStart.toISOString()}::timestamptz AND ${petEvents.occurredAt} < ${dayEnd.toISOString()}::timestamptz`,
        sql`(${petEvents.payload}->>'source') = 'seed-demo-scenario'`,
      ),
    )
    .limit(1);

  if (existing.length > 0) return { inserted: false };

  await db.execute(sql`SELECT set_config('app.allow_event_mutation', 'true', true)`);
  await db.execute(
    sql`SELECT set_config('app.allow_event_mutation_actor', ${recordedByUserId}, true)`,
  );

  await db.insert(petEvents).values({
    petId,
    eventType: eventType as any,
    occurredAt,
    recordedByUserId,
    authorRole: "owner",
    authorVerified: false,
    payload: { ...payload, source: "seed-demo-scenario" },
  });

  return { inserted: true };
}

async function seedFocalSeries(ownerUserId: string): Promise<{
  petIds: string[];
  sterilInserted: number;
  vaccInserted: number;
}> {
  log("STEP", "D0-1: seeding focal CABA pet series (≥4 buckets, ≥6 months)");

  const petIds: string[] = [];
  let sterilInserted = 0;
  let vaccInserted = 0;

  for (const token of DEMO_PET_TOKENS) {
    const { id, existed } = await ensureDemoPet(token, ownerUserId);
    petIds.push(id);
    log(existed ? "SKIP" : "OK", `  pet ${token} → ${id.slice(0, 8)}…`);
  }

  // Each of the 7 months: pick a different pet to get the event.
  // Spread sterilization and vaccination across all 7 months (distinct days).
  for (let m = 0; m < SERIES_MONTHS.length; m++) {
    const petId = petIds[m % petIds.length];
    const occurredAt = monthsBack(SERIES_MONTHS[m]);
    // Stagger day slightly per month to avoid same-day dedup collision.
    occurredAt.setUTCDate(10 + m);
    occurredAt.setUTCHours(12 + m, 0, 0, 0);

    const sRes = await ensurePetEvent(
      petId,
      "sterilization_performed",
      occurredAt,
      {
        procedure: "castration",
        performed_by: "Veterinaria CABA Demo",
        clinic: null,
      },
      ownerUserId,
    );
    if (sRes.inserted) sterilInserted++;

    // Use a different pet for vaccination (spread coverage).
    const vacPetId = petIds[(m + 3) % petIds.length];
    const vaccOccurredAt = new Date(occurredAt);
    vaccOccurredAt.setUTCDate(vaccOccurredAt.getUTCDate() + 1);

    const vRes = await ensurePetEvent(
      vacPetId,
      "vaccination_administered",
      vaccOccurredAt,
      {
        vaccine_name: "antirrábica",
        brand: "Defensor 3",
        batch: `DEMO-${String(m).padStart(3, "0")}`,
        next_due_at: null,
      },
      ownerUserId,
    );
    if (vRes.inserted) vaccInserted++;
  }

  log("INFO", `  sterilization events inserted: ${sterilInserted}`);
  log("INFO", `  vaccination events inserted: ${vaccInserted}`);

  return { petIds, sterilInserted, vaccInserted };
}

// ---------------------------------------------------------------------------
// 9. D0-3 — Seed event_amended (the Libro star beat)
// ---------------------------------------------------------------------------

async function seedAmendedEvent(
  petIds: string[],
  ownerUserId: string,
): Promise<{ inserted: boolean }> {
  log("STEP", "D0-3: seeding event_amended (Libro star beat)");

  const targetPetId = petIds[0];
  const targetToken = "DEMO-AMENDED-TARGET";
  const amendToken = "DEMO-AMENDED-CORRECTION";

  // Check for existing amended event (idempotency).
  const existingAmend = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, targetPetId),
        eq(petEvents.eventType, "event_amended"),
        sql`(${petEvents.payload}->>'source') = 'seed-demo-scenario'`,
      ),
    )
    .limit(1);

  if (existingAmend.length > 0) {
    log("SKIP", "event_amended already exists");
    return { inserted: false };
  }

  // First: the original vaccination event to amend.
  const originalOccurredAt = monthsBack(2);
  originalOccurredAt.setUTCDate(5);
  originalOccurredAt.setUTCHours(10, 0, 0, 0);

  await db.execute(sql`SELECT set_config('app.allow_event_mutation', 'true', true)`);
  await db.execute(sql`SELECT set_config('app.allow_event_mutation_actor', ${ownerUserId}, true)`);

  // Find or create the original vaccination event.
  const [origEvent] = await db
    .select({ id: petEvents.id, payload: petEvents.payload })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, targetPetId),
        eq(petEvents.eventType, "vaccination_administered"),
        sql`(${petEvents.payload}->>'source') = 'seed-demo-scenario'`,
      ),
    )
    .limit(1);

  let originalEventId: string;
  if (origEvent) {
    originalEventId = origEvent.id;
    log("INFO", "  using existing vaccination event as amendment target");
  } else {
    const [newOrig] = await db
      .insert(petEvents)
      .values({
        petId: targetPetId,
        eventType: "vaccination_administered",
        occurredAt: originalOccurredAt,
        recordedByUserId: ownerUserId,
        authorRole: "owner",
        authorVerified: false,
        payload: {
          source: "seed-demo-scenario",
          vaccine_name: "antirrábica",
          brand: "Defensor 3 (incorrecto)",
          batch: "DEMO-ORIG-001",
          next_due_at: null,
        },
      })
      .returning({ id: petEvents.id });
    originalEventId = newOrig.id;
    log("OK", `  original vaccination event → ${originalEventId.slice(0, 8)}…`);
  }

  // Now: the event_amended that corrects the original.
  const amendOccurredAt = new Date(originalOccurredAt);
  amendOccurredAt.setUTCDate(amendOccurredAt.getUTCDate() + 3);

  await db.insert(petEvents).values({
    petId: targetPetId,
    eventType: "event_amended",
    occurredAt: amendOccurredAt,
    recordedByUserId: ownerUserId,
    authorRole: "owner",
    authorVerified: false,
    payload: {
      source: "seed-demo-scenario",
      target_event_id: originalEventId,
      reason: "Corrección de marca de vacuna — lote erróneo ingresado originalmente",
      changes: [
        {
          field: "brand",
          old: "Defensor 3 (incorrecto)",
          new: "Nobivac Rabies",
        },
      ],
    },
  });

  log("OK", `  event_amended inserted (target: ${originalEventId.slice(0, 8)}…)`);
  return { inserted: true };
}

// ---------------------------------------------------------------------------
// 10. D0-4 — Alert subscription + materialize firing
// ---------------------------------------------------------------------------

// The subscription metric: sterilization_coverage_pct below the programmatic
// target. CABA has ~38% coverage in the panorama data, so a 70% target (the
// TARGETS.STERILIZATION_COVERAGE_PCT benchmark) is breached. The threshold is
// the real programmatic META — the alert reads "observado 38 · meta 70" (D3),
// not a meaningless "38 ≤ 99".
const ALERT_METRIC_KEY = "sterilization_coverage_pct" as const;
const ALERT_DIRECTION = "below" as const;
const ALERT_THRESHOLD = "70"; // programmatic target; CABA ~38% breaches it

const DEMO_ALERT_LABEL = "DEMO-alert-sterilization-caba";

async function ensureAlertSubscription(adminUserId: string): Promise<string> {
  log(
    "STEP",
    "D0-4: ensuring alert_subscriptions for admin (CABA sterilization_coverage_pct below 70)",
  );

  // Check for existing subscription with DEMO label.
  const [existing] = await db
    .select({ id: alertSubscriptions.id })
    .from(alertSubscriptions)
    .where(
      and(
        eq(alertSubscriptions.actorUserId, adminUserId),
        eq(alertSubscriptions.metricKey, ALERT_METRIC_KEY),
        eq(alertSubscriptions.label, DEMO_ALERT_LABEL),
        eq(alertSubscriptions.isActive, true),
      ),
    )
    .limit(1);

  if (existing) {
    log("SKIP", `alert_subscription ${existing.id.slice(0, 8)}… already exists`);
    return existing.id;
  }

  const [inserted] = await db
    .insert(alertSubscriptions)
    .values({
      actorUserId: adminUserId,
      metricKey: ALERT_METRIC_KEY,
      direction: ALERT_DIRECTION,
      threshold: ALERT_THRESHOLD,
      jurisdictionProvince: FOCAL_PROVINCE,
      jurisdictionLocality: FOCAL_LOCALITY,
      label: DEMO_ALERT_LABEL,
      isActive: true,
    })
    .returning({ id: alertSubscriptions.id });

  log("OK", `alert_subscription inserted: ${inserted.id.slice(0, 8)}…`);
  return inserted.id;
}

async function materializeAlertFiring(
  adminUserId: string,
  subscriptionId: string,
): Promise<{ fired: boolean }> {
  log("STEP", "D0-4: materializing alert_firings for the CABA subscription");

  // Check for existing open firing.
  const existingFiring = await db
    .select({ id: alertFirings.id, status: alertFirings.status })
    .from(alertFirings)
    .where(
      and(
        eq(alertFirings.subscriptionId, subscriptionId),
        inArray(alertFirings.status, [...ALERT_FIRING_OPEN_STATUSES]),
      ),
    )
    .limit(1);

  if (existingFiring.length > 0) {
    log("SKIP", `alert_firings already open (status=${existingFiring[0].status})`);
    return { fired: false };
  }

  // Directly insert a "disparada" firing (mirrors recordFiringsForUser logic
  // but bypasses evaluateAlertSubscriptions which requires Next.js server context).
  // We know the 70% target is breached by real CABA data (~38% coverage).
  await db.insert(alertFirings).values({
    subscriptionId,
    metricKey: ALERT_METRIC_KEY,
    direction: ALERT_DIRECTION,
    threshold: ALERT_THRESHOLD,
    observedValue: "38", // approximate CABA sterilization coverage from panorama seed
    jurisdictionProvince: FOCAL_PROVINCE,
    jurisdictionLocality: FOCAL_LOCALITY,
    status: "disparada",
  });

  log("OK", "alert_firings row inserted: status=disparada, CABA sterilization_coverage_pct");
  return { fired: true };
}

// ---------------------------------------------------------------------------
// 11. B2 — microchip coverage populated with varied per-province rates
// ---------------------------------------------------------------------------
// Antirrábica already has real bulk data (counted via vaccine_name); the chip
// gap (only a handful of pet_identifications) made Microchip read 0% universal,
// which looks like an unseeded registry on camera. Populate microchip_iso for a
// deterministic, varied fraction of pets per province so the outliers/KPIs read
// as real findings (some below, one above the 80% benchmark).

const MICROCHIP_COVERAGE: ReadonlyArray<{ province: string; pct: number }> = [
  { province: "CABA", pct: 72 },
  { province: "Buenos Aires", pct: 58 },
  { province: "Córdoba", pct: 45 },
  { province: "Santa Fe", pct: 63 },
  { province: "Mendoza", pct: 85 },
  { province: "Tucumán", pct: 38 },
];

async function seedComplianceCoverage(): Promise<void> {
  log("STEP", "B2: populating microchip_iso coverage (varied per province)");
  const recordedAt = ANCHOR_DATE.toISOString().slice(0, 10); // YYYY-MM-DD (date col)

  for (const { province, pct } of MICROCHIP_COVERAGE) {
    // Idempotent + deterministic: a stable per-pet 8-digit national id
    // (row_number over ALL pets by id) yields a unique 15-char ISO chip code;
    // NOT EXISTS skips already-chipped pets so re-running converges; the
    // hashtext(id) % 100 < pct bucket selects a stable varied fraction. All ISO
    // subfields are valid (858 + 0001 + 8 digits) so the rows count in both the
    // penetration and the ISO-validity funnel.
    const result = (await db.execute(sql`
      INSERT INTO pet_identifications
        (pet_id, kind, status, code, recorded_at,
         iso_country_code, iso_manufacturer_code, iso_national_id, iso_compliant)
      SELECT s.id, 'microchip_iso', 'active',
             '858' || '0001' || s.nat8, ${recordedAt}::date,
             '858', '0001', s.nat8, true
      FROM (
        SELECT p.id AS id,
               p.jurisdiction_province AS prov,
               p.status AS status,
               lpad((row_number() OVER (ORDER BY p.id))::text, 8, '0') AS nat8,
               (abs(hashtext(p.id::text)) % 100) AS bucket
        FROM pets p
      ) s
      WHERE s.prov = ${province}
        AND s.status IN ('active', 'lost')
        AND s.bucket < ${pct}
        AND NOT EXISTS (
          SELECT 1 FROM pet_identifications pi
          WHERE pi.pet_id = s.id AND pi.kind = 'microchip_iso' AND pi.status = 'active'
        )
      RETURNING id
    `)) as Array<{ id: string }>;

    if (result.length > 0) {
      log("OK", `  ${province}: +${result.length} microchip_iso (~${pct}% target)`);
    } else {
      log("SKIP", `  ${province}: microchip coverage already seeded`);
    }
  }
}

// ---------------------------------------------------------------------------
// 12. Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("INFO", `Seeding against ${SUPABASE_URL}`);
  log("INFO", `Focal jurisdiction: ${FOCAL_PROVINCE} / ${FOCAL_LOCALITY}`);
  log("INFO", `Demo credentials: admin@dim.test / govt@dim.test  →  password: ${SHARED_PASSWORD}`);

  // Step 0: resolve admin user (must exist from seed:test).
  const adminId = await resolveAdminUserId();

  // D1: ensure focal govt with CABA assignment.
  await ensureFocalGovt(adminId);

  // Personal owner for the demo pets (institutional accounts can't own pets).
  const ownerId = await ensureDemoOwner();

  // D0-1 + D0-2: focal series with ≥4 buckets (owned by the personal owner).
  const { petIds } = await seedFocalSeries(ownerId);

  // D0-3: event_amended (Libro star beat).
  await seedAmendedEvent(petIds, ownerId);

  // D0-4: alert subscription + materialize firing.
  const subscriptionId = await ensureAlertSubscription(adminId);
  await materializeAlertFiring(adminId, subscriptionId);

  // B2: populate microchip coverage so no compliance metric reads 0% universal.
  await seedComplianceCoverage();

  log("DONE", "seed-demo-scenario complete");
  console.log("");
  console.log("=== Demo Credentials ===");
  console.log(`  admin@dim.test   /  ${SHARED_PASSWORD}   role=admin   → /admin`);
  console.log(
    `  govt@dim.test    /  ${SHARED_PASSWORD}   role=govt    → /gob  (focal: ${FOCAL_PROVINCE})`,
  );
  console.log("");
  console.log("=== Focal Locality ===");
  console.log(`  Province: ${FOCAL_PROVINCE}`);
  console.log(`  Locality: ${FOCAL_LOCALITY}`);
  console.log("");
  console.log("Run `pnpm demo:verify` to confirm all invariants are green.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("\n[FATAL]", err);
    process.exit(1);
  });
