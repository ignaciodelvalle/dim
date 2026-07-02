// Integration tests for Slice 3a: user self-service profile update actions.
//
// Pattern mirrors admin-institutional.test.ts:
//   - beforeAll seeds ephemeral user via supabase admin SDK
//   - afterAll deletes them with app.allow_audit_mutation GUC
//   - Each test calls the inner *ForUser writer directly (no Next.js runtime)
//
// Strict TDD scope (server actions only):
//   - updateProfileForUser: happy path, validation rejections, unauthorized
//   - uploadAvatarForUser: happy path (storage stub), validation rejections

import { createClient } from "@supabase/supabase-js";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// updateEmergencyContactsAction (pet-document-redesign ADR-13, Phase 5) calls
// requireUserOrRedirect() — mocked here so the narrow-write test below can
// drive it directly against the real seeded actor without a Next.js request
// context. Doesn't affect the *ForUser writers above, which are called
// directly with an explicit userId (never go through this guard).
vi.mock("@/lib/infra/auth-guards", () => ({
  requireUserOrRedirect: vi.fn(),
}));

// revalidatePath needs a Next.js request/static-generation context that
// doesn't exist under vitest — mocked to a no-op, same reasoning as the
// auth-guards mock above.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  updateEmergencyContactsAction,
  updateProfileForUser,
  uploadAvatarForUser,
} from "@/app/actions/profile";
import { auditLog, db, notifications, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const adminSdk = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const ACTOR_EMAIL = "profile-slice3a-actor@dim-test.local";
let actorUserId: string;

async function deleteTestUser(email: string) {
  const { data: list } = await adminSdk.auth.admin.listUsers({ perPage: 200 });
  const found = list?.users.find((u) => u.email === email);

  const allIds = new Set<string>();
  if (found) allIds.add(found.id);

  for (const uid of allIds) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
      await tx.delete(auditLog).where(eq(auditLog.actorUserId, uid));
      await tx.delete(auditLog).where(eq(auditLog.targetUserId, uid));
    });
    await db.delete(notifications).where(eq(notifications.userId, uid));
    await db.delete(profiles).where(eq(profiles.id, uid));
  }

  if (found) await adminSdk.auth.admin.deleteUser(found.id);
}

async function createUserOrThrow(email: string): Promise<string> {
  const r = await adminSdk.auth.admin.createUser({
    email,
    password: "ProfileSlice3a_2026!",
    email_confirm: true,
  });
  if (r.error || !r.data.user) throw new Error(`createUser(${email}): ${r.error?.message}`);
  return r.data.user.id;
}

beforeAll(async () => {
  await deleteTestUser(ACTOR_EMAIL);
  actorUserId = await createUserOrThrow(ACTOR_EMAIL);
  // trigger auto-creates profile with role='owner', displayName from email prefix
  await db
    .update(profiles)
    .set({ displayName: "Prop Test User", phone: null })
    .where(eq(profiles.id, actorUserId));
});

afterAll(async () => {
  await deleteTestUser(ACTOR_EMAIL);
});

// ============================================================================
// updateProfileForUser — happy path
// ============================================================================

