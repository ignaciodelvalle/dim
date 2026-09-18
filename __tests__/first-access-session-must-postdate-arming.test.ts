// setInitialPassword refuses a session authenticated before the flag was armed.
//
// The DB-backed file (admin-institutional.test.ts) cannot show this against a
// real GoTrue: an admin password write there ALREADY ends every session, so the
// "session that survived the reset" never exists locally. This file hands the
// use-case a session that did survive — flag armed, token authenticated before
// the arming — and asserts nothing was written.

import { beforeEach, describe, expect, it, vi } from "vitest";

const adminUpdate = vi.hoisted(() =>
  vi.fn(async (_userId: string, _attrs: unknown) => ({ error: null })),
);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById: adminUpdate } } }),
}));
vi.mock("@/lib/infra/role-landing", () => ({ resolveUserLanding: async () => "/gob" }));
vi.mock("@/lib/infra/report-error", () => ({ reportError: vi.fn() }));

import { tokenWithClaims } from "@/__tests__/helpers/amr-token";
import {
  FIRST_ACCESS_MESSAGES,
  setInitialPassword,
} from "@/src/modules/auth/application/first-access/set-initial-password";

const ARMED_ISO = "2026-09-18T12:00:00.000Z";
const ARMED_SECOND = 1789732800;
const PASSWORD = "Primera_Clave_2026!";

function client(amrSeconds: number | null, iatSeconds: number) {
  const claims: Record<string, unknown> = { sub: "user-001", iat: iatSeconds };
  if (amrSeconds !== null) claims.amr = [{ method: "otp", timestamp: amrSeconds }];
  const updateUser = vi.fn(async (_attrs: unknown) => ({ error: null }));
  return {
    updateUser,
    supabase: {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "user-001",
              app_metadata: { password_setup_pending: true, password_setup_armed_at: ARMED_ISO },
            },
          },
          error: null,
        }),
        getSession: async () => ({
          data: { session: { access_token: tokenWithClaims(claims) } },
          error: null,
        }),
        updateUser,
      },
    } as never,
  };
}

beforeEach(() => adminUpdate.mockClear());

describe("setInitialPassword — the session must postdate the arming", () => {
  it("refuses a session authenticated before the arming, even with a refreshed token", async () => {
    const { supabase, updateUser } = client(ARMED_SECOND - 600, ARMED_SECOND + 600);
    expect(
      await setInitialPassword(supabase, { password: PASSWORD, confirmPassword: PASSWORD }),
    ).toEqual({ error: FIRST_ACCESS_MESSAGES.no_session });
    expect(updateUser).not.toHaveBeenCalled();
    expect(adminUpdate).not.toHaveBeenCalled();
  });

  it("refuses a token without amr timestamps (fails closed)", async () => {
    const { supabase, updateUser } = client(null, ARMED_SECOND + 600);
    expect(
      await setInitialPassword(supabase, { password: PASSWORD, confirmPassword: PASSWORD }),
    ).toEqual({ error: FIRST_ACCESS_MESSAGES.no_session });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("accepts a session authenticated after the arming", async () => {
    const { supabase, updateUser } = client(ARMED_SECOND + 60, ARMED_SECOND + 60);
    expect(
      await setInitialPassword(supabase, { password: PASSWORD, confirmPassword: PASSWORD }),
    ).toEqual({ error: null, ok: true, landing: "/gob" });
    expect(updateUser).toHaveBeenCalledWith({ password: PASSWORD });
    expect(adminUpdate).toHaveBeenCalledWith("user-001", {
      app_metadata: { password_setup_pending: false },
    });
  });
});
