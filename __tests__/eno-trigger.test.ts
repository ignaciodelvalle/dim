// Integration tests for ENO pipeline (Enfermedades de Notificación Obligatoria).
//
// Spec: docs/superpowers/specs/2026-05-21-eno-pipeline-design.md
//
// Covers (via processEnoEventTrigger — auth-stripped):
//   1. rabies → full fanout: province + locality govt notified + owner notified.
//   2. leishmaniasis (stigmaSensitive=true) → govts notified, owner NOT notified.
//   3. non-ENO disease_code → no-op (no notifications, no audit log entry).
//   4. no govt in scope → graceful no-op (no notifications, function returns without error).

import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  auditLog,
  db,
  govtAssignments,
  notifications,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { processEnoEventTrigger } from "@/lib/eno-trigger";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Test identifiers
// ---------------------------------------------------------------------------

const OWNER_EMAIL = "eno-owner@dim-test.local";
const VET_EMAIL = "eno-vet@dim-test.local";
const GOVT_PROVINCE_EMAIL = "eno-govt-prov@dim-test.local";
const GOVT_LOCALITY_EMAIL = "eno-govt-local@dim-test.local";
const PASS = "EnoFlow_2026!";

const TEST_PROVINCE = "Buenos Aires";
const TEST_LOCALITY = "Mar del Plata";

let ownerUserId: string;
let vetUserId: string;
let govtProvinceUserId: string;
let govtLocalityUserId: string;

const insertedPetIds: string[] = [];
const insertedGovtAssignmentIds: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function purgeUserByEmail(email: string) {
  const { data } = await supabase.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === email);
  const displayName = email.split("@")[0];
  const orphans = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.displayName, displayName));
  const ids = [
    ...(found ? [found.id] : []),
    ...orphans.map((o) => o.id).filter((id) => id !== found?.id),
  ];
  for (const uid of ids) {
    // Revoke any active govt_assignments so they don't pollute future test queries.
    await db
      .update(govtAssignments)
      .set({ revokedAt: new Date() })
      .where(and(eq(govtAssignments.userId, uid), isNull(govtAssignments.revokedAt)));
    // Delete notifications (safe — no restrict FKs).
    await db.delete(notifications).where(eq(notifications.userId, uid));
    // Profile deletion may fail if audit_log references it (ON DELETE RESTRICT).
    // Swallow the error — the profile will be orphaned but assignments are revoked.
    await withMutationOverride(async (tx) => {
      await tx.delete(profiles).where(eq(profiles.id, uid));
    }).catch(() => {
      // Intentionally swallow FK violations from audit_log → profiles.
      // The orphan profile is harmless; govtAssignments are already revoked.
    });
  }
  if (found) {
    await supabase.auth.admin.deleteUser(found.id).catch(() => {
      // Swallow if auth user deletion fails due to lingering FK.
    });
  }
}

async function insertTestPet(ownerUid: string, tokenSuffix: string) {
  const token = `ENO-${tokenSuffix}-${Date.now()}`;
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `EnoPet${tokenSuffix}`,
      species: "dog",
      sex: "male",
      status: "active",
      jurisdictionCountry: "AR",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
    })
    .returning();
  await db.insert(ownerships).values({
    petId: pet.id,
    ownerUserId: ownerUid,
    role: "owner",
  });
  insertedPetIds.push(pet.id);
  return pet;
}

/**
 * Build a synthetic petEvent row that matches what recordDiseaseDiagnosisWriter
 * inserts — we call processEnoEventTrigger directly without going through the
 * full action so we can control disease_code precisely.
 */
