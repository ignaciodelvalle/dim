// app/actions/notifications.ts — the three notification marks must be gated by
// the ONE liveness guard, not by a file-local `requireUser()` (RN re-run HIGH,
// 2026-08-22).
//
// WHAT WAS WRONG. The shim defined its own `async function requireUser()` —
// a bare `supabase.auth.getUser()` with no erasure, deactivation or
// maintenance check — and fed it to three writes. Worse, the local carried a
// name on scripts/check-authz-guards.ts's recognised-guard list, so the fence
// counted every export as guarded by a guard that guarded nothing. The fence's
// side of that story is in __tests__/check-authz-guards.test.ts (the shadowing
// rule); this file proves the ACTIONS refuse.
//
// Mocks the same two modules requireLiveUser reads (@/lib/supabase/server and
// @/lib/infra/request-cache) so the real guard runs over a fake session, and
// stubs the use-cases so the test can assert they were NOT reached.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetProfileCached = vi.fn();
vi.mock("@/lib/infra/request-cache", () => ({
  getProfileCached: (...args: unknown[]) => mockGetProfileCached(...args),
}));

const useCases = vi.hoisted(() => ({
  markNotificationRead: vi.fn(async () => {}),
  archiveNotification: vi.fn(async () => {}),
  markAllNotificationsRead: vi.fn(async () => {}),
}));
vi.mock("@/src/modules/notifications/application/notification-actions", () => useCases);

import { liveUserMessage } from "@/lib/infra/live-user";

import {
  archiveNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";

const ORIGINAL_MAINTENANCE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE;

function session(id = "user-notif") {
  return { data: { user: { id, email: `${id}@dim-test.local` } }, error: null };
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-notif",
    role: "owner",
    displayName: "Ana",
    accountType: "personal",
    deactivatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_MAINTENANCE_MODE = undefined;
  mockGetUser.mockResolvedValue(session());
  mockGetProfileCached.mockResolvedValue(profile());
});

afterEach(() => {
  process.env.NEXT_PUBLIC_MAINTENANCE_MODE = ORIGINAL_MAINTENANCE;
});

function expectNoUseCaseReached() {
  expect(useCases.markNotificationRead).not.toHaveBeenCalled();
  expect(useCases.archiveNotification).not.toHaveBeenCalled();
  expect(useCases.markAllNotificationsRead).not.toHaveBeenCalled();
}

describe("notification marks refuse a non-live caller", () => {
  it("an ERASED account cannot mark a notification read — THE RED CONTROL", async () => {
    mockGetProfileCached.mockResolvedValue(profile({ deletedAt: new Date("2026-08-01") }));

    await expect(markNotificationReadAction("n-1")).rejects.toThrow(
      liveUserMessage("ACCOUNT_ERASED"),
    );
    expectNoUseCaseReached();
  });

  it("an erased account cannot archive, nor mark all read", async () => {
    mockGetProfileCached.mockResolvedValue(profile({ deletedAt: new Date("2026-08-01") }));

    await expect(archiveNotificationAction("n-1")).rejects.toThrow(
      liveUserMessage("ACCOUNT_ERASED"),
    );
    await expect(markAllNotificationsReadAction()).rejects.toThrow(
      liveUserMessage("ACCOUNT_ERASED"),
    );
    expectNoUseCaseReached();
  });

  it("refuses during maintenance before resolving a session", async () => {
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE = "1";

    await expect(markNotificationReadAction("n-1")).rejects.toThrow(liveUserMessage("MAINTENANCE"));
    expect(mockGetUser).not.toHaveBeenCalled();
    expectNoUseCaseReached();
  });

  it("refuses with no session, same wording the shim always used", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(markAllNotificationsReadAction()).rejects.toThrow(liveUserMessage("NO_SESSION"));
    expectNoUseCaseReached();
  });

  it("refuses a DEACTIVATED institutional account — these are writes", async () => {
    // The policy (lib/infra/auth-guards.ts:60-70): reads stay open so the
    // account can see why; writes stop. Marking read / archiving is an UPDATE
    // on notifications, and reading /notificaciones does not need it.
    mockGetProfileCached.mockResolvedValue(
      profile({ accountType: "institutional", deactivatedAt: new Date("2026-08-01") }),
    );

    await expect(archiveNotificationAction("n-1")).rejects.toThrow(liveUserMessage("DEACTIVATED"));
    expectNoUseCaseReached();
  });

  it("reaches the use-case with the caller's id when the caller is live (non-vacuity)", async () => {
    await markNotificationReadAction("n-1");
    await archiveNotificationAction("n-2");
    await markAllNotificationsReadAction();

    expect(useCases.markNotificationRead).toHaveBeenCalledWith("user-notif", "n-1");
    expect(useCases.archiveNotification).toHaveBeenCalledWith("user-notif", "n-2");
    expect(useCases.markAllNotificationsRead).toHaveBeenCalledWith("user-notif");
  });
});
