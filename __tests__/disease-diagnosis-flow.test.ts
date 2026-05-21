// Integration tests for the vet direct-diagnosis flow (ENO spec §6).
//
// Covers (via recordDiseaseDiagnosisWriter — auth-stripped variant):
//   1. Rabies-confirmed diagnosis → clinical_info_logged + outbreak_signal
//      with triggered_by='direct_diagnosis' + owner public-alert notif.
//   2. Non-reportable disease → only clinical_info_logged (no signal).
//   3. Reportable disease NOT in PUBLIC_ALERT_DISEASES → outbreak_signal but
//      no owner notification.
//   4. Throttle: second diagnosis within 30d does not re-notify the owner.

import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordDiseaseDiagnosisWriter } from "@/app/actions/events";
import { db, notifications, ownerships, petEvents, pets, profiles } from "@/db";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const OWNER_EMAIL = "ddx-owner@dim-test.local";
const VET_EMAIL = "ddx-vet@dim-test.local";
const ADMIN_EMAIL = "ddx-admin@dim-test.local";
const PASS = "DdxFlow_2026!";

let ownerUserId: string;
let vetUserId: string;
let adminUserId: string;
const insertedPetIds: string[] = [];

const TEST_PROVINCE = "AR-C";
const TEST_LOCALITY = "Almagro";

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
  // Deleting profiles cascades to pet_events.recorded_by_user_id (ON DELETE
  // SET NULL), which triggers the append-only protection. Wrap so the
  // cascading UPDATE is allowed.
  // NOTE: profile deletion may also fail if audit_log references the profile
  // (ON DELETE RESTRICT). This can happen when ENO or other triggers write
  // audit_log entries referencing this vet. Swallow to avoid cascading
  // teardown failures — the orphan profile is harmless.
  for (const uid of ids) {
    await db.delete(notifications).where(eq(notifications.userId, uid));
    await withMutationOverride(async (tx) => {
      await tx.delete(profiles).where(eq(profiles.id, uid));
    }).catch(() => {
      // Intentionally swallow FK violations from audit_log → profiles (ON DELETE RESTRICT).
    });
  }
  if (found) {
    await supabase.auth.admin.deleteUser(found.id).catch(() => {
      // Swallow if auth user deletion fails due to lingering FK.
    });
  }
}

