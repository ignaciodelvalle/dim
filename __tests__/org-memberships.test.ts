// Integration tests for org-memberships server actions.
//
// Covers:
//  - removeMemberAction: rank rule (coordinator can't remove admin; can remove lower ranks)
//  - removeMemberAction: last-admin protection (can't remove the last admin)
//  - removeMemberAction: CAN remove an admin when another admin exists
//  - removeMemberAction: self-removal rejected (use leave path)
//  - changeMemberRoleAction: rank rule (coordinator can't demote admin)
//  - changeMemberRoleAction: last-admin protection (can't demote last admin)
//  - changeMemberRoleAction: can promote/demote when another admin exists
//  - changeMemberRoleAction: can't promote above own rank
//  - changeMemberRoleAction: foster rejected as settable role
//  - changeMemberRoleAction: self role-change rejected
//  - setMemberEventWriteAction: rank rule; toggles canWritePetEvents
//  - leaveOrganizationAction: allowed when not last admin
//  - leaveOrganizationAction: blocked when last admin
//
// Runs against the local Supabase + Postgres stack (127.0.0.1:54321/54322).

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  changeMemberRoleAction,
  leaveOrganizationAction,
  removeMemberAction,
  setMemberEventWriteAction,
} from "@/app/actions/org-memberships";
import { db, notifications, organizationMemberships, organizations, profiles } from "@/db";
import { createClient } from "@/lib/supabase/server";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const PASS = "OrgMgmt_2026!";
const ADMIN_EMAIL = "org-mgmt-admin@dim-test.local";
const ADMIN2_EMAIL = "org-mgmt-admin2@dim-test.local";
const COORD_EMAIL = "org-mgmt-coord@dim-test.local";
const MEMBER_EMAIL = "org-mgmt-member@dim-test.local";

let adminUserId: string;
let admin2UserId: string;
let coordUserId: string;
let memberUserId: string;
let orgId: string;
let orgPublicToken: string;

// Membership IDs — set after beforeAll.
let adminMembershipId: string;
let admin2MembershipId: string;
let coordMembershipId: string;
let memberMembershipId: string;

function mockSessionAs(userId: string) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: { id: userId } as unknown },
        error: null,
      }),
    },
  } as never);
}

function mockNoSession() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: null,
      }),
    },
  } as never);
}

async function deleteUserByEmail(email: string) {
  const { data } = await supabaseAdmin.auth.admin.listUsers();
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
    await db.delete(notifications).where(eq(notifications.userId, uid));
    await db.delete(organizationMemberships).where(eq(organizationMemberships.userId, uid));
    await db.delete(profiles).where(eq(profiles.id, uid));
  }
  if (found) await supabaseAdmin.auth.admin.deleteUser(found.id);
}

async function createUserOrThrow(email: string): Promise<string> {
  const r = await supabaseAdmin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
  });
  if (r.error || !r.data.user) throw new Error(`createUser(${email}): ${r.error?.message}`);
  return r.data.user.id;
}

async function reactivateMembership(membershipId: string): Promise<void> {
  await db
    .update(organizationMemberships)
    .set({ leftAt: null, role: "member" })
    .where(eq(organizationMemberships.id, membershipId));
}

