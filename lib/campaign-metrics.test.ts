// Tests for campaign-metrics.ts — pure projection logic and integration seeds.
//
// Tests cover:
//  1. computeDelta — pure arithmetic (no DB)
//  2. formatDelta  — null-safety and shape
//  3. fetchCampaignDashboard — integration over test seed (bookings + attendance)
//
// Integration tests run against the local Postgres instance that has bootstrapped
// schema. They seed data and clean up in afterAll to avoid pollution.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appointments, db, organizations, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { buildProjectionContext } from "@/lib/metrics";
import { computeDelta, fetchCampaignDashboard, formatDelta } from "./campaign-metrics";

// ---------------------------------------------------------------------------
// Pure unit tests — no DB
// ---------------------------------------------------------------------------

describe("computeDelta", () => {
  it("returns null when previous is 0 (division undefined)", () => {
    expect(computeDelta(10, 0)).toBeNull();
  });

  it("returns 0 when current equals previous", () => {
    expect(computeDelta(50, 50)).toBe(0);
  });

  it("returns positive delta when current > previous", () => {
    expect(computeDelta(110, 100)).toBe(10);
  });

  it("returns negative delta when current < previous", () => {
    expect(computeDelta(80, 100)).toBe(-20);
  });

  it("rounds to the nearest integer", () => {
    expect(computeDelta(115, 100)).toBe(15);
    // 33.33... → rounds to 33
    expect(computeDelta(133, 100)).toBe(33);
  });
});

describe("formatDelta", () => {
  it("returns null when previous is 0", () => {
    expect(formatDelta(10, 0, "vs período anterior")).toBeNull();
  });

  it("returns { value, period } with correct numeric delta", () => {
    const result = formatDelta(120, 100, "vs mes anterior");
    expect(result).toEqual({ value: 20, period: "vs mes anterior" });
  });

  it("negative delta is preserved", () => {
    const result = formatDelta(80, 100, "vs período anterior");
    expect(result).toEqual({ value: -20, period: "vs período anterior" });
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require local Postgres + bootstrapped schema
// ---------------------------------------------------------------------------

const TEST_PROVINCE = "Buenos Aires";
const TEST_LOCALITY = "test-locality-campaigns-int";
const ORG_TOKEN = `ORG-CAM-TST-${Date.now()}`;
const PET_TOKEN = `PET-CAM-TST-${Date.now()}`;

let orgId: string;
let ownerId: string;
let petId: string;
let offeringId: string;
let slotId: string;
const createdAppointmentIds: string[] = [];

beforeAll(async () => {
  // Insert test org (requires legalName + email).
  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: ORG_TOKEN,
      legalName: "Campañas Test Org SRL",
      displayName: "Test Org Campañas",
      orgType: "clinic",
      email: "campaigns-test@dim-test.local",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
    })
    .returning({ id: organizations.id });
  orgId = org.id;

  // Insert test profile (profiles table uses Supabase auth UUID — we supply our own).
  const profileId = crypto.randomUUID();
  await db.insert(profiles).values({
    id: profileId,
    displayName: "Test Owner Campañas",
    role: "owner",
  });
  ownerId = profileId;

  // Insert test pet (no ownerUserId on pets — ownership is in ownerships table).
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "TestDog",
      species: "dog",
      status: "active",
      potentiallyDangerousBreed: false,
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
    })
    .returning({ id: pets.id });
  petId = pet.id;

  // Insert approved service offering.
  const [offering] = await db
    .insert(serviceOfferings)
    .values({
      publicToken: `SVO-CAM-TST-${Date.now()}`,
      organizationId: orgId,
      serviceKind: "vaccination",
      displayName: "Vacunación antirrábica test",
      durationMinutes: 15,
      slotCapacity: 5,
      status: "approved",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
      submittedAt: new Date(),
    })
    .returning({ id: serviceOfferings.id });
  offeringId = offering.id;

  // Insert a time slot.
  const slotStart = new Date();
  slotStart.setHours(10, 0, 0, 0);
  const slotEnd = new Date(slotStart.getTime() + 15 * 60_000);
  const [slot] = await db
    .insert(timeSlots)
    .values({
      serviceOfferingId: offeringId,
      startsAt: slotStart,
      endsAt: slotEnd,
      capacity: 5,
      bookingsCount: 0,
      status: "open",
    })
    .returning({ id: timeSlots.id });
  slotId = slot.id;
});