describe("updateProfileForUser — happy path", () => {
  it("updates displayName and phone, writes audit_log with before-values", async () => {
    // Capture before state
    const [before] = await db
      .select({ displayName: profiles.displayName, phone: profiles.phone })
      .from(profiles)
      .where(eq(profiles.id, actorUserId))
      .limit(1);

    const result = await updateProfileForUser(actorUserId, {
      displayName: "Ignacio Test",
      phone: "+54 9 11 1234-5678",
    });

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;

    expect(result.ok).toBe(true);

    // Profile updated
    const [after] = await db
      .select({ displayName: profiles.displayName, phone: profiles.phone })
      .from(profiles)
      .where(eq(profiles.id, actorUserId))
      .limit(1);

    expect(after.displayName).toBe("Ignacio Test");
    expect(after.phone).toBe("+54 9 11 1234-5678");

    // Audit log written
    const [logRow] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.actorUserId, actorUserId), eq(auditLog.action, "profile_self_updated")),
      )
      .orderBy(desc(auditLog.performedAt))
      .limit(1);

    expect(logRow).toBeDefined();
    expect(logRow.action).toBe("profile_self_updated");
    const payload = logRow.payload as Record<string, unknown>;
    expect(payload.changed_fields).toContain("displayName");
    expect((payload.before_values as Record<string, unknown>).displayName).toBe(before.displayName);
  });

  it("updates displayName only (no phone provided), phone preserved", async () => {
    await db
      .update(profiles)
      .set({ displayName: "Before Name", phone: "+54 9 11 9999-0000" })
      .where(eq(profiles.id, actorUserId));

    const result = await updateProfileForUser(actorUserId, {
      displayName: "After Name",
      phone: undefined,
    });

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;

    const [row] = await db
      .select({ displayName: profiles.displayName, phone: profiles.phone })
      .from(profiles)
      .where(eq(profiles.id, actorUserId))
      .limit(1);

    expect(row.displayName).toBe("After Name");
    // phone not in input → not changed
    expect(row.phone).toBe("+54 9 11 9999-0000");
  });

  it("clears phone when empty string provided", async () => {
    await db
      .update(profiles)
      .set({ phone: "+54 9 11 1111-2222" })
      .where(eq(profiles.id, actorUserId));

    const result = await updateProfileForUser(actorUserId, {
      displayName: "Name Clear Phone",
      phone: "",
    });

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;

    const [row] = await db
      .select({ phone: profiles.phone })
      .from(profiles)
      .where(eq(profiles.id, actorUserId))
      .limit(1);

    expect(row.phone).toBeNull();
  });
});

// ============================================================================
// updateProfileForUser — validation rejections
// ============================================================================

describe("updateProfileForUser — validation rejections", () => {
  it("rejects displayName shorter than 2 chars", async () => {
    const result = await updateProfileForUser(actorUserId, { displayName: "A" });
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/VALIDATION_ERROR/);
  });

  it("rejects displayName longer than 80 chars", async () => {
    const result = await updateProfileForUser(actorUserId, {
      displayName: "A".repeat(81),
    });
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/VALIDATION_ERROR/);
  });

  it("rejects missing displayName", async () => {
    const result = await updateProfileForUser(actorUserId, {
      displayName: "",
    });
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/VALIDATION_ERROR/);
  });

  it("accepts any non-empty phone format (AR validation is now a client-side soft warning)", async () => {
    // Phone format is no longer rejected server-side. The client surfaces a
    // soft warning via `lib/ar-phone.ts` for non-AR-looking values, but the
    // value saves regardless.
    const result = await updateProfileForUser(actorUserId, {
      displayName: "Valid Name",
      phone: "123-abc-xyz",
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts empty string phone (clears the value)", async () => {
    const result = await updateProfileForUser(actorUserId, {
      displayName: "Valid Name",
      phone: "",
    });
    expect(result).not.toHaveProperty("error");
  });
});

// ============================================================================
// updateEmergencyContactsAction — narrow write (pet-document-redesign
// ADR-13, Phase 5). Scoped to the 4 vet/emergency fields; must never touch
// displayName even though it reuses updateProfileForUser under the hood.
// ============================================================================

describe("updateEmergencyContactsAction — scoped write", () => {
  it("updates only the 4 emergency fields, displayName untouched", async () => {
    vi.mocked(requireUserOrRedirect).mockResolvedValue({
      user: { id: actorUserId },
    } as never);

    await db
      .update(profiles)
      .set({
        displayName: "Untouched Display Name",
        preferredVetName: null,
        preferredVetPhone: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
      })
      .where(eq(profiles.id, actorUserId));

    const result = await updateEmergencyContactsAction("pet-token-does-not-matter", {
      preferredVetName: "Dra. Pérez",
      preferredVetPhone: "+54 9 11 1111-1111",
      emergencyContactName: "Lucía F.",
      emergencyContactPhone: "+54 9 11 2222-2222",
    });

    expect(result).not.toHaveProperty("error");

    const [row] = await db
      .select({
        displayName: profiles.displayName,
        preferredVetName: profiles.preferredVetName,
        preferredVetPhone: profiles.preferredVetPhone,
        emergencyContactName: profiles.emergencyContactName,
        emergencyContactPhone: profiles.emergencyContactPhone,
      })
      .from(profiles)
      .where(eq(profiles.id, actorUserId))
      .limit(1);

    // Scoped: displayName is passed through unchanged, never overwritten.
    expect(row.displayName).toBe("Untouched Display Name");
    expect(row.preferredVetName).toBe("Dra. Pérez");
    expect(row.preferredVetPhone).toBe("+54 9 11 1111-1111");
    expect(row.emergencyContactName).toBe("Lucía F.");
    expect(row.emergencyContactPhone).toBe("+54 9 11 2222-2222");
  });

  it("returns NOT_FOUND for a user with no profile row", async () => {
    vi.mocked(requireUserOrRedirect).mockResolvedValue({
      user: { id: "00000000-0000-0000-0000-000000000099" },
    } as never);

    const result = await updateEmergencyContactsAction("pet-token-does-not-matter", {
      preferredVetName: "Should not save",
    });

    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/NOT_FOUND/);
  });
});

