// Integration tests for the role-upgrade surface (/cuenta/upgrade).
//
// Tests the pure inner writer functions directly, bypassing FormData and the
// Supabase server client — same pattern as create-pet-custody.test.ts.

import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganizationForUser, requestVetUpgradeForUser } from "@/app/actions/upgrade";
import { db, notifications, organizationMemberships, organizations, profiles } from "@/db";
import { getActiveMemberships } from "@/lib/capabilities";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const EMAIL = "role-upgrade-test@dim-test.local";
const EMAIL2 = "role-upgrade-test2@dim-test.local";
const PASS = "RoleUpgrade_2026!";

let userId: string;
let userId2: string;
let orgId: string;

async function deleteTestUser(email: string) {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === email);

  // Also find orphaned profile rows (no FK to auth.users, so they may survive
  // previous afterAll runs). Look up by display_name derived from email prefix.
  const displayName = email.split("@")[0];
  const orphanedProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.displayName, displayName));

  const idsToClean = [
    ...(found ? [found.id] : []),
    ...orphanedProfiles.map((p) => p.id).filter((id) => id !== found?.id),
  ];

  for (const uid of idsToClean) {
    // Notifications cascade from profiles on delete, but we do it explicitly
    // to be safe with the partial cascade path.
    await db.delete(notifications).where(eq(notifications.userId, uid));
    // Delete orgs where this user is admin (membership cascade will fire after,
    // but we need the org gone before the membership FK resolves).
    const adminRows = await db
      .select({ orgId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(
        and(eq(organizationMemberships.userId, uid), eq(organizationMemberships.role, "admin")),
      );
    for (const { orgId: oid } of adminRows) {
      await db.delete(organizations).where(eq(organizations.id, oid));
    }
    await db.delete(organizationMemberships).where(eq(organizationMemberships.userId, uid));
    // Profiles have no FK to auth.users — must be deleted explicitly.
    await db.delete(profiles).where(eq(profiles.id, uid));
  }

  if (found) {
    await admin.auth.admin.deleteUser(found.id);
  }
}

beforeAll(async () => {
  await deleteTestUser(EMAIL);
  await deleteTestUser(EMAIL2);

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  userId = data.user.id;

  const { data: data2, error: error2 } = await admin.auth.admin.createUser({
    email: EMAIL2,
    password: PASS,
    email_confirm: true,
  });
  if (error2 || !data2.user) throw new Error(`createUser2: ${error2?.message}`);
  userId2 = data2.user.id;
});

afterAll(async () => {
  await deleteTestUser(EMAIL);
  await deleteTestUser(EMAIL2);
});

describe("requestVetUpgradeForUser", () => {
  it("happy path: stores matricula_number, leaves role=owner, emits notification", async () => {
    const result = await requestVetUpgradeForUser(userId, {
      matriculaNumber: "MN-12345",
      jurisdiccion: "CABA",
    });
    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    expect(profile.matriculaNumber).toBe("MN-12345");
    expect(profile.matriculaJurisdiccion).toBe("CABA");
    expect(profile.matriculaVerified).toBe(false);
    // Role must NOT be changed — admin flips this after verification
    expect(profile.role).toBe("owner");

    const [notif] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.notificationType, "vet_upgrade_requested"),
        ),
      )
      .limit(1);
    expect(notif).toBeDefined();
    expect(notif.notificationType).toBe("vet_upgrade_requested");
  });

  it("idempotency: second call returns error, no second profile update", async () => {
    const result = await requestVetUpgradeForUser(userId, {
      matriculaNumber: "MN-99999",
      jurisdiccion: "CABA",
    });
    expect(result.error).toMatch(/Ya tenés una matrícula registrada/);

    // Profile still has the original matricula from the happy-path test
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    expect(profile.matriculaNumber).toBe("MN-12345");
  });
});

describe("createOrganizationForUser", () => {
  it("happy path: creates org (verified=false, status=active), membership (admin, canWritePetEvents=true), notification", async () => {
    const result = await createOrganizationForUser(userId, {
      name: "Refugio Test",
      legalName: "Asoc. Civil Test",
      orgType: "shelter",
      cuit: "30712345678",
      email: "test@refugio.test",
    });
    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.organizationId).toBeDefined();

    orgId = result.organizationId as string;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    expect(org.verified).toBe(false);
    expect(org.status).toBe("active");

    const [membership] = await db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.organizationId, orgId),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .limit(1);
    expect(membership).toBeDefined();
    expect(membership.role).toBe("admin");
    expect(membership.canWritePetEvents).toBe(true);

    const [notif] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.notificationType, "org_creation_requested"),
        ),
      )
      .limit(1);
    expect(notif).toBeDefined();
  });

  it("idempotency: second call by same user returns error, only one org exists", async () => {
    const result = await createOrganizationForUser(userId, {
      name: "Refugio Duplicado",
      legalName: "Duplicado SA",
      orgType: "clinic",
      email: "dup@refugio.test",
    });
    expect(result.error).toMatch(/Ya administrás una organización/);

    // Confirm only one org exists for this user
    const memberships = await db
      .select()
      .from(organizationMemberships)
      .where(
        and(eq(organizationMemberships.userId, userId), isNull(organizationMemberships.leftAt)),
      );
    const adminMemberships = memberships.filter((m) => m.role === "admin");
    expect(adminMemberships).toHaveLength(1);
  });

  it("cuit collision: second user with same CUIT gets a clear error", async () => {
    const result = await createOrganizationForUser(userId2, {
      name: "Otro Refugio",
      legalName: "Otro SA",
      orgType: "rescue_network",
      cuit: "30712345678", // same as userId's org
      email: "otro@refugio.test",
    });
    expect(result.error).toMatch(/Ya existe una organización con ese CUIT/);
  });

  it("getActiveMemberships sees unverified org after creation (gate is membership-based)", async () => {
    const memberships = await getActiveMemberships(userId);
    const adminMembership = memberships.find((m) => m.membership.role === "admin");
    expect(adminMembership).toBeDefined();
    // The org is unverified — the gate checks membership, not verification
    expect(adminMembership?.organization.verified).toBe(false);
  });
});
