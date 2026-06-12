/**
 * DIM realistic test-data seed.
 *
 * Drives signups + elevated grants through the SAME inner writer functions
 * that back the real server actions, so the seed exercises:
 *   - handle_new_user trigger (every auth.users insert)
 *   - Zod validation in each writer
 *   - approval_request lifecycle (vet matricula + org verification)
 *   - audit_log inserts
 *   - notification fanout via findAuthoritiesForJurisdiction
 *   - createInstitutionalAccountForAuthority for govt creation
 *
 * Flows that have NO extracted writer (pet creation, intake, pet events)
 * are inserted directly — clearly marked. Refactoring those into writer/
 * wrapper pairs is out of scope here.
 *
 * Accounts created (shared password "Test1234!"):
 *   admin@dim.test       → role=admin (bootstrap founder)
 *   owner@dim.test       → role=owner, 3 mascotas + 1 reminder
 *   vet@dim.test         → role=vet (via approval flow)
 *   orgadmin@dim.test    → admin de "Refugio Test (Seed)" (verified via flow)
 *   govt@dim.test        → role=govt, CABA + La Plata
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   pnpm seed:test
 */

import { type SupabaseClient, createClient as createSdkClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

// IMPORTANT: load env BEFORE importing anything that reads process.env at
// module load time (db/index.ts throws if DATABASE_URL is missing). ESM
// resolves all `import` statements before this file's code runs, so the
// modules below are loaded dynamically *after* loadEnv has populated env.

// ---------------------------------------------------------------------------
// Bootstrap env + safety guard
// ---------------------------------------------------------------------------

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

const isLocalUrl = (u: string) => u.includes("127.0.0.1") || u.includes("localhost");

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

// ---------------------------------------------------------------------------
// Deferred imports (after env load)
// ---------------------------------------------------------------------------

const { and, eq, isNull } = await import("drizzle-orm");
const { approveRequestForAuthority } = await import("../app/actions/admin-decisions");
const { createOrganizationForUser, requestVetUpgradeForUser } = await import(
  "../app/actions/upgrade"
);
// NOTE: we deliberately do NOT import `createInstitutionalAccountForAuthority`
// from `app/actions/admin-institutional.ts`. That writer transitively imports
// `lib/supabase/admin.ts`, which carries `import "server-only"` — a package
// that throws unconditionally outside the Next.js bundler. The govt creation
// is inlined below to mirror the same DB steps the writer performs (auth.users
// + profile + govt_assignments + audit_log + welcome notification).
const {
  approvalRequests,
  auditLog,
  db,
  govtAssignments,
  notifications,
  organizationCoverage,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  petIdentifications,
  pets,
  profiles,
  reminders,
} = await import("../db");
const { generatePublicToken } = await import("../lib/publicToken");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHARED_PASSWORD = "Test1234!";

const EMAILS = {
  admin: "admin@dim.test",
  owner: "owner@dim.test",
  vet: "vet@dim.test",
  orgAdmin: "orgadmin@dim.test",
  govt: "govt@dim.test",
  govtLocal: "govt-local@dim.test",
} as const;

const DISPLAY = {
  admin: "Admin DIM",
  owner: "Lucía Tester",
  vet: "Dr. Juan Veterinario",
  orgAdmin: "Refugio Admin",
  govt: "Operador/a Gobierno (remoto)",
  govtLocal: "Operador/a Gobierno (local)",
} as const;

// Remote govt — keeps a govt user covering jurisdictions no test touches.
// Useful for "out of scope" / cross-jurisdiction testing.
const GOVT_REMOTE_LOCALITIES = [
  { province: "Tierra del Fuego", locality: "Ushuaia" },
  { province: "Santa Cruz", locality: "El Calafate" },
];

// Local govt — covers the same jurisdictions where the seed refugio + vet
// operate, so approval-request routing actually goes to this govt (not just
// to admin fallback). NOTE: these localities collide with vitest fixtures in
// `__tests__/profile-self-service.test.ts` — the 2 coverage tests there will
// fail after seeding. Documented tradeoff: user picked geographic realism
// over green test suite for the seed.
const GOVT_LOCAL_LOCALITIES = [
  { province: "Buenos Aires", locality: "La Plata" },
  { province: "Buenos Aires", locality: "CABA" },
];

// Coverage zones for the seed refugio — required for Lost & Found Fase 6
// broadcast fanout to have any destinatarios.
const ORG_COVERAGE_ZONES: Array<{
  province: string;
  locality: string;
  isPrimary: boolean;
}> = [
  { province: "Buenos Aires", locality: "La Plata", isPrimary: true },
  { province: "Buenos Aires", locality: "CABA", isPrimary: false },
];

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

const supabase: SupabaseClient = createSdkClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type LogTag = "STEP" | "OK" | "SKIP" | "WARN" | "INFO" | "DONE";
function log(tag: LogTag, msg: string) {
  console.log(`[${tag.padEnd(4)}] ${msg}`);
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(
        `listUsers failed on page ${page}: ${error.message ?? "(no message)"} — full=${JSON.stringify(error)}`,
      );
    }
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
    page++;
  }
}

