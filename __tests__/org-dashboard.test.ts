// Tests for lib/org-dashboard.ts — Wave 3 Item 17: Org operations dashboard.
//
// Coverage:
//   1. fetchIntakesLastWeek — counts shelter_intake_recorded events in window.
//   2. fetchAvailableForAdoption — counts eligible custody pets.
//   3. fetchActiveAdoptions — counts open applications (no resolved event).
//   4. fetchRequiresAction — surfaces long-stay animals; excludes animals with
//      ended custody.
//   5. actionReasonLabel / actionReasonIcon — pure helpers, no DB.
//   6. Empty-shelter org: all counts return 0 (not errors).
//
// Integration tests use the local Supabase/Postgres stack (127.0.0.1:54322).
// Fixtures are cleaned up in afterEach.

import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db, organizations, ownerships, petEvents, pets } from "@/db";
import {
  LONG_STAY_DAYS,
  actionReasonIcon,
  actionReasonLabel,
  fetchActiveAdoptions,
  fetchAvailableForAdoption,
  fetchIntakesLastWeek,
  fetchOrgDashboardMetrics,
  fetchRequiresAction,
} from "@/lib/org-dashboard";
import { withMutationOverride } from "./_helpers/db-overrides";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const fixtureOrgIds: string[] = [];
const fixturePetIds: string[] = [];
const fixtureEventIds: string[] = [];

// Use a random 6-char suffix so re-runs and parallel workers never collide.
const RUN_ID = Math.random().toString(36).slice(2, 8).toUpperCase();
let counter = 0;
function next(prefix = "T"): string {
  counter += 1;
  return `${prefix}-D${RUN_ID}-${String(counter).padStart(3, "0")}`;
}

async function makeOrg(extra: Partial<typeof organizations.$inferInsert> = {}): Promise<string> {
  const token = next("ORG");
  const [row] = await db
    .insert(organizations)
    .values({
      publicToken: token,
      legalName: "Test Dash Org",
      displayName: "Test Dash Org",
      orgType: "shelter",
      email: `dash-${counter}@dim-test.local`,
      ...extra,
    })
    .returning({ id: organizations.id });
  fixtureOrgIds.push(row.id);
  return row.id;
}

async function makePet(
  species: "dog" | "cat" | "rabbit" = "dog",
  adoptionEligible = false,
): Promise<string> {
  const token = next("DIM");
  // When adoptionEligible is set, adoptionEligibilitySetAt must also be set
  // (pets_adoption_eligibility_consistent check constraint).
  const eligibilityFields = adoptionEligible
    ? { adoptionEligible: true as const, adoptionEligibilitySetAt: new Date() }
    : {};
  const [row] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `Dash Pet ${token}`,
      species,
      sex: "unknown",
      ...eligibilityFields,
    })
    .returning({ id: pets.id });
  fixturePetIds.push(row.id);
  return row.id;
}

async function makeCustody(
  petId: string,
  orgId: string,
  opts: { startedAt?: Date; endedAt?: Date | null } = {},
): Promise<void> {
  await db.insert(ownerships).values({
    petId,
    ownerOrganizationId: orgId,
    role: "shelter_custody",
    startedAt: opts.startedAt ?? new Date(),
    endedAt: opts.endedAt ?? undefined,
  });
}

async function makeIntakeEvent(petId: string, orgId: string, occurredAt: Date): Promise<string> {
  const [row] = await db
    .insert(petEvents)
    .values({
      petId,
      eventType: "shelter_intake_recorded",
      occurredAt,
      recordedAt: new Date(),
      authorRole: "shelter",
      authorOrganizationId: orgId,
      payload: {},
    })
    .returning({ id: petEvents.id });
  fixtureEventIds.push(row.id);
  return row.id;
}

async function makeAdoptionSubmitted(petId: string, orgId: string): Promise<string> {
  const [row] = await db
    .insert(petEvents)
    .values({
      petId,
      eventType: "adoption_application_submitted",
      occurredAt: new Date(),
      recordedAt: new Date(),
      authorRole: "owner",
      payload: { applicant_user_id: "00000000-0000-0000-0000-000000000001" },
    })
    .returning({ id: petEvents.id });
  fixtureEventIds.push(row.id);
  return row.id;
}

