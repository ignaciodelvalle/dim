// Offline guard for the storage WRITE-policy tripwire (B24).
//
// Two halves, and the second is the one that matters:
//
//   1. Against the REAL repo — the inventory is non-empty, finds exactly the two
//      known blanket grants, and passes. A tripwire that has stopped seeing its
//      own subject reports the same "clean" as one with nothing to report.
//   2. RED CONTROLS, on synthetic SQL — a new bucket-name-only write grant, a
//      widened frozen grant, an `all` policy, a `to public` policy with no roles
//      clause. Each of these is a way the pattern could spread, and each must be
//      demonstrated to fail rather than assumed to.
//
// The parser gets its own tests too, because it is the whole fence: these
// policies are written across many lines, one carries a nested `EXISTS (SELECT
// …)`, and a naive line regex would silently under-report — which is the exact
// false pass the tripwire exists to prevent.

import { globSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FROZEN_WRITE_GRANTS,
  MIN_WRITE_POLICIES,
  SQL_GLOBS,
  callerFacingWrites,
  createPolicyStatements,
  evaluate,
  inventory,
  isPermissive,
  normalize,
  parsePolicy,
  stripSqlComments,
} from "@/scripts/check-storage-write-policies";

// ---------------------------------------------------------------------------
// Against the real repo
// ---------------------------------------------------------------------------

const REAL_FILES = [...new Set(SQL_GLOBS.flatMap((g) => globSync(g)))]
  .map((f) => f.replaceAll("\\", "/"))
  .sort();
const { policies: REAL, unparseable: REAL_UNPARSEABLE } = inventory(REAL_FILES);

describe("the real repo", () => {
  it("scans SQL files at all", () => {
    expect(REAL_FILES.length).toBeGreaterThan(50);
  });

  it("finds enough caller-facing write policies to clear the non-vacuity floor", () => {
    expect(callerFacingWrites(REAL).length).toBeGreaterThanOrEqual(MIN_WRITE_POLICIES);
  });

  // THE FLOOR THAT MATTERS. If the parser stops seeing these two, the fence
  // reports "clean" while measuring nothing — and the two grants it is supposed
  // to be freezing are precisely the ones it would stop watching.
  it("finds the two known blanket grants, and only those two", () => {
    const permissive = callerFacingWrites(REAL)
      .filter(isPermissive)
      .map((p) => p.name);
    expect(permissive.sort()).toEqual(
      ["event_attachments_authenticated_upload", "pet_photos_authenticated_upload"].sort(),
    );
  });

  it("reads every storage.objects policy it finds — none is unparseable", () => {
    // Not decoration. Until 2026-08-25 an unreadable statement was DROPPED, so
    // this count could only ever have been zero and would have told you nothing.
    // Now it is the fence's own coverage: anything here is a policy nobody is
    // checking.
    expect(REAL_UNPARSEABLE).toEqual([]);
  });

  it("passes today", () => {
    const verdict = evaluate(REAL, REAL_UNPARSEABLE);
    expect(verdict.unfrozen).toEqual([]);
    expect(verdict.changed).toEqual([]);
    expect(verdict.missing).toEqual([]);
    expect(verdict.unparseable).toEqual([]);
  });

  it("does not confuse a scoped write for a blanket one", () => {
    const scoped = callerFacingWrites(REAL).filter((p) => !isPermissive(p));
    // pet-photos + event-attachments update/delete, the avatars three, and the
    // revocations upload (declared twice — file and migration).
    expect(scoped.length).toBeGreaterThanOrEqual(7);
    expect(scoped.map((p) => p.name)).toContain("revocations_admin_govt_upload");
  });

  it("keeps every frozen grant carrying a reason and a way out", () => {
    for (const [name, grant] of Object.entries(FROZEN_WRITE_GRANTS)) {
      expect(grant.predicate, name).not.toBe("");
      expect(grant.reason, name).toContain("B24");
      // An allowlist entry with no stated exit is a permanent exemption wearing
      // a temporary label.
      expect(grant.reason, name).toContain("signed upload");
    }
  });
});

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

