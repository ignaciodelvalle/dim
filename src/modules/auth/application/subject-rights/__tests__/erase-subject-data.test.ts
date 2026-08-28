// Unit tests for eraseMySubjectDataAction (Wave D2, Ley 25.326 art. 16).
//
// Finding 27-#2: erasure must delete the auth.users row after the RPC redacts
// the app-side data — otherwise the email + password hash survive forever and
// the subject can log back in to an account whose PII is already gone.
//
// Pure mock-based: no DB, no Supabase instance. We assert the ordering (RPC
// first, then deleteUser) and the failure-tolerance contract (a deleteUser
// failure logs but still completes the erasure).

import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
vi.mock("@/lib/infra/auth-guards", () => ({
  requireUserOrRedirect: () => mockRequireUser(),
}));

// Drizzle client stub. Keeps the REAL schema (so column refs are genuine and the
// role-filter regression can be asserted via serialized SQL) and swaps only the
// `db` client. `purgeOwnedPetAttachments` runs three queries in order:
//   1. select owned pets from ownerships (where captured for the role assertion)
//   2. select attachments for those pets
//   3. delete those attachment rows
const mockOwnedRows: { petId: string }[] = [];
const mockAttachmentRows: { id: string; storagePath: string; eventId: string | null }[] = [];
const mockWhere: { ownerships?: unknown; attachments?: unknown; del?: unknown } = {};
vi.mock("@/db", async () => {
  const schema = await vi.importActual<typeof import("@/db/schema")>("@/db/schema");
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: unknown) => {
          if (table === schema.ownerships) {
            mockWhere.ownerships = cond;
            return Promise.resolve(mockOwnedRows);
          }
          mockWhere.attachments = cond;
          return Promise.resolve(mockAttachmentRows);
        },
      }),
    }),
    delete: () => ({
      where: (cond: unknown) => {
        mockWhere.del = cond;
        return Promise.resolve();
      },
    }),
  };
  return { ...schema, db };
});

const mockRpc = vi.fn();
const mockSignOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { signOut: () => mockSignOut() },
  })),
}));

const mockDeleteUser = vi.fn();
const mockStorageRemove = vi.fn();
const mockStorageList = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { deleteUser: (...args: unknown[]) => mockDeleteUser(...args) } },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => mockStorageRemove(bucket, paths),
        // `list` IS MOCKED SEPARATELY FROM `remove` on purpose. The staged-upload
        // sweep pages through `list` and deletes each page; a mock that only had
        // `remove` made the sweep throw into its own best-effort catch, so the
        // whole loop was invisible to this file while every assertion still
        // passed. That is the shape of a test that proves nothing.
        list: (prefix: string, opts?: { limit?: number; offset?: number }) =>
          mockStorageList(bucket, prefix, opts),
      }),
    },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { eraseMySubjectDataAction } from "../erase-subject-data";

const USER_ID = "user-erase-0000-0000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ user: { id: USER_ID } });
  mockRpc.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockDeleteUser.mockResolvedValue({ error: null });
  // Default: the staging bucket is empty, so the sweep does one list and stops.
  mockStorageList.mockResolvedValue({ data: [], error: null });
  mockOwnedRows.length = 0;
  mockAttachmentRows.length = 0;
  mockWhere.ownerships = undefined;
  mockWhere.attachments = undefined;
  mockWhere.del = undefined;
});