// ============================================================================
// updateProfileForUser — unauthorized
// ============================================================================

describe("updateProfileForUser — unauthorized", () => {
  it("rejects when userId does not exist in profiles", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000099";
    const result = await updateProfileForUser(fakeId, {
      displayName: "Hacker",
    });
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/NOT_FOUND/);
  });
});

// ============================================================================
// uploadAvatarForUser — validation rejections (no real storage needed)
// ============================================================================

describe("uploadAvatarForUser — validation: wrong mime type", () => {
  it("rejects non-image mime types", async () => {
    const fakeFile = new Blob(["<svg/>"], { type: "image/svg+xml" });
    const result = await uploadAvatarForUser(actorUserId, {
      fileBlob: fakeFile,
      fileName: "test.svg",
      mimeType: "image/svg+xml",
      fileSize: fakeFile.size,
    });
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/VALIDATION_ERROR/);
  });

  it("rejects files larger than 2MB", async () => {
    const largeBlob = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: "image/jpeg" });
    const result = await uploadAvatarForUser(actorUserId, {
      fileBlob: largeBlob,
      fileName: "big.jpg",
      mimeType: "image/jpeg",
      fileSize: largeBlob.size,
    });
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/VALIDATION_ERROR/);
  });
});

describe("uploadAvatarForUser — happy path (stub storage)", () => {
  it("updates avatarUrl and writes audit_log when storage succeeds", async () => {
    // Reset profile
    await db.update(profiles).set({ avatarUrl: null }).where(eq(profiles.id, actorUserId));

    // Provide a valid small JPEG blob (minimal valid JPEG header bytes)
    const minimalJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const smallFile = new Blob([minimalJpeg], { type: "image/jpeg" });

    const result = await uploadAvatarForUser(actorUserId, {
      fileBlob: smallFile,
      fileName: "avatar.jpg",
      mimeType: "image/jpeg",
      fileSize: smallFile.size,
      _storageStub: async () => ({
        storagePath: `avatars/${actorUserId}/avatar.jpg`,
        publicUrl: `https://example.com/storage/avatars/${actorUserId}/avatar.jpg`,
      }),
    });

    // Should succeed
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;

    expect(result.ok).toBe(true);
    expect(result.avatarUrl).toContain("avatar.jpg");

    // Profile avatarUrl updated
    const [row] = await db
      .select({ avatarUrl: profiles.avatarUrl })
      .from(profiles)
      .where(eq(profiles.id, actorUserId))
      .limit(1);

    expect(row.avatarUrl).toBeTruthy();

    // Audit log written
    const [logRow] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.actorUserId, actorUserId), eq(auditLog.action, "profile_avatar_updated")),
      )
      .orderBy(desc(auditLog.performedAt))
      .limit(1);

    expect(logRow).toBeDefined();
    expect(logRow.action).toBe("profile_avatar_updated");
  });

  it("returns error and logs profile_avatar_upload_failed when storage stub throws", async () => {
    const minimalJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const smallFile = new Blob([minimalJpeg], { type: "image/png" });

    const result = await uploadAvatarForUser(actorUserId, {
      fileBlob: smallFile,
      fileName: "avatar.png",
      mimeType: "image/png",
      fileSize: smallFile.size,
      _storageStub: async () => {
        throw new Error("BUCKET_NOT_FOUND");
      },
    });

    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/STORAGE_FAILED/);

    // profile_avatar_upload_failed logged
    const [logRow] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorUserId, actorUserId),
          eq(auditLog.action, "profile_avatar_upload_failed"),
        ),
      )
      .orderBy(desc(auditLog.performedAt))
      .limit(1);

    expect(logRow).toBeDefined();
  });
});