describe("stripSqlComments", () => {
  it("removes a line comment", () => {
    expect(stripSqlComments("select 1; -- and then some")).toBe("select 1; ");
  });

  it("does NOT cut inside a string literal", () => {
    expect(stripSqlComments("where name = 'a--b'")).toBe("where name = 'a--b'");
  });
});

describe("createPolicyStatements", () => {
  it("captures a statement written across many lines", () => {
    const sql = [
      'create policy "p"',
      "  on storage.objects for insert",
      "  to authenticated",
      "  with check (bucket_id = 'x');",
      "select 1;",
    ].join("\n");
    const statements = createPolicyStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("bucket_id = 'x'");
    expect(statements[0]).not.toContain("select 1");
  });

  // The shape that breaks a naive parser: migration 0188's revocations upload.
  it("does not stop at a nested subquery's parentheses", () => {
    const sql = [
      'CREATE POLICY "revocations_admin_govt_upload"',
      "  ON storage.objects FOR INSERT TO authenticated",
      "  WITH CHECK (",
      "    bucket_id = 'revocations'",
      "    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()))",
      "  );",
    ].join("\n");
    const result = parsePolicy("x.sql", createPolicyStatements(sql)[0] ?? "");
    expect(result.kind).toBe("policy");
    if (result.kind !== "policy") throw new Error("unreachable");
    expect(result.policy.predicate).toContain("auth.uid()");
    expect(isPermissive(result.policy)).toBe(false);
  });
});

describe("parsePolicy", () => {
  /** The parsed policy, or a failure naming what came back instead. */
  function parse(sql: string) {
    const result = parsePolicy("test.sql", createPolicyStatements(sql)[0] ?? "");
    if (result.kind !== "policy") throw new Error(`expected a policy, got "${result.kind}"`);
    return result.policy;
  }

  it("ignores a policy on a table that is not storage.objects", () => {
    const result = parsePolicy(
      "test.sql",
      createPolicyStatements(`create policy "p" on public.pets for insert to authenticated;`)[0] ??
        "",
    );
    // "skip", NOT "unparseable": this really is none of the fence's business.
    expect(result.kind).toBe("skip");
  });

  it("reads name, command and roles", () => {
    const policy = parse(
      `create policy "p" on storage.objects for update to anon, authenticated using (bucket_id = 'x');`,
    );
    expect(policy.name).toBe("p");
    expect(policy.command).toBe("update");
    expect(policy.roles).toEqual(["anon", "authenticated"]);
  });

  // ==========================================================================
  // THE TWO FORMS THAT USED TO FAIL OPEN (fixed 2026-08-25)
  // ==========================================================================
  // Both are valid Postgres and both appear in this repo's own SQL. Each made
  // parsePolicy return null, after which `inventory` dropped the statement and
  // the fence printed green over a policy it had never read.

  it("reads an UNQUOTED policy name — the style db/cases_rls.sql uses", () => {
    const policy = parse(
      `create policy pet_photos_blanket on storage.objects for insert to authenticated with check (bucket_id = 'pet-photos');`,
    );
    expect(policy.name).toBe("pet_photos_blanket");
    expect(policy.command).toBe("insert");
  });

  it("reads an unquoted name behind `if not exists`", () => {
    const policy = parse(
      `create policy if not exists p_bare on storage.objects for insert to authenticated with check (bucket_id = 'x');`,
    );
    expect(policy.name).toBe("p_bare");
  });

  // The single most dangerous form was the one form guaranteed to pass.
  it("treats an OMITTED `for` clause as `all`, per the SQL default", () => {
    const policy = parse(
      `create policy "p" on storage.objects to authenticated using (bucket_id = 'x');`,
    );
    expect(policy.command).toBe("all");
    // `all` is a WRITE command, so this must reach the offender path.
    expect(callerFacingWrites([policy])).toHaveLength(1);
    expect(isPermissive(policy)).toBe(true);
  });

  it("reports an unreadable storage.objects statement as an OFFENDER, not a skip", () => {
    // A `create policy` on storage.objects whose name this parser cannot read.
    const result = parsePolicy("test.sql", "create policy 42invalid on storage.objects for insert");
    expect(result.kind).toBe("unparseable");
  });

  // SQL's default when `to` is omitted is PUBLIC. Failing closed is the only
  // safe direction: a policy with no roles clause is the MOST exposed, not the
  // least, and skipping it would be the fence's worst possible mistake.
  it("treats a missing `to` clause as PUBLIC", () => {
    const policy = parse(`create policy "p" on storage.objects for insert with check (true);`);
    expect(policy.roles).toEqual(["public"]);
    expect(callerFacingWrites([policy])).toHaveLength(1);
  });

  // The worst legal statement available: bare name, no FOR (so ALL), no TO (so
  // PUBLIC), predicate that names nobody. Before the fix, all three of those
  // gaps pointed the same way and the statement was invisible.
  it("catches the maximally-exposed form: bare name, no FOR, no TO", () => {
    const policy = parse(`create policy wide_open on storage.objects using (bucket_id = 'x');`);
    expect(policy.name).toBe("wide_open");
    expect(policy.command).toBe("all");
    expect(policy.roles).toEqual(["public"]);
    expect(isPermissive(policy)).toBe(true);
    expect(evaluate([policy]).unfrozen.map((p) => p.name)).toEqual(["wide_open"]);
  });

  it("joins a using and a with-check predicate", () => {
    const policy = parse(
      `create policy "p" on storage.objects for update to authenticated using (bucket_id = 'x') with check (auth.uid() = owner);`,
    );
    expect(policy.predicate).toBe("bucket_id = 'x' and auth.uid() = owner");
    expect(isPermissive(policy)).toBe(false);
  });
});