afterAll(async () => {
  // Clean up in FK order.
  if (createdAppointmentIds.length > 0) {
    for (const id of createdAppointmentIds) {
      await db.delete(appointments).where(eq(appointments.id, id));
    }
  }
  if (offeringId) {
    // Deleting offering cascades to timeSlots.
    await db.delete(serviceOfferings).where(eq(serviceOfferings.id, offeringId));
  }
  if (petId) {
    await db.delete(pets).where(eq(pets.id, petId));
  }
  if (ownerId) {
    await db.delete(profiles).where(eq(profiles.id, ownerId));
  }
  if (orgId) {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
});

describe("fetchCampaignDashboard — integration", () => {
  it("returns empty dashboard when jurisdiction has no offerings", async () => {
    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: "Neuquén", locality: "no-offerings-here-campaign" }],
      { since: new Date(Date.now() - 30 * 86400_000), until: new Date() },
    );
    const result = await fetchCampaignDashboard(ctx);
    expect(result.offerings).toHaveLength(0);
    expect(result.totals.enrollment).toBe(0);
    expect(result.totals.completion).toBe(0);
    expect(result.totals.noShow).toBe(0);
    expect(result.totals.completionRate).toBeNull();
    expect(result.geoReach).toHaveLength(0);
  });

  it("counts enrollment as confirmed + attended + no_show (not cancelled)", async () => {
    // Seed: 2 attended + 1 no_show + 1 confirmed = 4 enrollment.
    const newAppts = await db
      .insert(appointments)
      .values([
        {
          publicToken: `APT-A1-${Date.now()}`,
          slotId,
          petId,
          ownerUserId: ownerId,
          serviceOfferingId: offeringId,
          organizationId: orgId,
          status: "attended",
          attendedAt: new Date(),
          attendedByUserId: ownerId,
        },
        {
          publicToken: `APT-A2-${Date.now()}-2`,
          slotId,
          petId,
          ownerUserId: ownerId,
          serviceOfferingId: offeringId,
          organizationId: orgId,
          status: "attended",
          attendedAt: new Date(),
          attendedByUserId: ownerId,
        },
        {
          publicToken: `APT-NS-${Date.now()}-3`,
          slotId,
          petId,
          ownerUserId: ownerId,
          serviceOfferingId: offeringId,
          organizationId: orgId,
          status: "no_show",
          noShowMarkedAt: new Date(),
        },
        {
          publicToken: `APT-CF-${Date.now()}-4`,
          slotId,
          petId,
          ownerUserId: ownerId,
          serviceOfferingId: offeringId,
          organizationId: orgId,
          status: "confirmed",
        },
      ])
      .returning({ id: appointments.id });
    createdAppointmentIds.push(...newAppts.map((r) => r.id));

    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: TEST_PROVINCE, locality: TEST_LOCALITY }],
      { since: new Date(Date.now() - 7 * 86400_000), until: new Date(Date.now() + 86400_000) },
    );

    const result = await fetchCampaignDashboard(ctx);

    // At least the 4 appointments we seeded above.
    expect(result.totals.enrollment).toBeGreaterThanOrEqual(4);
    expect(result.totals.completion).toBeGreaterThanOrEqual(2);
    expect(result.totals.noShow).toBeGreaterThanOrEqual(1);
  });

  it("admin context (global scope) sees the seeded offering", async () => {
    const ctx = buildProjectionContext({ role: "admin" }, [], {
      since: new Date(Date.now() - 7 * 86400_000),
      until: new Date(Date.now() + 86400_000),
    });
    const result = await fetchCampaignDashboard(ctx);
    const found = result.offerings.find((o) => o.offeringId === offeringId);
    expect(found).toBeDefined();
    expect(found?.displayName).toBe("Vacunación antirrábica test");
  });

  it("completionRate and noShowRate are null when enrollment is 0 in period", async () => {
    // Use a time window far in the future — no appointments seeded there.
    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: TEST_PROVINCE, locality: TEST_LOCALITY }],
      {
        since: new Date(Date.now() + 10 * 365 * 86400_000),
        until: new Date(Date.now() + 11 * 365 * 86400_000),
      },
    );
    const result = await fetchCampaignDashboard(ctx);
    // The offering exists in this jurisdiction but has no appointments in the future window.
    const found = result.offerings.find((o) => o.offeringId === offeringId);
    expect(found).toBeDefined();
    expect(found?.enrollment).toBe(0);
    expect(found?.completionRate).toBeNull();
    expect(found?.noShowRate).toBeNull();
  });

  it("enrollmentSparkline returns an array of exactly 6 numbers", async () => {
    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: TEST_PROVINCE, locality: TEST_LOCALITY }],
      { since: new Date(Date.now() - 30 * 86400_000), until: new Date() },
    );
    const result = await fetchCampaignDashboard(ctx);
    expect(result.enrollmentSparkline).toHaveLength(6);
    for (const n of result.enrollmentSparkline) {
      expect(typeof n).toBe("number");
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });

  it("geoReach includes the test locality when attended appointments exist", async () => {
    // Ensure at least one attended appointment in the test locality.
    const [appt] = await db
      .insert(appointments)
      .values({
        publicToken: `APT-GEO-${Date.now()}`,
        slotId,
        petId,
        ownerUserId: ownerId,
        serviceOfferingId: offeringId,
        organizationId: orgId,
        status: "attended",
        attendedAt: new Date(),
        attendedByUserId: ownerId,
      })
      .returning({ id: appointments.id });
    createdAppointmentIds.push(appt.id);

    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: TEST_PROVINCE, locality: TEST_LOCALITY }],
      { since: new Date(Date.now() - 7 * 86400_000), until: new Date(Date.now() + 86400_000) },
    );

    const result = await fetchCampaignDashboard(ctx);
    const geo = result.geoReach.find((g) => g.locality === TEST_LOCALITY);
    expect(geo).toBeDefined();
    expect(geo?.attendedCount).toBeGreaterThanOrEqual(1);
  });
});