/**
 * Creates an auth.users row via service-role admin SDK with email_confirm:true.
 * This fires the same `handle_new_user` trigger as a real /signup submission;
 * it just bypasses email confirmation + rate limits (necessary for local seed).
 *
 * `userRole` is read by the trigger from raw_user_meta_data.user_role to set
 * the initial profiles.role. Pass 'owner' (default) for normal users; 'admin'
 * is used only for the bootstrap founder.
 */
async function ensureAuthUser(
  email: string,
  displayName: string,
  userRole: "owner" | "admin" = "owner",
): Promise<{ id: string; created: boolean }> {
  const existingId = await findAuthUserIdByEmail(email);
  if (existingId) return { id: existingId, created: false };

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SHARED_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName, user_role: userRole },
  });
  if (error || !data.user) {
    throw new Error(`createUser(${email}) failed: ${error?.message ?? "no user"}`);
  }
  return { id: data.user.id, created: true };
}

async function setPassword(userId: string, password: string): Promise<void> {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(`updateUserById(${userId}) failed: ${error.message}`);
}

/**
 * Seed-only shortcut: sets dni_verified=true for a user without going through
 * the real Mi Argentina flow (which doesn't exist yet). Idempotent — only
 * updates when dni_verified is currently false, leaves dni_number=NULL so the
 * partial unique index (IS NOT NULL) is never triggered by seed accounts.
 *
 * This is the "seed bypass" described in docs/patterns/petition-prerequisites.md.
 * TODO(mi-argentina): remove this once the real OAuth callback is wired; the
 * seed should instead exercise the real verifyDniForUser writer.
 */
async function syncDniVerified(userId: string): Promise<void> {
  await db
    .update(profiles)
    .set({ dniVerified: true, updatedAt: new Date() })
    .where(and(eq(profiles.id, userId), eq(profiles.dniVerified, false)));
}

async function readProfileRole(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.role ?? null;
}

// ---------------------------------------------------------------------------
// Step 1 — bootstrap founder admin
//
// The schema comment in db/schema.ts says "bootstrap is a manual SQL seed of
// the founder" — this is the script-equivalent: create auth user, set
// profiles.role='admin', profiles.account_type='institutional'.
// ---------------------------------------------------------------------------

async function bootstrapAdmin(): Promise<string> {
  log("STEP", "1/9 — bootstrap admin");
  const { id, created } = await ensureAuthUser(EMAILS.admin, DISPLAY.admin, "admin");
  log(created ? "OK" : "SKIP", `auth.users ${EMAILS.admin} (admin)`);
  await syncDniVerified(id);

  // The trigger set role='admin' via metadata. We still need account_type and
  // a known password (it was set on create, but be idempotent if re-running).
  await db
    .update(profiles)
    .set({
      role: "admin",
      accountType: "institutional",
      displayName: DISPLAY.admin,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, id));
  log("OK", "profile role=admin accountType=institutional");
  return id;
}

// ---------------------------------------------------------------------------
// Step 2 — owner signup (the default self-serve path)
// ---------------------------------------------------------------------------