async function makeAdoptionResolved(petId: string, applicationEventId: string): Promise<void> {
  const [row] = await db
    .insert(petEvents)
    .values({
      petId,
      eventType: "adoption_application_resolved",
      occurredAt: new Date(),
      recordedAt: new Date(),
      authorRole: "shelter",
      payload: {
        application_event_id: applicationEventId,
        outcome: "rejected",
      },
    })
    .returning({ id: petEvents.id });
  fixtureEventIds.push(row.id);
}

afterEach(async () => {
  // pet_events is append-only at the DB level — deleting requires the
  // withMutationOverride GUC escape hatch (same pattern as govt-dashboards.test.ts).
  // Deleting pets also cascades through ownerships; pet_events rows created by
  // fixtures are covered by the mutation override.
  if (fixturePetIds.length > 0) {
    await withMutationOverride(async (tx) => {
      if (fixtureEventIds.length > 0) {
        await tx.delete(petEvents).where(inArray(petEvents.id, fixtureEventIds));
      }
      await tx.delete(pets).where(inArray(pets.id, fixturePetIds));
    });
    fixtureEventIds.length = 0;
    fixturePetIds.length = 0;
  } else if (fixtureEventIds.length > 0) {
    // Events without pets (edge case — keep defensive)
    await withMutationOverride(async (tx) => {
      await tx.delete(petEvents).where(inArray(petEvents.id, fixtureEventIds));
    });
    fixtureEventIds.length = 0;
  }
  if (fixtureOrgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, fixtureOrgIds));
    fixtureOrgIds.length = 0;
  }
});

// ---------------------------------------------------------------------------
// fetchIntakesLastWeek
// ---------------------------------------------------------------------------

