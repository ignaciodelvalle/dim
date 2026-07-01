// Integration tests for resolveVetLanding (lib/role-landing.ts).
//
// Post Phase B, a vet's landing path is resolved by org membership:
//   - admin/coordinator membership → /org/[firstOrgToken]
//   - any other membership only   → /cuenta/memberships
//   - no memberships              → /cuenta
//
// These tests also verify the mis-mascotas redirect is no longer /pro.

import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, organizationMemberships, organizations, profiles } from "@/db";
import { generatePublicToken } from "@/lib/infra/publicToken";
import { resolveVetLanding } from "@/lib/infra/role-landing";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const VET_NO_ORG_EMAIL = "vet-landing-no-org@dim-test.local";
const VET_ADMIN_EMAIL = "vet-landing-admin@dim-test.local";
const VET_MEMBER_EMAIL = "vet-landing-member@dim-test.local";
const PASS = "VetLanding_2026!";

let vetNoOrgId: string;
let vetAdminId: string;
let vetMemberId: string;
let clinicOrgToken: string;

async function purgeByEmail(email: string) {
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
    await withMutationOverride(async (tx) => {
      await tx.delete(profiles).where(eq(profiles.id, uid));
    });
  }
  if (found) await supabase.auth.admin.deleteUser(found.id);
}

beforeAll(async () => {
  await purgeByEmail(VET_NO_ORG_EMAIL);
  await purgeByEmail(VET_ADMIN_EMAIL);
  await purgeByEmail(VET_MEMBER_EMAIL);

  const createUser = async (email: string) => {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: PASS,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    return data.user.id;
  };

  vetNoOrgId = await createUser(VET_NO_ORG_EMAIL);
  vetAdminId = await createUser(VET_ADMIN_EMAIL);
  vetMemberId = await createUser(VET_MEMBER_EMAIL);

  await db
    .update(profiles)
    .set({ role: "vet", matriculaVerified: true })
    .where(eq(profiles.id, vetNoOrgId));
  await db
    .update(profiles)
    .set({ role: "vet", matriculaVerified: true })
    .where(eq(profiles.id, vetAdminId));
  await db
    .update(profiles)
    .set({ role: "vet", matriculaVerified: true })
    .where(eq(profiles.id, vetMemberId));

  clinicOrgToken = generatePublicToken();
  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: clinicOrgToken,
      legalName: "Vet Landing Test Clinic",
      displayName: "Vet Landing Test Clinic",
      orgType: "clinic",
      email: "vet-landing@dim-test.local",
      verified: true,
    })
    .returning({ id: organizations.id });

  await db.insert(organizationMemberships).values({
    organizationId: org.id,
    userId: vetAdminId,
    role: "admin",
    canWritePetEvents: true,
  });

  await db.insert(organizationMemberships).values({
    organizationId: org.id,
    userId: vetMemberId,
    role: "vet_individual",
    canWritePetEvents: true,
  });
});

afterAll(async () => {
  await purgeByEmail(VET_NO_ORG_EMAIL);
  await purgeByEmail(VET_ADMIN_EMAIL);
  await purgeByEmail(VET_MEMBER_EMAIL);

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.publicToken, clinicOrgToken))
    .limit(1);
  if (org) {
    await db.delete(organizations).where(eq(organizations.id, org.id));
  }
});

describe("resolveVetLanding", () => {
  it("vet with no org memberships → /cuenta", async () => {
    const path = await resolveVetLanding(vetNoOrgId);
    expect(path).toBe("/cuenta");
  });

  it("vet with admin membership → /org/[token]", async () => {
    const path = await resolveVetLanding(vetAdminId);
    expect(path).toBe(`/org/${clinicOrgToken}`);
  });

  it("vet with vet_individual membership only → /cuenta/memberships", async () => {
    const path = await resolveVetLanding(vetMemberId);
    expect(path).toBe("/cuenta/memberships");
  });

  it("vet landing does not resolve to /pro", async () => {
    const noOrgPath = await resolveVetLanding(vetNoOrgId);
    const adminPath = await resolveVetLanding(vetAdminId);
    const memberPath = await resolveVetLanding(vetMemberId);
    expect(noOrgPath).not.toContain("/pro");
    expect(adminPath).not.toContain("/pro");
    expect(memberPath).not.toContain("/pro");
  });
});