async function signupOwner(): Promise<string> {
  log("STEP", "2/9 — owner signup (owner@dim.test)");
  const { id, created } = await ensureAuthUser(EMAILS.owner, DISPLAY.owner);
  log(created ? "OK" : "SKIP", `auth.users ${EMAILS.owner} (owner)`);
  await syncDniVerified(id);
  // Trigger already set role=owner + displayName from metadata; nothing else to patch.
  await db
    .update(profiles)
    .set({ phone: "+54 9 11 5555-1001", updatedAt: new Date() })
    .where(eq(profiles.id, id));
  return id;
}

// ---------------------------------------------------------------------------
// Step 3 — vet upgrade flow (owner → vet via approval)
// ---------------------------------------------------------------------------

async function provisionVet(adminId: string): Promise<string> {
  log("STEP", "3/9 — vet matricula approval flow (vet@dim.test)");
  const { id, created } = await ensureAuthUser(EMAILS.vet, DISPLAY.vet);
  log(created ? "OK" : "SKIP", `auth.users ${EMAILS.vet} (signed up as owner)`);
  await syncDniVerified(id);

  const currentRole = await readProfileRole(id);
  if (currentRole === "vet") {
    log("SKIP", "vet already approved — no action");
    return id;
  }

  // Check if there's already a pending request (idempotency for partial re-runs).
  const [pending] = await db
    .select({ publicToken: approvalRequests.publicToken })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.applicantUserId, id),
        eq(approvalRequests.type, "role_upgrade_vet"),
        eq(approvalRequests.status, "pending"),
      ),
    )
    .limit(1);

  let requestToken: string;
  if (pending) {
    requestToken = pending.publicToken;
    log("SKIP", `pending vet upgrade request exists (${requestToken})`);
  } else {
    const upgradeResult = await requestVetUpgradeForUser(id, {
      matriculaNumber: "V-12345-BA",
      matriculaJurisdiccion: "Buenos Aires",
      operationalProvince: "Buenos Aires",
      operationalLocality: "La Plata",
      especialidad: "Clínica general — pequeños animales",
      anosExperiencia: 8,
    });
    if (upgradeResult.error) {
      throw new Error(`requestVetUpgradeForUser failed: ${upgradeResult.error}`);
    }
    const [fresh] = await db
      .select({ publicToken: approvalRequests.publicToken })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.applicantUserId, id),
          eq(approvalRequests.type, "role_upgrade_vet"),
          eq(approvalRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (!fresh) throw new Error("vet upgrade request not found after create");
    requestToken = fresh.publicToken;
    log("OK", `submitted vet upgrade request ${requestToken}`);
  }

  const decision = await approveRequestForAuthority(
    adminId,
    requestToken,
    "Matrícula verificada vía seed script.",
  );
  if ("error" in decision) {
    throw new Error(`approveRequestForAuthority(vet) failed: ${decision.error}`);
  }
  log("OK", "admin approved vet upgrade → profiles.role=vet, matriculaVerified=true");
  return id;
}

// ---------------------------------------------------------------------------
// Step 4 — org creation + verification flow
// ---------------------------------------------------------------------------

