// Integration tests for the vet clinic creation flow (Sprint 1A Phase C).
// Covers the action powering /cuenta/crear-consultorio via createClinicAction.
//
// Provisions a vet via the admin SDK (matriculaVerified=true, no memberships),
// calls createOrganizationForUser directly (the same function the
// createClinicAction wrapper delegates to), and asserts the expected DB state.

import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db, organizationMemberships, organizations, profiles } from "@/db";
import { createOrganizationForUser } from "../app/actions/upgrade";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const VET_EMAIL = "create-clinic-test@dim-test.local";
const PASS = "CreateClinic_2026!";

let vetUserId: string;

async function purgeVet() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const found = list?.users.find((u) => u.email === VET_EMAIL);
  if (!found) return;

  const autoOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.createdByUserId, found.id));

  for (const o of autoOrgs) {
    await db
      .delete(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, o.id));
    await db.delete(organizations).where(eq(organizations.id, o.id));
  }

  await withMutationOverride(async (tx) => {
    await tx.delete(profiles).where(eq(profiles.id, found.id));
  });
  await admin.auth.admin.deleteUser(found.id);
}

async function provisionVet(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: VET_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  vetUserId = data.user.id;

  await db
    .update(profiles)
    .set({
      role: "vet",
      matriculaNumber: "MN-CLINIC-001",
      matriculaJurisdiccion: "Buenos Aires",
      matriculaVerified: true,
      displayName: "Dr. Clinic Test",
      dniVerified: true,
    })
    .where(eq(profiles.id, vetUserId));

  return vetUserId;
}

beforeEach(async () => {
  await purgeVet();
  await provisionVet();
});

afterEach(async () => {
  await purgeVet();
});

describe("create-clinic-wizard — happy path", () => {
  it("creates a clinic org with role=admin and canWritePetEvents=true for the vet", async () => {
    const result = await createOrganizationForUser(vetUserId, {
      name: "Consultorio Dr. Clinic Test",
      legalName: "Consultorio Dr. Clinic Test",
      orgType: "clinic",
      email: VET_EMAIL,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    });

    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.organizationId).toBeDefined();

    const orgId = result.organizationId!;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org).toBeDefined();
    expect(org.orgType).toBe("clinic");
    expect(org.displayName).toBe("Consultorio Dr. Clinic Test");
    expect(org.createdByUserId).toBe(vetUserId);
    expect(org.publicToken).toBeTruthy();

    const [membership] = await db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, orgId),
          eq(organizationMemberships.userId, vetUserId),
          isNull(organizationMemberships.leftAt),
        ),
      );
    expect(membership).toBeDefined();
    expect(membership.role).toBe("admin");
    expect(membership.canWritePetEvents).toBe(true);
  });

  it("rejects creation for a vet who already administers an org", async () => {
    // First creation succeeds.
    const first = await createOrganizationForUser(vetUserId, {
      name: "Consultorio Primero",
      legalName: "Consultorio Primero",
      orgType: "clinic",
      email: VET_EMAIL,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    });
    expect(first.ok).toBe(true);

    // Second creation is blocked by the alreadyAdmin guard.
    const second = await createOrganizationForUser(vetUserId, {
      name: "Consultorio Segundo",
      legalName: "Consultorio Segundo",
      orgType: "clinic",
      email: VET_EMAIL,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    });
    expect(second.error).toBeTruthy();
    expect(second.ok).toBeUndefined();
  });
});

describe("create-clinic-wizard — orgType enforcement", () => {
  it("createOrganizationForUser with orgType=clinic produces org_type=clinic in the DB", async () => {
    const result = await createOrganizationForUser(vetUserId, {
      name: "Solo Clinic",
      legalName: "Solo Clinic",
      orgType: "clinic",
      email: VET_EMAIL,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "Mar del Plata",
    });
    expect(result.error).toBeNull();

    const [org] = await db
      .select({ orgType: organizations.orgType })
      .from(organizations)
      .where(eq(organizations.id, result.organizationId!));
    expect(org.orgType).toBe("clinic");
  });
});