describe("fetchIntakesLastWeek", () => {
  it("returns 0 for an org with no events", async () => {
    const orgId = await makeOrg();
    expect(await fetchIntakesLastWeek(orgId)).toBe(0);
  });

  it("counts intake events from this org in the last 7 days", async () => {
    const orgId = await makeOrg();
    const petId = await makePet();
    await makeCustody(petId, orgId);

    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    await makeIntakeEvent(petId, orgId, recent);

    expect(await fetchIntakesLastWeek(orgId)).toBe(1);
  });

  it("excludes intake events older than 7 days", async () => {
    const orgId = await makeOrg();
    const petId = await makePet();
    await makeCustody(petId, orgId);

    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    await makeIntakeEvent(petId, orgId, old);

    expect(await fetchIntakesLastWeek(orgId)).toBe(0);
  });

  it("does not count intakes authored by a different org", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const petId = await makePet();
    await makeCustody(petId, orgA);

    // orgB records an intake on a pet not in its custody
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    await makeIntakeEvent(petId, orgB, recent);

    expect(await fetchIntakesLastWeek(orgA)).toBe(0);
    expect(await fetchIntakesLastWeek(orgB)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// fetchAvailableForAdoption
// ---------------------------------------------------------------------------

describe("fetchAvailableForAdoption", () => {
  it("returns 0 when no pets are in custody", async () => {
    const orgId = await makeOrg();
    expect(await fetchAvailableForAdoption(orgId)).toBe(0);
  });

  it("counts eligible pets in active custody", async () => {
    const orgId = await makeOrg();
    const petId = await makePet("dog", true);
    await makeCustody(petId, orgId);

    expect(await fetchAvailableForAdoption(orgId)).toBe(1);
  });

  it("excludes pets with adoption_eligible = false or null", async () => {
    const orgId = await makeOrg();
    const petIneligible = await makePet("cat", false);
    await makeCustody(petIneligible, orgId);

    expect(await fetchAvailableForAdoption(orgId)).toBe(0);
  });

  it("excludes pets whose custody has ended", async () => {
    const orgId = await makeOrg();
    const petId = await makePet("dog", true);
    await makeCustody(petId, orgId, { endedAt: new Date(Date.now() - 1000) });

    expect(await fetchAvailableForAdoption(orgId)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fetchActiveAdoptions
// ---------------------------------------------------------------------------

describe("fetchActiveAdoptions", () => {
  it("returns 0 when no applications exist", async () => {
    const orgId = await makeOrg();
    expect(await fetchActiveAdoptions(orgId)).toBe(0);
  });

  it("counts open applications on custody pets", async () => {
    const orgId = await makeOrg();
    const petId = await makePet("dog", true);
    await makeCustody(petId, orgId);
    await makeAdoptionSubmitted(petId, orgId);

    expect(await fetchActiveAdoptions(orgId)).toBe(1);
  });

  it("excludes resolved applications", async () => {
    const orgId = await makeOrg();
    const petId = await makePet("dog", true);
    await makeCustody(petId, orgId);
    const appEventId = await makeAdoptionSubmitted(petId, orgId);
    await makeAdoptionResolved(petId, appEventId);

    expect(await fetchActiveAdoptions(orgId)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fetchRequiresAction — long-stay flag
// ---------------------------------------------------------------------------

describe("fetchRequiresAction — long-stay", () => {
  it("returns empty list for an org with no custody pets", async () => {
    const orgId = await makeOrg();
    const result = await fetchRequiresAction(orgId);
    expect(result).toHaveLength(0);
  });

  it("surfaces pets with custody older than LONG_STAY_DAYS", async () => {
    const orgId = await makeOrg();
    const petId = await makePet("dog");
    const oldStart = new Date(Date.now() - (LONG_STAY_DAYS + 5) * 24 * 60 * 60 * 1000);
    await makeCustody(petId, orgId, { startedAt: oldStart });

    const result = await fetchRequiresAction(orgId);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const item = result.find((r) => r.petId === petId);
    expect(item).toBeDefined();
    expect(item?.reasons).toContain("long_stay");
  });

  it("does not surface pets with recent intake (short stay)", async () => {
    const orgId = await makeOrg();
    const petId = await makePet("dog");
    // Recent custody — well within LONG_STAY_DAYS and no health flags
    await makeCustody(petId, orgId, { startedAt: new Date() });

    const result = await fetchRequiresAction(orgId);
    const item = result.find((r) => r.petId === petId);
    expect(item).toBeUndefined();
  });

  it("excludes pets whose custody has ended", async () => {
    const orgId = await makeOrg();
    const petId = await makePet("dog");
    const oldStart = new Date(Date.now() - (LONG_STAY_DAYS + 10) * 24 * 60 * 60 * 1000);
    await makeCustody(petId, orgId, {
      startedAt: oldStart,
      endedAt: new Date(), // ended — should not surface
    });

    const result = await fetchRequiresAction(orgId);
    const item = result.find((r) => r.petId === petId);
    expect(item).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fetchOrgDashboardMetrics — all-zero empty shelter
// ---------------------------------------------------------------------------

describe("fetchOrgDashboardMetrics — empty shelter", () => {
  it("returns zeros across all metrics for a newly-created org", async () => {
    const orgId = await makeOrg();
    const metrics = await fetchOrgDashboardMetrics(orgId);

    expect(metrics.intakesLastWeek).toBe(0);
    expect(metrics.availableForAdopt).toBe(0);
    expect(metrics.activeAdoptions).toBe(0);
    expect(metrics.requiresActionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — no DB required
// ---------------------------------------------------------------------------

describe("actionReasonLabel", () => {
  it("returns a non-empty string for each reason", () => {
    const reasons = [
      "overdue_vaccine",
      "overdue_deworming",
      "active_medication_no_dose",
      "long_stay",
    ] as const;
    for (const r of reasons) {
      expect(actionReasonLabel(r).length).toBeGreaterThan(0);
    }
  });
});

describe("actionReasonIcon", () => {
  it("returns a non-empty string for each reason", () => {
    const reasons = [
      "overdue_vaccine",
      "overdue_deworming",
      "active_medication_no_dose",
      "long_stay",
    ] as const;
    for (const r of reasons) {
      expect(actionReasonIcon(r).length).toBeGreaterThan(0);
    }
  });
});
