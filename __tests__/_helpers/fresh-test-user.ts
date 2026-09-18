// Create a fixture auth user that survives the residue of a run that died.
//
// Why this exists: test files create auth users with FIXED emails
// (`br-flow-admin@dim-test.local`, ...) and clean them up in `afterAll`. A run
// that is killed or crashes mid-flight never reaches `afterAll`, so the users
// stay behind, and the next run's `createUser` answers "A user with this email
// address has already been registered" — the file reports BROKEN before a
// single assertion runs. On 2026-09-18 one dead run left ~70 of them and four
// files broke on the next gate.
//
// Most files DID try to guard against this, by looking the email up first with
// `auth.admin.listUsers()` and deleting or reusing the match. That guard is
// silently truncated: `listUsers()` without arguments returns only the FIRST
// PAGE (50 users). Once the local database holds more than 50 auth users —
// seeds plus any residue — a leftover past page one is invisible to the lookup,
// and the create that follows fails anyway.
//
// The repair is to make the create itself idempotent: try it; if GoTrue says
// the email is taken, find the stale user by paging through EVERY user, delete
// it with the same `deleteUser` call test cleanups use, and create it again.
// The return shape is exactly `createUser`'s, so call sites keep their own
// error handling unchanged.
//
// Hard guard: it refuses any email outside `@dim-test.local`, before any
// network call, so it can never delete a seeded `@dim.test` account or
// anything real.
import type { AdminUserAttributes, User, UserResponse } from "@supabase/supabase-js";

export const TEST_USER_EMAIL_SUFFIX = "@dim-test.local";

/** The slice of the admin API this helper touches — any supabase-js client fits. */
export interface AdminAuthClient {
  auth: {
    admin: {
      createUser(attributes: AdminUserAttributes): Promise<UserResponse>;
      deleteUser(id: string): Promise<UserResponse>;
      listUsers(params?: { page?: number; perPage?: number }): Promise<
        | { data: { users: User[] }; error: null }
        | { data: { users: [] }; error: { message: string } }
      >;
    };
  };
}

const PER_PAGE = 1000;
const MAX_PAGES = 50;

function assertTestEmail(email: unknown): string {
  if (typeof email !== "string" || !email.toLowerCase().endsWith(TEST_USER_EMAIL_SUFFIX)) {
    throw new Error(
      `createFreshTestUser refuses ${JSON.stringify(email)}: only ${TEST_USER_EMAIL_SUFFIX} fixture users may be removed and recreated`,
    );
  }
  return email.toLowerCase();
}

function isEmailTaken(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === "email_exists" || /already been registered/i.test(error.message ?? "");
}

async function findUserIdByEmail(client: AdminAuthClient, email: string): Promise<string | null> {
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`createFreshTestUser: listUsers page ${page}: ${error.message}`);
    const users = data.users;
    const found = users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (users.length < PER_PAGE) return null;
  }
  return null;
}

/**
 * `client.auth.admin.createUser(attributes)`, except that a leftover user with
 * the same `@dim-test.local` email is deleted and the create retried once.
 */
export async function createFreshTestUser(
  client: AdminAuthClient,
  attributes: AdminUserAttributes,
): Promise<UserResponse> {
  const email = assertTestEmail(attributes.email);

  const first = await client.auth.admin.createUser(attributes);
  if (!isEmailTaken(first.error)) return first;

  const staleId = await findUserIdByEmail(client, email);
  if (staleId) {
    const removed = await client.auth.admin.deleteUser(staleId);
    if (removed.error) {
      // Typically a foreign key from a row the dead run left behind. Surface
      // it by name rather than retrying into the same "already registered".
      throw new Error(
        `createFreshTestUser: stale ${email} (${staleId}) could not be deleted: ${removed.error.message}`,
      );
    }
  }
  return client.auth.admin.createUser(attributes);
}