function makeDiagnosisEvent(
  eventId: string,
  petId: string,
  diseaseCode: string,
): Parameters<typeof processEnoEventTrigger>[0] {
  return {
    id: eventId,
    petId,
    authorRole: "vet",
    recordedByUserId: vetUserId,
    authorOrganizationId: null,
    payload: {
      sub_kind: "disease_diagnosis",
      disease_code: diseaseCode,
      diagnosis_date: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Purge any leftovers from previous runs
  for (const email of [OWNER_EMAIL, VET_EMAIL, GOVT_PROVINCE_EMAIL, GOVT_LOCALITY_EMAIL]) {
    await purgeUserByEmail(email);
  }

  // Create owner
  const o = await supabase.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (o.error || !o.data.user) throw new Error(`createUser owner: ${o.error?.message}`);
  ownerUserId = o.data.user.id;
  await db
    .update(profiles)
    .set({ displayName: OWNER_EMAIL.split("@")[0] })
    .where(eq(profiles.id, ownerUserId));

  // Create vet
  const v = await supabase.auth.admin.createUser({
    email: VET_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (v.error || !v.data.user) throw new Error(`createUser vet: ${v.error?.message}`);
  vetUserId = v.data.user.id;
  await db
    .update(profiles)
    .set({ role: "vet", matriculaVerified: true, displayName: VET_EMAIL.split("@")[0] })
    .where(eq(profiles.id, vetUserId));

  // Create province-scope govt (covers entire province — locality='')
  const gp = await supabase.auth.admin.createUser({
    email: GOVT_PROVINCE_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (gp.error || !gp.data.user) throw new Error(`createUser govt-prov: ${gp.error?.message}`);
  govtProvinceUserId = gp.data.user.id;
  await db
    .update(profiles)
    .set({
      role: "govt",
      accountType: "institutional",
      displayName: GOVT_PROVINCE_EMAIL.split("@")[0],
    })
    .where(eq(profiles.id, govtProvinceUserId));

  const [provAssignment] = await db
    .insert(govtAssignments)
    .values({
      userId: govtProvinceUserId,
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: "", // province-wide sentinel
      grantedByUserId: govtProvinceUserId,
    })
    .returning();
  insertedGovtAssignmentIds.push(provAssignment.id);

  // Create locality-scope govt (exact locality match)
  const gl = await supabase.auth.admin.createUser({
    email: GOVT_LOCALITY_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (gl.error || !gl.data.user) throw new Error(`createUser govt-local: ${gl.error?.message}`);
  govtLocalityUserId = gl.data.user.id;
  await db
    .update(profiles)
    .set({
      role: "govt",
      accountType: "institutional",
      displayName: GOVT_LOCALITY_EMAIL.split("@")[0],
    })
    .where(eq(profiles.id, govtLocalityUserId));

  const [localityAssignment] = await db
    .insert(govtAssignments)
    .values({
      userId: govtLocalityUserId,
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
      grantedByUserId: govtLocalityUserId,
    })
    .returning();
  insertedGovtAssignmentIds.push(localityAssignment.id);
});

afterAll(async () => {
  // Revoke govt assignments (plain update — govtAssignments is not append-only).
  for (const id of insertedGovtAssignmentIds) {
    await db
      .update(govtAssignments)
      .set({ revokedAt: new Date() })
      .where(eq(govtAssignments.id, id));
  }

  // Delete pets (cascades to ownerships + pet_events via append-only override).
  for (const petId of insertedPetIds) {
    await withMutationOverride(async (tx) => {
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }

  // Purge test users (revokes assignments, deletes notifications, attempts profile/auth deletion).
  for (const email of [OWNER_EMAIL, VET_EMAIL, GOVT_PROVINCE_EMAIL, GOVT_LOCALITY_EMAIL]) {
    await purgeUserByEmail(email);
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processEnoEventTrigger", () => {
  it("rabies → full fanout: province + locality govts notified + owner notified", async () => {
    const pet = await insertTestPet(ownerUserId, "RABIES");

    // Insert a real clinical_info_logged event so relatedEventId FK is valid
    const [clinicEvent] = await db
      .insert(petEvents)
      .values({
        petId: pet.id,
        eventType: "clinical_info_logged",
        occurredAt: new Date(),
        recordedByUserId: vetUserId,
        authorRole: "vet",
        payload: {
          sub_kind: "disease_diagnosis",
          disease_code: "rabies",
          diagnosis_date: new Date().toISOString(),
        },
      })
      .returning();

    await processEnoEventTrigger(makeDiagnosisEvent(clinicEvent.id, pet.id, "rabies"));

    // Two govt notifications (province + locality)
    const govtNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.notificationType, "eno_disease_diagnosis"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(govtNotifs.length).toBe(2);

    const govtUserIds = govtNotifs.map((n) => n.userId).sort();
    expect(govtUserIds).toContain(govtProvinceUserId);
    expect(govtUserIds).toContain(govtLocalityUserId);
    expect(govtNotifs[0].severity).toBe("urgent"); // rabies is critical

    // Owner notification (rabies is NOT stigmaSensitive)
    const ownerNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "eno_pet_disease_diagnosis"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(ownerNotifs.length).toBe(1);

    // Audit log entry
    const auditRows = (await db.execute(
      sql`SELECT action, payload FROM audit_log
          WHERE actor_user_id = ${vetUserId}
            AND action = 'eno_notification_emitted'
            AND payload->>'pet_id' = ${pet.id}
          ORDER BY performed_at DESC
          LIMIT 1`,
    )) as Array<{ action: string; payload: Record<string, unknown> }>;

    expect(auditRows.length).toBe(1);
    expect(auditRows[0].payload.targets_count).toBe(2);
    expect(auditRows[0].payload.owner_was_notified).toBe(true);
    expect(auditRows[0].payload.disease_code).toBe("rabies");
  });

  it("leishmaniasis (stigmaSensitive=true) → govts notified, owner NOT notified", async () => {
    const pet = await insertTestPet(ownerUserId, "LEISH");

    const [clinicEvent] = await db
      .insert(petEvents)
      .values({
        petId: pet.id,
        eventType: "clinical_info_logged",
        occurredAt: new Date(),
        recordedByUserId: vetUserId,
        authorRole: "vet",
        payload: {
          sub_kind: "disease_diagnosis",
          disease_code: "leishmaniasis",
          diagnosis_date: new Date().toISOString(),
        },
      })
      .returning();

    await processEnoEventTrigger(makeDiagnosisEvent(clinicEvent.id, pet.id, "leishmaniasis"));

    // Govt notifications are created (N = 2)
    const govtNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.notificationType, "eno_disease_diagnosis"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(govtNotifs.length).toBe(2);

    // Owner notification is NOT created (stigmaSensitive=true)
    const ownerNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "eno_pet_disease_diagnosis"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(ownerNotifs.length).toBe(0);

    // Audit log shows owner_was_notified=false
    const auditRows = (await db.execute(
      sql`SELECT payload FROM audit_log
          WHERE actor_user_id = ${vetUserId}
            AND action = 'eno_notification_emitted'
            AND payload->>'pet_id' = ${pet.id}
          ORDER BY performed_at DESC
          LIMIT 1`,
    )) as Array<{ payload: Record<string, unknown> }>;

    expect(auditRows.length).toBe(1);
    expect(auditRows[0].payload.owner_was_notified).toBe(false);
    expect(auditRows[0].payload.targets_count).toBe(2);
  });

  it("non-ENO disease_code → no-op (no notifications, no audit_log entry)", async () => {
    const pet = await insertTestPet(ownerUserId, "ALLERGY");

    // Pet event with a non-ENO disease code
    const [clinicEvent] = await db
      .insert(petEvents)
      .values({
        petId: pet.id,
        eventType: "clinical_info_logged",
        occurredAt: new Date(),
        recordedByUserId: vetUserId,
        authorRole: "vet",
        payload: {
          sub_kind: "disease_diagnosis",
          disease_code: "allergy", // NOT in ENO catalog
          diagnosis_date: new Date().toISOString(),
        },
      })
      .returning();

    // Should silently return without inserting anything
    await expect(
      processEnoEventTrigger(makeDiagnosisEvent(clinicEvent.id, pet.id, "allergy")),
    ).resolves.toBeUndefined();

    // No ENO notifications
    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.notificationType, "eno_disease_diagnosis"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(notifs.length).toBe(0);

    // No eno_notification_emitted audit entry for this pet
    const auditRows = (await db.execute(
      sql`SELECT action FROM audit_log
          WHERE action = 'eno_notification_emitted'
            AND payload->>'pet_id' = ${pet.id}`,
    )) as Array<{ action: string }>;
    expect(auditRows.length).toBe(0);
  });

  it("no govt in scope → graceful no-op (no notifications, function resolves without error)", async () => {
    // Insert a pet in a jurisdiction with NO govt_assignments.
    // Uses a synthetic province name that is guaranteed to have no seeded govts.
    const token = `ENO-NOJURIS-${Date.now()}`;
    const [pet] = await db
      .insert(pets)
      .values({
        publicToken: token,
        name: "EnoPetNoJuris",
        species: "dog",
        sex: "female",
        status: "active",
        jurisdictionCountry: "AR",
        jurisdictionProvince: "ENO_TEST_UNASSIGNED_PROVINCE",
        jurisdictionLocality: "ENO_TEST_UNASSIGNED_LOCALITY",
      })
      .returning();
    await db.insert(ownerships).values({
      petId: pet.id,
      ownerUserId: ownerUserId,
      role: "owner",
    });
    insertedPetIds.push(pet.id);

    const [clinicEvent] = await db
      .insert(petEvents)
      .values({
        petId: pet.id,
        eventType: "clinical_info_logged",
        occurredAt: new Date(),
        recordedByUserId: vetUserId,
        authorRole: "vet",
        payload: {
          sub_kind: "disease_diagnosis",
          disease_code: "rabies",
          diagnosis_date: new Date().toISOString(),
        },
      })
      .returning();

    // Must resolve without error even with 0 govt targets
    await expect(
      processEnoEventTrigger(makeDiagnosisEvent(clinicEvent.id, pet.id, "rabies")),
    ).resolves.toBeUndefined();

    // Zero govt notifications (no targets)
    const govtNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.notificationType, "eno_disease_diagnosis"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(govtNotifs.length).toBe(0);

    // Owner notification is still created (rabies is not stigmaSensitive)
    const ownerNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "eno_pet_disease_diagnosis"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(ownerNotifs.length).toBe(1);

    // Audit log has targets_count=0
    const auditRows = (await db.execute(
      sql`SELECT payload FROM audit_log
          WHERE actor_user_id = ${vetUserId}
            AND action = 'eno_notification_emitted'
            AND payload->>'pet_id' = ${pet.id}
          ORDER BY performed_at DESC
          LIMIT 1`,
    )) as Array<{ payload: Record<string, unknown> }>;

    expect(auditRows.length).toBe(1);
    expect(auditRows[0].payload.targets_count).toBe(0);
    expect(auditRows[0].payload.owner_was_notified).toBe(true);
  });
});
