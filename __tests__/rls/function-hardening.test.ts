// Function-hardening fitness test (Supabase security advisor — 2026-06-24).
// =========================================================================
//
// Sibling of coverage.test.ts (RLS). Two structural guarantees the advisor
// checks, made into a red CI run instead of a silent drift:
//
//  1. function_search_path_mutable — every project-owned function the advisor
//     flagged MUST ship with a pinned `search_path` (proconfig). A SECURITY
//     DEFINER function with a mutable search_path is a privilege-escalation
//     vector. Migration 0114 (and db/triggers.sql for the trigger function)
//     set `search_path = ''`. This test fails if a future redefinition drops it.
//
//  2. Subject-rights RPCs (export_subject_data / erase_subject_data) MUST NOT be
//     EXECUTE-able by `anon`. They self-guard on auth.uid(), but anon should not
//     even hold the grant (defense in depth). Supabase's init grants EXECUTE to
//     anon directly, so a plain `REVOKE ... FROM PUBLIC` does NOT remove it —
//     migration 0114 does `REVOKE EXECUTE ... FROM anon`. This is the tripwire.
//
// Like coverage.test.ts, the lists are EXPLICIT (not derived) so adding/removing
// a hardened function is a deliberate, reviewable act. Extension-owned functions
// (pg_trgm, unaccent, …) are intentionally out of scope — they are not ours.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

// Project functions the advisor flagged function_search_path_mutable. Each is
// pinned to `search_path = ''` (all object refs in their bodies are schema-
// qualified, so empty is safe). Keyed by proname; overloads are disambiguated
// in the assertion message via the identity args returned from the catalog.
const SEARCH_PATH_PINNED: ReadonlyArray<string> = [
  "can_read_case",
  "cases_set_updated_at",
  "check_pet_event_case_id_immutable",
  "enforce_audit_log_append_only",
  "enforce_institutional_no_pets",
  "enforce_pet_events_append_only",
];

// SECURITY DEFINER functions that must not be anon-executable.
//
// Two families, one rule. The subject-rights RPCs (0114) self-guard on
// auth.uid() and are here as defense in depth. The ORACLES do not self-guard at
// all: they run as their BYPASSRLS owner and return a boolean about a row the
// caller demonstrably cannot read, so the EXECUTE grant is the ONLY thing
// between anon and a free probing oracle. 0123 closed the two case oracles;
// has_titular_write_access (0190) reopened the same class — a POST to
// /rest/v1/rpc/has_titular_write_access with only the publishable key answered
// "does this user own this pet?" with HTTP 200 while the same anonymous session
// counted 0 rows in `ownerships`. Closed by 0199; all three are pinned here so
// that work stays done.
const NO_ANON_EXECUTE: ReadonlyArray<string> = [
  "export_subject_data",
  "erase_subject_data",
  "can_read_case",
  "is_hidden_from_subject_case",
  "has_titular_write_access",
];

type ProcConfigRow = { proname: string; args: string; has_search_path: boolean };
type ProcAclRow = { proname: string; args: string; anon_can_execute: boolean };

describe("function hardening (Supabase advisor fitness)", () => {
  it("every flagged function pins search_path (function_search_path_mutable)", async () => {
    const rows = (await db.execute(sql`
      select p.proname as proname,
             pg_get_function_identity_arguments(p.oid) as args,
             exists (
               select 1
               from unnest(coalesce(p.proconfig, array[]::text[])) c
               where c like 'search_path=%'
             ) as has_search_path
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (${sql.join(
          SEARCH_PATH_PINNED.map((p) => sql`${p}`),
          sql`, `,
        )})
    `)) as unknown as ProcConfigRow[];

    // Each expected function must be present at least once.
    const present = new Set(rows.map((r) => r.proname));
    const missing = SEARCH_PATH_PINNED.filter((p) => !present.has(p));
    expect(
      missing,
      `Flagged functions absent from public schema (migration did not run or name changed): ${missing.join(", ")}`,
    ).toEqual([]);

    // Every overload of every expected function must have a pinned search_path.
    const mutable = rows.filter((r) => !r.has_search_path).map((r) => `${r.proname}(${r.args})`);
    expect(
      mutable,
      `Functions WITHOUT a pinned search_path (function_search_path_mutable). Add SET search_path = '' in a migration (see 0114): ${mutable.join(", ")}`,
    ).toEqual([]);
  });

  it("SECURITY DEFINER oracles and subject-rights RPCs are not executable by anon", async () => {
    const rows = (await db.execute(sql`
      select p.proname as proname,
             pg_get_function_identity_arguments(p.oid) as args,
             -- has_function_privilege resolves the WHOLE chain: a null acl
             -- (default EXECUTE to PUBLIC), an explicit anon grant, and a grant
             -- anon merely INHERITS through PUBLIC. The old aclexplode form saw
             -- only the middle one — an aclexplode row for PUBLIC carries
             -- grantee 0, never 'anon'::regrole — so a PUBLIC-only grant read
             -- as closed. 0190 shipped both, which is why revoking one alone
             -- would have been another "applied but not closed".
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (${sql.join(
          NO_ANON_EXECUTE.map((p) => sql`${p}`),
          sql`, `,
        )})
    `)) as unknown as ProcAclRow[];

    const present = new Set(rows.map((r) => r.proname));
    const missing = NO_ANON_EXECUTE.filter((p) => !present.has(p));
    expect(
      missing,
      `SECURITY DEFINER functions absent from public schema: ${missing.join(", ")}`,
    ).toEqual([]);

    const anonExecutable = rows
      .filter((r) => r.anon_can_execute)
      .map((r) => `${r.proname}(${r.args})`);
    expect(
      anonExecutable,
      `SECURITY DEFINER functions EXECUTE-able by anon (oracle / data-rights exposure). REVOKE EXECUTE ... FROM PUBLIC, anon in a migration (see 0123 / 0199): ${anonExecutable.join(", ")}`,
    ).toEqual([]);
  });
});