async function provisionOrg(
  adminId: string,
): Promise<{ orgAdminUserId: string; orgId: string; orgToken: string }> {
  log("STEP", "4/9 — org creation + verification (orgadmin@dim.test → Refugio Test)");
  const { id: orgAdminId, created } = await ensureAuthUser(EMAILS.orgAdmin, DISPLAY.orgAdmin);
  log(created ? "OK" : "SKIP", `auth.users ${EMAILS.orgAdmin} (signed up as owner)`);
  await syncDniVerified(orgAdminId);

  // Does this user already admin an org?
  const [existingMembership] = await db
    .select({
      orgId: organizationMemberships.organizationId,
    })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, orgAdminId),
        eq(organizationMemberships.role, "admin"),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  let orgId: string;
  if (existingMembership) {
    orgId = existingMembership.orgId;
    log("SKIP", `orgadmin already manages org ${orgId.slice(0, 8)}`);
  } else {
    const createRes = await createOrganizationForUser(orgAdminId, {
      name: "Refugio Test",
      legalName: "Refugio Test (Seed)",
      orgType: "shelter",
      // Unique CUIT chosen to avoid colliding with the canonical test CUIT
      // (30-71234567-8) used in __tests__/role-upgrade.test.ts.
      cuit: "30-99999999-9",
      email: "refugio@dim.test",
      phone: "+54 9 221 555-0001",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
      personeriaJuridicaNumber: "PJ-12345",
    });
    if (createRes.error || !createRes.organizationId) {
      throw new Error(`createOrganizationForUser failed: ${createRes.error}`);
    }
    orgId = createRes.organizationId;
    log("OK", `org created (id=${orgId.slice(0, 8)}) — pending verification`);
  }

  const [orgRow] = await db
    .select({
      verified: organizations.verified,
      publicToken: organizations.publicToken,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!orgRow) throw new Error("organization not found after create");

  if (orgRow.verified) {
    log("SKIP", "org already verified");
  } else {
    const [pending] = await db
      .select({ publicToken: approvalRequests.publicToken })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.targetOrganizationId, orgId),
          eq(approvalRequests.type, "organization_verification"),
          eq(approvalRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (!pending) throw new Error("pending verification request not found");

    const decision = await approveRequestForAuthority(
      adminId,
      pending.publicToken,
      "Documentación validada — seed script.",
    );
    if ("error" in decision) {
      throw new Error(`approveRequestForAuthority(org) failed: ${decision.error}`);
    }
    log("OK", "admin approved org verification → organizations.verified=true");
  }

  return { orgAdminUserId: orgAdminId, orgId, orgToken: orgRow.publicToken };
}

// ---------------------------------------------------------------------------
// Step 5 — govt institutional account (via real writer)
// ---------------------------------------------------------------------------

async function provisionGovt(
  adminId: string,
  config: {
    stepLabel: string;
    email: string;
    displayName: string;
    localities: Array<{ province: string; locality: string }>;
  },
): Promise<string> {
  log("STEP", `${config.stepLabel} — govt institutional account (${config.email})`);

  // Inlined to avoid pulling in lib/supabase/admin.ts (server-only). The DB
  // steps mirror createInstitutionalAccountForAuthority exactly: handle_new_user
  // creates the profile row → we patch institutional fields → insert assignments
  // → audit_log → welcome notification. Same code paths a real admin UI hits.
  const { id, created } = await ensureAuthUser(config.email, config.displayName, "owner");
  if (created) {
    log("OK", `auth.users ${config.email} (created via admin SDK)`);
  } else {
    log("SKIP", `auth.users ${config.email} already exists`);
  }
  await syncDniVerified(id);

  const currentRole = await readProfileRole(id);
  if (currentRole !== "govt") {
    await db.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({
          role: "govt",
          accountType: "institutional",
          displayName: config.displayName,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, id));

      // Insert any govt_assignments that don't already exist (idempotent).
      for (const loc of config.localities) {
        const [existing] = await tx
          .select({ id: govtAssignments.id })
          .from(govtAssignments)
          .where(
            and(
              eq(govtAssignments.userId, id),
              eq(govtAssignments.jurisdictionProvince, loc.province),
              eq(govtAssignments.jurisdictionLocality, loc.locality),
              isNull(govtAssignments.revokedAt),
            ),
          )
          .limit(1);
        if (existing) continue;
        await tx.insert(govtAssignments).values({
          userId: id,
          jurisdictionProvince: loc.province,
          jurisdictionLocality: loc.locality,
          grantedByUserId: adminId,
        });
      }

      await tx.insert(auditLog).values({
        actorUserId: adminId,
        action: "institutional_govt_created",
        targetUserId: id,
        payload: {
          role: "govt",
          display_name: config.displayName,
          email: config.email,
          initial_localities: config.localities,
          method: "seed_script",
        },
      });

      await tx.insert(notifications).values({
        userId: id,
        notificationType: "institutional_account_created",
        title: "Tu cuenta institucional fue creada",
        body: "Un administrador te creó una cuenta. Iniciá sesión con tus credenciales.",
        severity: "info",
        ctaLabel: "Acceder",
        ctaUrl: "/login",
      });
    });
    log("OK", `govt profile institutional + ${config.localities.length} jurisdicciones`);
  } else {
    log("SKIP", "govt profile already provisioned");
  }

  // Always re-assert the shared password so seed re-runs leave a known login.
  await setPassword(id, SHARED_PASSWORD);
  return id;
}