beforeAll(async () => {
  for (const email of [ADMIN_EMAIL, ADMIN2_EMAIL, COORD_EMAIL, MEMBER_EMAIL]) {
    await deleteUserByEmail(email);
  }

  // Clean up stale org.
  const staleOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.publicToken, "ORG-MGMT-TEST"));
  for (const { id } of staleOrgs) {
    await db.delete(organizationMemberships).where(eq(organizationMemberships.organizationId, id));
    await db.delete(organizations).where(eq(organizations.id, id));
  }

  // Create users.
  adminUserId = await createUserOrThrow(ADMIN_EMAIL);
  admin2UserId = await createUserOrThrow(ADMIN2_EMAIL);
  coordUserId = await createUserOrThrow(COORD_EMAIL);
  memberUserId = await createUserOrThrow(MEMBER_EMAIL);

  for (const [uid, email] of [
    [adminUserId, ADMIN_EMAIL],
    [admin2UserId, ADMIN2_EMAIL],
    [coordUserId, COORD_EMAIL],
    [memberUserId, MEMBER_EMAIL],
  ] as [string, string][]) {
    await db
      .update(profiles)
      .set({ displayName: email.split("@")[0], role: "owner", accountType: "personal" })
      .where(eq(profiles.id, uid));
  }

  // Create org.
  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: "ORG-MGMT-TEST",
      legalName: "Mgmt Test Org SRL",
      displayName: "Mgmt Test Org",
      orgType: "shelter",
      email: "mgmt-test-org@dim-test.local",
      verified: true,
    })
    .returning();
  orgId = org.id;
  orgPublicToken = org.publicToken;

  // Admin membership.
  const [am] = await db
    .insert(organizationMemberships)
    .values({ organizationId: orgId, userId: adminUserId, role: "admin", canWritePetEvents: true })
    .returning();
  adminMembershipId = am.id;

  // Second admin membership.
  const [am2] = await db
    .insert(organizationMemberships)
    .values({ organizationId: orgId, userId: admin2UserId, role: "admin", canWritePetEvents: true })
    .returning();
  admin2MembershipId = am2.id;

  // Coordinator membership.
  const [cm] = await db
    .insert(organizationMemberships)
    .values({
      organizationId: orgId,
      userId: coordUserId,
      role: "coordinator",
      canWritePetEvents: false,
    })
    .returning();
  coordMembershipId = cm.id;

  // Member membership.
  const [mm] = await db
    .insert(organizationMemberships)
    .values({
      organizationId: orgId,
      userId: memberUserId,
      role: "member",
      canWritePetEvents: false,
    })
    .returning();
  memberMembershipId = mm.id;
});

afterAll(async () => {
  await db.delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  for (const email of [ADMIN_EMAIL, ADMIN2_EMAIL, COORD_EMAIL, MEMBER_EMAIL]) {
    await deleteUserByEmail(email);
  }
});

// ---------------------------------------------------------------------------
// removeMemberAction
// ---------------------------------------------------------------------------