describe("eraseMySubjectDataAction", () => {
  it("rejects a too-short reason without calling the RPC", async () => {
    const result = await eraseMySubjectDataAction("no");
    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes the auth.users row after the RPC succeeds (finding 27-#2)", async () => {
    const result = await eraseMySubjectDataAction("borro mi cuenta");
    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("erase_subject_data", {
      p_user_id: USER_ID,
      p_reason: "borro mi cuenta",
    });
    expect(mockDeleteUser).toHaveBeenCalledWith(USER_ID);

    // Ordering: RPC (app-side redaction) must run before the auth row is deleted.
    const rpcOrder = mockRpc.mock.invocationCallOrder[0];
    const deleteOrder = mockDeleteUser.mock.invocationCallOrder[0];
    expect(rpcOrder).toBeLessThan(deleteOrder);
    // Session dropped after both.
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("does not delete the auth row when the RPC fails", async () => {
    mockRpc.mockResolvedValue({ error: { message: "boom" } });
    const result = await eraseMySubjectDataAction("borro mi cuenta");
    expect(result.ok).toBe(false);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("still completes when auth-row deletion fails (logs, does not block)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDeleteUser.mockResolvedValue({ error: { message: "auth down" } });
    const result = await eraseMySubjectDataAction("borro mi cuenta");
    expect(result.ok).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("still completes when the admin client throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDeleteUser.mockRejectedValue(new Error("network"));
    const result = await eraseMySubjectDataAction("borro mi cuenta");
    expect(result.ok).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // Adversarial-review HIGH: the Storage purge resolved "owned pets" as
  // `ownerships WHERE owner_user_id = subject` with NO role filter. But fosters
  // and caretakers are stored under the SAME owner_user_id (role = 'foster' /
  // 'caretaker'), so the irreversible admin.storage.remove over-reached into
  // third-party pets. The fix scopes the query to role = 'owner'.
  //
  // Only Site 1 (the JS Storage/attachment purge) is observable here — the pet
  // soft-delete (Site 2) and incident_reported PII redaction (Site 3) live
  // inside the mocked SQL RPC and are guarded by migration 0131, not by JS.
  describe("owned-pet Storage purge is scoped to role = 'owner'", () => {
    const OWNED_PET_Y = "pet-owned-y-0000-0000-000000000002";

    it("purges only the subject's OWNED pet's attachments, never a fostered pet's", async () => {
      // The ownerships query returns ONLY owner-role pet Y — mirroring the
      // role = 'owner' filter the production query now applies. Fostered pet X
      // (same owner_user_id, role = 'foster') never reaches this list, so its
      // attachments are never seen by the purge.
      mockOwnedRows.push({ petId: OWNED_PET_Y });
      mockAttachmentRows.push(
        { id: "att-y-event", storagePath: "events/y-1.jpg", eventId: "evt-1" },
        { id: "att-y-photo", storagePath: "photos/y-2.jpg", eventId: null },
      );

      const result = await eraseMySubjectDataAction("borro mi cuenta");
      expect(result.ok).toBe(true);

      // Storage purge touches ONLY pet Y's objects, split by bucket shape.
      expect(mockStorageRemove).toHaveBeenCalledWith("event-attachments", ["events/y-1.jpg"]);
      expect(mockStorageRemove).toHaveBeenCalledWith("pet-photos", ["photos/y-2.jpg"]);
      expect(mockStorageRemove).toHaveBeenCalledTimes(2);

      // Regression guard: the ownerships query MUST filter by role = 'owner'.
      // Without it, fostered/caretaken pets (same owner_user_id) get purged too.
      const { sql, params } = new PgDialect().sqlToQuery(mockWhere.ownerships as never);
      expect(sql).toMatch(/"role"/);
      expect(params).toContain("owner");
    });

    it("removes nothing when the subject owns no pets (only fosters)", async () => {
      // A subject who ONLY fosters resolves to zero owner-role pets → the purge
      // early-returns before touching Storage.
      const result = await eraseMySubjectDataAction("borro mi cuenta");
      expect(result.ok).toBe(true);
      expect(mockStorageRemove).not.toHaveBeenCalled();
    });

    // ------------------------------------------------------------------
    // The staged-upload sweep. It is the ONLY thing that removes an
    // abandoned `uploads-staging` object — there is no storage GC cron in
    // this repo for any bucket — so a sweep that silently stops short is an
    // art. 16 completeness gap, not an efficiency one.
    // ------------------------------------------------------------------
    it("PAGES through uploads-staging instead of stopping at the storage-js default", async () => {
      // storage-js defaults `list` to 100 entries. The media-upload family
      // admits 120 tickets a day for one account, so >100 abandoned staged
      // objects on ONE pet is reachable inside a single day. The first version
      // of this sweep passed no options, removed an arbitrary 100, and left the
      // rest forever.
      mockOwnedRows.push({ petId: OWNED_PET_Y });

      const page = (n: number) => ({
        data: Array.from({ length: n }, (_, i) => ({ name: `obj-${i}.jpg` })),
        error: null,
      });
      // A FULL page means "ask again"; a short page means "done". Two full
      // pages then a short one — three lists, three removes.
      mockStorageList
        .mockResolvedValueOnce(page(1000))
        .mockResolvedValueOnce(page(1000))
        .mockResolvedValueOnce(page(7))
        .mockResolvedValue({ data: [], error: null });

      const result = await eraseMySubjectDataAction("borro mi cuenta");
      expect(result.ok).toBe(true);

      const listCalls = mockStorageList.mock.calls.filter((c) => c[0] === "uploads-staging");
      expect(listCalls).toHaveLength(3);

      // An explicit limit is passed — the whole point. And the OFFSET STAYS AT
      // ZERO: the previous page was just deleted, so the next unremoved object
      // is again at the start. Advancing it would step past the objects that
      // slid down into the gap and leave every other page behind.
      for (const call of listCalls) {
        expect(call[1]).toBe(OWNED_PET_Y);
        expect(call[2]).toEqual({ limit: 1000, offset: 0 });
      }

      const stagingRemoves = mockStorageRemove.mock.calls.filter((c) => c[0] === "uploads-staging");
      expect(stagingRemoves).toHaveLength(3);
      expect(stagingRemoves.map((c) => (c[1] as string[]).length)).toEqual([1000, 1000, 7]);
      // Keys are prefixed with the pet id, which is what makes a prefix sweep
      // possible at all.
      expect((stagingRemoves[0][1] as string[])[0]).toBe(`${OWNED_PET_Y}/obj-0.jpg`);
    });

    it("stops at the page cap rather than spinning a supresión forever", async () => {
      // A Storage bug that keeps answering with full pages must not hang an
      // erasure. 20 pages of 1000 is ~166 days of one account minting at its
      // full ceiling and never confirming; past that, deleting harder does not
      // help and the subject still needs their request to finish.
      mockOwnedRows.push({ petId: OWNED_PET_Y });
      mockStorageList.mockResolvedValue({
        data: Array.from({ length: 1000 }, (_, i) => ({ name: `obj-${i}.jpg` })),
        error: null,
      });

      const result = await eraseMySubjectDataAction("borro mi cuenta");
      expect(result.ok).toBe(true);
      expect(mockStorageList.mock.calls.filter((c) => c[0] === "uploads-staging")).toHaveLength(20);
    });

    it("does not let a Storage failure in the sweep stall the erasure", async () => {
      mockOwnedRows.push({ petId: OWNED_PET_Y });
      mockStorageList.mockRejectedValue(new Error("storage unreachable"));

      const result = await eraseMySubjectDataAction("borro mi cuenta");
      // Best-effort, like every other remove here: a supresión must not leave
      // the subject staring at an error after their DB data is already gone.
      expect(result.ok).toBe(true);
    });
  });
});