describe("isPermissive", () => {
  function policy(predicate: string) {
    return {
      file: "t.sql",
      name: "p",
      command: "insert",
      roles: ["authenticated"],
      predicate: normalize(predicate),
    };
  }

  it("calls a bucket-name-only predicate permissive", () => {
    expect(isPermissive(policy("bucket_id = 'x'"))).toBe(true);
  });

  it("accepts auth.uid() nested in a subquery — the 0137 convention", () => {
    expect(
      isPermissive(
        policy("bucket_id = 'x' and exists (select 1 from p where p.id = (select auth.uid()))"),
      ),
    ).toBe(false);
  });

  it("calls an empty predicate permissive", () => {
    expect(isPermissive(policy(""))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RED CONTROLS — every way the pattern could spread
// ---------------------------------------------------------------------------

describe("red controls", () => {
  function verdictFor(sql: string) {
    const statements = createPolicyStatements(stripSqlComments(sql));
    const policies = [];
    const unparseable = [];
    for (const statement of statements) {
      const result = parsePolicy("planted.sql", statement);
      if (result.kind === "policy") policies.push(result.policy);
      // Carried, not dropped — otherwise a red control could "pass" by being
      // unreadable, which is the exact failure this file now guards.
      else if (result.kind === "unparseable") {
        unparseable.push({ file: "planted.sql", statement: normalize(statement) });
      }
    }
    return evaluate(policies, unparseable);
  }

  /** The two frozen grants, spelled exactly as db/storage.sql spells them. */
  const FROZEN_SQL = [
    `create policy "pet_photos_authenticated_upload"`,
    "  on storage.objects for insert",
    "  to authenticated",
    "  with check (bucket_id = 'pet-photos');",
    `create policy "event_attachments_authenticated_upload"`,
    "  on storage.objects for insert",
    "  to authenticated",
    "  with check (bucket_id = 'event-attachments');",
  ].join("\n");

  it("is GREEN on the two frozen grants alone — the non-vacuity of the reds below", () => {
    const verdict = verdictFor(FROZEN_SQL);
    expect(verdict.unfrozen).toEqual([]);
    expect(verdict.changed).toEqual([]);
    expect(verdict.missing).toEqual([]);
  });

  it("RED: a NEW bucket-name-only INSERT grant", () => {
    const verdict = verdictFor(
      `${FROZEN_SQL}\ncreate policy "new_blanket" on storage.objects for insert to authenticated with check (bucket_id = 'new-bucket');`,
    );
    expect(verdict.unfrozen.map((p) => p.name)).toEqual(["new_blanket"]);
  });

  it("RED: a NEW bucket-name-only DELETE grant", () => {
    const verdict = verdictFor(
      `${FROZEN_SQL}\ncreate policy "blanket_delete" on storage.objects for delete to authenticated using (bucket_id = 'pet-photos');`,
    );
    expect(verdict.unfrozen.map((p) => p.name)).toEqual(["blanket_delete"]);
  });

  // `for all` is the widest of the four and the easiest to write by accident.
  it("RED: a `for all` policy with no caller in its predicate", () => {
    const verdict = verdictFor(
      `${FROZEN_SQL}\ncreate policy "blanket_all" on storage.objects for all to authenticated using (bucket_id = 'pet-photos');`,
    );
    expect(verdict.unfrozen.map((p) => p.name)).toEqual(["blanket_all"]);
  });

  it("RED: a grant to anon", () => {
    const verdict = verdictFor(
      `${FROZEN_SQL}\ncreate policy "anon_upload" on storage.objects for insert to anon with check (bucket_id = 'pet-photos');`,
    );
    expect(verdict.unfrozen.map((p) => p.name)).toEqual(["anon_upload"]);
  });

  // THE PLANTED WIDENING. This is the case the tripwire is named for: not a new
  // policy, an existing one quietly given more.
  it("RED: an existing frozen grant WIDENED to a second bucket", () => {
    const widened = FROZEN_SQL.replace(
      "with check (bucket_id = 'pet-photos');",
      "with check (bucket_id in ('pet-photos', 'event-attachments'));",
    );
    const verdict = verdictFor(widened);
    expect(verdict.changed).toHaveLength(1);
    expect(verdict.changed[0]?.policy.name).toBe("pet_photos_authenticated_upload");
    expect(verdict.changed[0]?.expected).toBe("bucket_id = 'pet-photos'");
  });

  it("RED: a frozen grant widened to `true`", () => {
    const widened = FROZEN_SQL.replace("bucket_id = 'pet-photos'", "true");
    expect(verdictFor(widened).changed).toHaveLength(1);
  });

  // An allowlist that names something the scan cannot see is either stale (good
  // news, uncelebrated) or broken (bad news, unnoticed). Both are loud.
  it("RED: a frozen grant that has disappeared from the SQL", () => {
    const onlyOne = FROZEN_SQL.split("create policy")
      .filter((chunk) => !chunk.includes("pet_photos_authenticated_upload"))
      .join("create policy");
    expect(verdictFor(onlyOne).missing).toEqual(["pet_photos_authenticated_upload"]);
  });

  it("GREEN: a new write grant that DOES name the caller", () => {
    const verdict = verdictFor(
      `${FROZEN_SQL}\ncreate policy "scoped_upload" on storage.objects for insert to authenticated with check (bucket_id = 'new-bucket' and auth.uid() = owner);`,
    );
    expect(verdict.unfrozen).toEqual([]);
  });

  // SELECT stays check-rls-coverage's business. A tripwire that also policed
  // reads would be a second, weaker copy of a fence that already runs against a
  // live database.
  it("GREEN: a permissive SELECT policy — not this fence's subject", () => {
    const verdict = verdictFor(
      `${FROZEN_SQL}\ncreate policy "blanket_read" on storage.objects for select to authenticated using (bucket_id = 'pet-photos');`,
    );
    expect(verdict.unfrozen).toEqual([]);
  });

  it("GREEN: a service-role-only write grant", () => {
    const verdict = verdictFor(
      `${FROZEN_SQL}\ncreate policy "svc" on storage.objects for insert to service_role with check (bucket_id = 'x');`,
    );
    expect(verdict.unfrozen).toEqual([]);
  });
});