async function insertTestPet(ownerUid: string, tokenSuffix: string) {
  const token = `DDXTEST-${tokenSuffix}-${Date.now()}`;
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `DdxPet${tokenSuffix}`,
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

beforeAll(async () => {
  await purgeUserByEmail(OWNER_EMAIL);
  await purgeUserByEmail(VET_EMAIL);
  await purgeUserByEmail(ADMIN_EMAIL);

  const o = await supabase.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (o.error || !o.data.user) throw new Error(`createUser owner: ${o.error?.message}`);
  ownerUserId = o.data.user.id;

  const v = await supabase.auth.admin.createUser({
    email: VET_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (v.error || !v.data.user) throw new Error(`createUser vet: ${v.error?.message}`);
  vetUserId = v.data.user.id;
  await db
    .update(profiles)
    .set({ role: "vet", matriculaVerified: true, displayName: "Dr. Test Ddx" })
    .where(eq(profiles.id, vetUserId));

  const a = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (a.error || !a.data.user) throw new Error(`createUser admin: ${a.error?.message}`);
  adminUserId = a.data.user.id;
  await db
    .update(profiles)
    .set({ role: "admin", accountType: "institutional" })
    .where(eq(profiles.id, adminUserId));
});

afterAll(async () => {
  for (const petId of insertedPetIds) {
    await withMutationOverride(async (tx) => {
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }
  for (const uid of [ownerUserId, vetUserId, adminUserId].filter(Boolean)) {
    await db.delete(notifications).where(eq(notifications.userId, uid));
  }
  await purgeUserByEmail(OWNER_EMAIL);
  await purgeUserByEmail(VET_EMAIL);
  await purgeUserByEmail(ADMIN_EMAIL);
});

describe("recordDiseaseDiagnosisWriter", () => {
  it("rabies_confirmed → diagnosis event + signal (direct_diagnosis) + owner alert", async () => {
    const pet = await insertTestPet(ownerUserId, "RABIES");

    const result = await recordDiseaseDiagnosisWriter({
      petId: pet.id,
      petName: pet.name,
      petSpecies: pet.species,
      petJurisdictionCountry: pet.jurisdictionCountry,
      petJurisdictionProvince: pet.jurisdictionProvince ?? null,
      petJurisdictionLocality: pet.jurisdictionLocality ?? null,
      vetUserId,
      vetDisplayName: "Dr. Test Ddx",
      diseaseCode: "rabies_confirmed",
      confirmedByLab: true,
      labName: "INPPAZ",
      labReportReference: "LAB-RABIES-001",
      diagnosisDate: new Date(),
      notes: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signalEventId).not.toBeNull();
    expect(result.ownerNotificationsDelivered).toBe(1);

    const diagnosisRows = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "clinical_info_logged")));
    expect(diagnosisRows.length).toBe(1);
    const payload = diagnosisRows[0].payload as Record<string, unknown>;
    expect(payload.sub_kind).toBe("disease_diagnosis");
    expect(payload.disease_code).toBe("rabies_confirmed");
    expect(payload.confirmed_by_lab).toBe(true);

    const signalRows = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "outbreak_signal")));
    expect(signalRows.length).toBe(1);
    const sigPayload = signalRows[0].payload as Record<string, unknown>;
    expect(sigPayload.triggered_by).toBe("direct_diagnosis");
    expect(sigPayload.source_symptom_event_id).toBeNull();
    expect(sigPayload.source_disease_diagnosis_event_id).toBe(diagnosisRows[0].id);
    expect(sigPayload.confirmed_by_lab).toBe(true);

    const ownerAlerts = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "disease_public_alert"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(ownerAlerts.length).toBe(1);
    expect(ownerAlerts[0].severity).toBe("urgent");
  });

  it("non-reportable disease (parvovirus) → only diagnosis row, no signal", async () => {
    const pet = await insertTestPet(ownerUserId, "PARVO");

    const result = await recordDiseaseDiagnosisWriter({
      petId: pet.id,
      petName: pet.name,
      petSpecies: pet.species,
      petJurisdictionCountry: pet.jurisdictionCountry,
      petJurisdictionProvince: pet.jurisdictionProvince ?? null,
      petJurisdictionLocality: pet.jurisdictionLocality ?? null,
      vetUserId,
      vetDisplayName: "Dr. Test Ddx",
      diseaseCode: "parvovirus",
      confirmedByLab: false,
      labName: null,
      labReportReference: null,
      diagnosisDate: new Date(),
      notes: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signalEventId).toBeNull();
    expect(result.ownerNotificationsDelivered).toBe(0);

    const signalRows = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "outbreak_signal")));
    expect(signalRows.length).toBe(0);
  });

  it("reportable but NOT in public-alert catalog (canine_brucellosis) → signal, no owner alert", async () => {
    const pet = await insertTestPet(ownerUserId, "BRUC");

    const result = await recordDiseaseDiagnosisWriter({
      petId: pet.id,
      petName: pet.name,
      petSpecies: pet.species,
      petJurisdictionCountry: pet.jurisdictionCountry,
      petJurisdictionProvince: pet.jurisdictionProvince ?? null,
      petJurisdictionLocality: pet.jurisdictionLocality ?? null,
      vetUserId,
      vetDisplayName: "Dr. Test Ddx",
      diseaseCode: "canine_brucellosis",
      confirmedByLab: true,
      labName: "INPPAZ",
      labReportReference: null,
      diagnosisDate: new Date(),
      notes: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signalEventId).not.toBeNull();
    expect(result.ownerNotificationsDelivered).toBe(0);

    const ownerAlerts = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "disease_public_alert"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(ownerAlerts.length).toBe(0);
  });

  it("throttle: re-diagnosing same disease within 30d does not re-notify owner", async () => {
    const pet = await insertTestPet(ownerUserId, "THROTTLE");

    const first = await recordDiseaseDiagnosisWriter({
      petId: pet.id,
      petName: pet.name,
      petSpecies: pet.species,
      petJurisdictionCountry: pet.jurisdictionCountry,
      petJurisdictionProvince: pet.jurisdictionProvince ?? null,
      petJurisdictionLocality: pet.jurisdictionLocality ?? null,
      vetUserId,
      vetDisplayName: "Dr. Test Ddx",
      diseaseCode: "leptospirosis",
      confirmedByLab: false,
      labName: null,
      labReportReference: null,
      diagnosisDate: new Date(),
      notes: null,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.ownerNotificationsDelivered).toBe(1);

    const second = await recordDiseaseDiagnosisWriter({
      petId: pet.id,
      petName: pet.name,
      petSpecies: pet.species,
      petJurisdictionCountry: pet.jurisdictionCountry,
      petJurisdictionProvince: pet.jurisdictionProvince ?? null,
      petJurisdictionLocality: pet.jurisdictionLocality ?? null,
      vetUserId,
      vetDisplayName: "Dr. Test Ddx",
      diseaseCode: "leptospirosis",
      confirmedByLab: true,
      labName: "INPPAZ",
      labReportReference: null,
      diagnosisDate: new Date(),
      notes: null,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.ownerNotificationsDelivered).toBe(0);

    // But TWO diagnosis events exist (writer doesn't dedupe diagnoses).
    const diagnosisRows = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "clinical_info_logged")));
    expect(diagnosisRows.length).toBe(2);

    // Owner notifications: only one.
    const ownerAlerts = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "disease_public_alert"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(ownerAlerts.length).toBe(1);
    expect(isNull(notifications.archivedAt));
  });
});