describe("removeMemberAction", () => {
  it("admin removes a lower-rank member: ok, sets leftAt", async () => {
    // Ensure member is active.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "member" })
      .where(eq(organizationMemberships.id, memberMembershipId));

    mockSessionAs(adminUserId);
    const result = await removeMemberAction({
      organizationId: orgId,
      membershipId: memberMembershipId,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);
    expect(result.ok).toBe(true);

    // Verify soft-delete.
    const [row] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, memberMembershipId))
      .limit(1);
    expect(row.leftAt).not.toBeNull();

    // Restore for subsequent tests.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "member" })
      .where(eq(organizationMemberships.id, memberMembershipId));
  });

  it("coordinator (rank=4): cannot remove admin (rank=5) — rank rule", async () => {
    mockSessionAs(coordUserId);
    const result = await removeMemberAction({
      organizationId: orgId,
      membershipId: adminMembershipId,
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("mayor al tuyo");
  });

  it("coordinator can remove a member (rank=3 ≤ rank=4)", async () => {
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "member" })
      .where(eq(organizationMemberships.id, memberMembershipId));

    mockSessionAs(coordUserId);
    const result = await removeMemberAction({
      organizationId: orgId,
      membershipId: memberMembershipId,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);
    expect(result.ok).toBe(true);

    // Restore.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "member" })
      .where(eq(organizationMemberships.id, memberMembershipId));
  });

  it("last-admin protection: cannot remove the last admin", async () => {
    // Soft-delete admin2 so adminUserId is the only admin.
    await db
      .update(organizationMemberships)
      .set({ leftAt: new Date() })
      .where(eq(organizationMemberships.id, admin2MembershipId));

    mockSessionAs(adminUserId);
    const result = await removeMemberAction({
      organizationId: orgId,
      membershipId: adminMembershipId,
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("al menos un administrador");

    // Restore admin2.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null })
      .where(eq(organizationMemberships.id, admin2MembershipId));
  });

  it("CAN remove an admin when another admin exists", async () => {
    // Both admins are active. Admin removes admin2.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "admin" })
      .where(eq(organizationMemberships.id, admin2MembershipId));

    mockSessionAs(adminUserId);
    const result = await removeMemberAction({
      organizationId: orgId,
      membershipId: admin2MembershipId,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);
    expect(result.ok).toBe(true);

    // Restore admin2.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "admin" })
      .where(eq(organizationMemberships.id, admin2MembershipId));
  });

  it("self-removal rejected via admin path", async () => {
    mockSessionAs(adminUserId);
    const result = await removeMemberAction({
      organizationId: orgId,
      membershipId: adminMembershipId,
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("vos mismo");
  });
});

// ---------------------------------------------------------------------------
// changeMemberRoleAction
// ---------------------------------------------------------------------------

describe("changeMemberRoleAction", () => {
  it("admin changes member's role to volunteer: ok", async () => {
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "member" })
      .where(eq(organizationMemberships.id, memberMembershipId));

    mockSessionAs(adminUserId);
    const result = await changeMemberRoleAction({
      organizationId: orgId,
      membershipId: memberMembershipId,
      newRole: "volunteer",
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);

    const [row] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, memberMembershipId))
      .limit(1);
    expect(row.role).toBe("volunteer");

    // Restore.
    await db
      .update(organizationMemberships)
      .set({ role: "member" })
      .where(eq(organizationMemberships.id, memberMembershipId));
  });

  it("coordinator (rank=4): cannot demote admin (rank=5) — rank rule", async () => {
    mockSessionAs(coordUserId);
    const result = await changeMemberRoleAction({
      organizationId: orgId,
      membershipId: adminMembershipId,
      newRole: "member",
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("mayor al tuyo");
  });

  it("last-admin protection: cannot demote the last admin", async () => {
    // Make adminUserId the only admin.
    await db
      .update(organizationMemberships)
      .set({ leftAt: new Date() })
      .where(eq(organizationMemberships.id, admin2MembershipId));

    mockSessionAs(adminUserId);
    const result = await changeMemberRoleAction({
      organizationId: orgId,
      membershipId: adminMembershipId,
      newRole: "coordinator",
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("al menos un administrador");

    // Restore.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "admin" })
      .where(eq(organizationMemberships.id, admin2MembershipId));
  });

  it("CAN demote an admin when another admin exists", async () => {
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "admin" })
      .where(eq(organizationMemberships.id, admin2MembershipId));

    mockSessionAs(adminUserId);
    const result = await changeMemberRoleAction({
      organizationId: orgId,
      membershipId: admin2MembershipId,
      newRole: "coordinator",
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);

    // Restore.
    await db
      .update(organizationMemberships)
      .set({ role: "admin" })
      .where(eq(organizationMemberships.id, admin2MembershipId));
  });

  it("cannot promote above own rank: coordinator can't assign admin", async () => {
    mockSessionAs(coordUserId);
    const result = await changeMemberRoleAction({
      organizationId: orgId,
      membershipId: memberMembershipId,
      newRole: "admin",
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("mayor al tuyo");
  });

  it("foster rejected as a settable role", async () => {
    mockSessionAs(adminUserId);
    const result = await changeMemberRoleAction({
      organizationId: orgId,
      membershipId: memberMembershipId,
      newRole: "foster",
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("inválido");
  });

  it("self role-change rejected", async () => {
    mockSessionAs(adminUserId);
    const result = await changeMemberRoleAction({
      organizationId: orgId,
      membershipId: adminMembershipId,
      newRole: "coordinator",
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("propio rol");
  });
});

// ---------------------------------------------------------------------------
// setMemberEventWriteAction
// ---------------------------------------------------------------------------

describe("setMemberEventWriteAction", () => {
  it("admin toggles canWritePetEvents on member: ok", async () => {
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, canWritePetEvents: false })
      .where(eq(organizationMemberships.id, memberMembershipId));

    mockSessionAs(adminUserId);
    const result = await setMemberEventWriteAction({
      organizationId: orgId,
      membershipId: memberMembershipId,
      canWrite: true,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);

    const [row] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, memberMembershipId))
      .limit(1);
    expect(row.canWritePetEvents).toBe(true);

    // Toggle back.
    await db
      .update(organizationMemberships)
      .set({ canWritePetEvents: false })
      .where(eq(organizationMemberships.id, memberMembershipId));
  });

  it("coordinator: cannot toggle canWritePetEvents on admin — rank rule", async () => {
    mockSessionAs(coordUserId);
    const result = await setMemberEventWriteAction({
      organizationId: orgId,
      membershipId: adminMembershipId,
      canWrite: false,
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("mayor al tuyo");
  });

  it("coordinator CAN toggle canWritePetEvents on member", async () => {
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, canWritePetEvents: false })
      .where(eq(organizationMemberships.id, memberMembershipId));

    mockSessionAs(coordUserId);
    const result = await setMemberEventWriteAction({
      organizationId: orgId,
      membershipId: memberMembershipId,
      canWrite: true,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);

    const [row] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, memberMembershipId))
      .limit(1);
    expect(row.canWritePetEvents).toBe(true);

    // Restore.
    await db
      .update(organizationMemberships)
      .set({ canWritePetEvents: false })
      .where(eq(organizationMemberships.id, memberMembershipId));
  });
});

// ---------------------------------------------------------------------------
// leaveOrganizationAction
// ---------------------------------------------------------------------------

describe("leaveOrganizationAction", () => {
  it("member can leave the organization", async () => {
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "member" })
      .where(eq(organizationMemberships.id, memberMembershipId));

    mockSessionAs(memberUserId);
    const result = await leaveOrganizationAction({ organizationId: orgId });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);
    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, memberMembershipId))
      .limit(1);
    expect(row.leftAt).not.toBeNull();

    // Restore.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "member" })
      .where(eq(organizationMemberships.id, memberMembershipId));
  });

  it("last-admin blocked from leaving", async () => {
    // Make adminUserId the only active admin.
    await db
      .update(organizationMemberships)
      .set({ leftAt: new Date() })
      .where(eq(organizationMemberships.id, admin2MembershipId));

    mockSessionAs(adminUserId);
    const result = await leaveOrganizationAction({ organizationId: orgId });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("único administrador");

    // Restore.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "admin" })
      .where(eq(organizationMemberships.id, admin2MembershipId));
  });

  it("admin CAN leave when another admin exists", async () => {
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "admin" })
      .where(eq(organizationMemberships.id, admin2MembershipId));

    mockSessionAs(adminUserId);
    const result = await leaveOrganizationAction({ organizationId: orgId });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);
    expect(result.ok).toBe(true);

    // Restore.
    await db
      .update(organizationMemberships)
      .set({ leftAt: null, role: "admin" })
      .where(eq(organizationMemberships.id, adminMembershipId));
  });

  it("no session: returns error", async () => {
    mockNoSession();
    const result = await leaveOrganizationAction({ organizationId: orgId });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("Sesión");
  });

  it("non-member: returns error", async () => {
    // Use a user that has no membership in this org.
    // admin2 is currently active; we'll test with a user not in the org.
    // Create a temp user that has no membership.
    const { data } = await supabaseAdmin.auth.admin.createUser({
      email: "no-member-leave@dim-test.local",
      password: PASS,
      email_confirm: true,
    });
    const tempUserId = data.user!.id;

    mockSessionAs(tempUserId);
    const result = await leaveOrganizationAction({ organizationId: orgId });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("miembro activo");

    // Cleanup temp user.
    await supabaseAdmin.auth.admin.deleteUser(tempUserId);
    await db.delete(profiles).where(eq(profiles.id, tempUserId));
  });
});