async function seedOrgCoverage(orgId: string): Promise<void> {
  log("STEP", "5/9 — coverage zones del refugio (Lost & Found Fase 6 fanout)");
  for (const zone of ORG_COVERAGE_ZONES) {
    const [existing] = await db
      .select({ id: organizationCoverage.id })
      .from(organizationCoverage)
      .where(
        and(
          eq(organizationCoverage.organizationId, orgId),
          eq(organizationCoverage.jurisdictionProvince, zone.province),
          eq(organizationCoverage.jurisdictionLocality, zone.locality),
        ),
      )
      .limit(1);
    if (existing) {
      log("SKIP", `coverage ${zone.province} / ${zone.locality}`);
      continue;
    }
    await db.insert(organizationCoverage).values({
      organizationId: orgId,
      jurisdictionProvince: zone.province,
      jurisdictionLocality: zone.locality,
      isPrimary: zone.isPrimary,
    });
    log("OK", `coverage ${zone.province} / ${zone.locality}${zone.isPrimary ? " (primary)" : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Step 6 — vet membership at the refugio (DIRECT INSERT — no writer)
// ---------------------------------------------------------------------------

async function attachVetToOrg(orgId: string, vetUserId: string): Promise<void> {
  log("STEP", "7/9 — vet membership at refugio (direct INSERT — no writer extracted)");
  const [existing] = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        eq(organizationMemberships.userId, vetUserId),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);
  if (existing) {
    log("SKIP", "vet membership already present");
    return;
  }
  await db.insert(organizationMemberships).values({
    organizationId: orgId,
    userId: vetUserId,
    role: "vet_individual",
    title: "Vet de planta",
    canWritePetEvents: true,
  });
  log("OK", "vet attached to refugio as vet_individual with write capability");
}

// ---------------------------------------------------------------------------
// Step 7 — owner pets (DIRECT INSERT — no writer extracted from createPetAction)
// ---------------------------------------------------------------------------

async function seedOwnerPets(ownerUserId: string): Promise<void> {
  log("STEP", "8/9 — owner mascotas (direct INSERT — pets.ts is a `use server` action)");
  const [hasPet] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.ownerUserId, ownerUserId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (hasPet) {
    log("SKIP", "owner already has pets");
    return;
  }

  const ownerPetSeed = [
    {
      name: "Firulais",
      species: "dog",
      breed: "Caniche",
      sex: "male" as const,
      color: "marrón",
      microchipId: "858000000000001",
      withVaccine: true,
    },
    {
      name: "Michi",
      species: "cat",
      breed: "Común europeo",
      sex: "female" as const,
      color: "blanco y negro",
      microchipId: null,
      withVaccine: false,
    },
    {
      name: "Atún",
      species: "cat",
      breed: "Siamés",
      sex: "male" as const,
      color: "crema",
      microchipId: "858000000000002",
      withVaccine: false,
    },
  ];

  for (const seed of ownerPetSeed) {
    const publicToken = generatePublicToken();
    const [pet] = await db
      .insert(pets)
      .values({
        publicToken,
        species: seed.species,
        breed: seed.breed,
        name: seed.name,
        sex: seed.sex,
        color: seed.color,
        // Legacy chip columns omitted — ARCH-R; canonical row written to
        // pet_identifications below.
        status: "active",
        jurisdictionProvince: "CABA",
        jurisdictionLocality: "CABA",
        acquisitionMethod: "adopted",
      })
      .returning({ id: pets.id, publicToken: pets.publicToken });

    await db.insert(ownerships).values({
      petId: pet.id,
      ownerUserId,
      role: "owner",
    });

    await db.insert(petEvents).values({
      petId: pet.id,
      eventType: "pet_registered",
      occurredAt: new Date(),
      recordedByUserId: ownerUserId,
      authorRole: "owner",
      payload: { source: "seed-script" },
    });

    // Microchip: emit event + canonical pet_identifications row so the seed
    // data stays re-derivable and the pet-cache drift harness sees zero drift.
    // Legacy pets.* chip columns not written — ARCH-R.
    if (seed.microchipId) {
      const chip = seed.microchipId;
      const chipNow = new Date();
      await db.insert(petEvents).values({
        petId: pet.id,
        eventType: "microchip_implanted",
        occurredAt: chipNow,
        recordedAt: chipNow,
        recordedByUserId: ownerUserId,
        authorRole: "owner",
        payload: {
          chip_number: chip,
          country_code: "858",
          implanted_by: null,
          location_on_body: null,
          implant_date_known: true,
        },
      });
      await db.insert(petIdentifications).values({
        petId: pet.id,
        kind: "microchip_iso",
        code: chip,
        recordedAt: chipNow.toISOString().slice(0, 10),
        isoCountryCode: chip.slice(0, 3),
        isoManufacturerCode: chip.slice(3, 7),
        isoNationalId: chip.slice(7, 15),
        isoCompliant: true,
      });
    }

    if (seed.withVaccine) {
      const dueAt = new Date(Date.now() + 365 * 24 * 3600 * 1000);
      const [vaccineEvent] = await db
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "vaccination_administered",
          occurredAt: new Date(),
          recordedByUserId: ownerUserId,
          authorRole: "owner",
          payload: {
            vaccine: "Antirrábica",
            brand: "Defensor 3",
            lot_number: "AB123",
            next_due_at: dueAt.toISOString(),
          },
        })
        .returning({ id: petEvents.id });

      await db.insert(reminders).values({
        petId: pet.id,
        userId: ownerUserId,
        reminderType: "vaccine",
        dueAt,
        title: "Antirrábica anual",
        description: "Refuerzo anual de antirrábica",
        sourceEventId: vaccineEvent.id,
      });
    }

    log("OK", `pet ${seed.name} (${pet.publicToken})`);
  }
}

// ---------------------------------------------------------------------------
// Step 8 — shelter custody pets (DIRECT INSERT — no writer extracted)
// ---------------------------------------------------------------------------

async function seedShelterPets(orgId: string, intakeActorId: string): Promise<void> {
  log("STEP", "9/9 — shelter custody mascotas (direct INSERT — intake.ts is `use server`)");
  const [hasCustody] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.ownerOrganizationId, orgId),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (hasCustody) {
    log("SKIP", "org already holds shelter custody");
    return;
  }

  const shelterPetSeed = [
    {
      name: "Lola",
      species: "dog",
      breed: "Mestizo",
      sex: "female" as const,
      color: "negro",
      distinguishingFeatures: "Mancha blanca en el pecho",
      microchipId: null,
    },
    {
      name: "Toby",
      species: "dog",
      breed: "Labrador (mestizo)",
      sex: "male" as const,
      color: "marrón claro",
      distinguishingFeatures: null,
      microchipId: "858000000000101",
    },
    {
      name: "Rocco",
      species: "cat",
      breed: "Común europeo",
      sex: "male" as const,
      color: "atigrado",
      distinguishingFeatures: "Oreja izquierda con muesca (esterilización comunitaria)",
      microchipId: null,
    },
  ];

  for (const seed of shelterPetSeed) {
    const publicToken = generatePublicToken();
    const [pet] = await db
      .insert(pets)
      .values({
        publicToken,
        species: seed.species,
        breed: seed.breed,
        name: seed.name,
        sex: seed.sex,
        color: seed.color,
        distinguishingFeatures: seed.distinguishingFeatures,
        // Legacy chip columns omitted — ARCH-R; canonical row written to
        // pet_identifications below.
        status: "active",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
        acquisitionMethod: "found_stray",
      })
      .returning({ id: pets.id, publicToken: pets.publicToken });

    await db.insert(ownerships).values({
      petId: pet.id,
      ownerOrganizationId: orgId,
      role: "shelter_custody",
    });

    await db.insert(petEvents).values({
      petId: pet.id,
      eventType: "shelter_intake_recorded",
      occurredAt: new Date(),
      recordedByUserId: intakeActorId,
      authorRole: "shelter",
      authorOrganizationId: orgId,
      authorVerified: true,
      payload: {
        source: "seed-script",
        intake_kind: "stray",
        location_description: "Vía pública — La Plata",
      },
    });

    // Microchip: emit event + canonical pet_identifications row.
    // Legacy pets.* chip columns not written — ARCH-R.
    // implant_date_known: true so the projection's microchipImplantedAt
    // (formatDate(occurredAt)) matches the canonical row's recordedAt —
    // both resolve to the same date and the pet-cache drift harness sees
    // zero drift (ARCH-I).
    if (seed.microchipId) {
      const chip = seed.microchipId;
      const chipNow = new Date();
      await db.insert(petEvents).values({
        petId: pet.id,
        eventType: "microchip_implanted",
        occurredAt: chipNow,
        recordedAt: chipNow,
        recordedByUserId: intakeActorId,
        authorRole: "shelter",
        authorOrganizationId: orgId,
        authorVerified: true,
        payload: {
          chip_number: chip,
          country_code: "858",
          implanted_by: null,
          location_on_body: null,
          implant_date_known: true,
        },
      });
      await db.insert(petIdentifications).values({
        petId: pet.id,
        kind: "microchip_iso",
        code: chip,
        recordedAt: chipNow.toISOString().slice(0, 10),
        isoCountryCode: chip.slice(0, 3),
        isoManufacturerCode: chip.slice(3, 7),
        isoNationalId: chip.slice(7, 15),
        isoCompliant: true,
      });
    }

    log("OK", `shelter pet ${seed.name} (${pet.publicToken})`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log("INFO", `Seeding against ${SUPABASE_URL}`);
  log("INFO", `Shared password: ${SHARED_PASSWORD}`);

  const adminId = await bootstrapAdmin();
  const ownerId = await signupOwner();
  const vetId = await provisionVet(adminId);
  const { orgAdminUserId, orgId, orgToken } = await provisionOrg(adminId);
  await seedOrgCoverage(orgId);
  await provisionGovt(adminId, {
    stepLabel: "6a/9",
    email: EMAILS.govt,
    displayName: DISPLAY.govt,
    localities: GOVT_REMOTE_LOCALITIES,
  });
  await provisionGovt(adminId, {
    stepLabel: "6b/9",
    email: EMAILS.govtLocal,
    displayName: DISPLAY.govtLocal,
    localities: GOVT_LOCAL_LOCALITIES,
  });
  await attachVetToOrg(orgId, vetId);
  await seedOwnerPets(ownerId);
  await seedShelterPets(orgId, orgAdminUserId);

  log("DONE", "seed complete");
  console.log("\n=== Access summary ===");
  console.log(`Shared password: ${SHARED_PASSWORD}\n`);
  console.log(`  ${EMAILS.admin.padEnd(24)}  role=admin   → /admin  /gob`);
  console.log(`  ${EMAILS.owner.padEnd(24)}  role=owner   → /mis-mascotas`);
  console.log(
    `  ${EMAILS.vet.padEnd(24)}  role=vet     → /cuenta (matrícula verificada, no org yet)`,
  );
  console.log(`  ${EMAILS.orgAdmin.padEnd(24)}  role=owner   → /org/${orgToken}`);
  console.log(`  ${EMAILS.govt.padEnd(24)}  role=govt    → /gob (Ushuaia + El Calafate)`);
  console.log(`  ${EMAILS.govtLocal.padEnd(24)}  role=govt    → /gob (La Plata + CABA)`);
  console.log(`\n  Refugio portal:   /org/${orgToken}`);
  console.log("  Admin DIM:        /admin");
  console.log("  Gobierno:         /gob");
  console.log("  Mis mascotas:     /mis-mascotas");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n[FATAL]", err);
    process.exit(1);
  });
