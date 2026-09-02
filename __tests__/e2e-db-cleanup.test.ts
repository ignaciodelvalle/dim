// Pins e2e/demo/_db-cleanup.ts's target decision — the "LOCAL ONLY" guard that
// decides whether an e2e run may delete rows.
//
// THE DEFECT THIS TEST EXISTS TO PREVENT. The guard used to default an unset
// DATABASE_URL to `postgresql://…@localhost:54322/postgres`, so
// `isLocalDatabase()` answered YES on a machine with no database at all. The
// nightly (.github/workflows/e2e-nightly.yml) drives the deployed staging
// origin and sets no DATABASE_URL: every run since 2026-08-26 tried to connect
// to a Postgres that does not exist on the runner (AggregateError, 24 failures
// a night), and e2e/degraded-states.spec.ts — which skips itself on
// `!isLocalDatabase()` so it never registers a pet only a direct-to-Postgres
// helper could remove — believed it was local and ran against staging.
//
// It lives here, not in e2e/, for the reason _seed-profile's twin states:
// logic inside a Playwright spec is logic nobody can unit-test, and this one
// runs in vitest so the next regression is seconds away, not one nightly.
// DB-less by construction: every assertion goes through the pure decision or
// through an entry point that returns BEFORE opening a connection.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deletePetsByNamePrefix,
  deleteTagsByLotePrefix,
  isLocalDatabase,
  resolveCleanupTarget,
} from "@/e2e/demo/_db-cleanup";

const LOCAL_URL = "postgresql://postgres:postgres@localhost:54322/postgres";
const LOOPBACK_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const REMOTE_URL = "postgresql://postgres:hunter2@db.example.supabase.co:5432/postgres";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// FIRST, and deliberately so: the "no target declared" line is announced once
// per worker process (loginAs resets the login rate limits before every real
// sign-in, and one line per login would bury the report). A later test cannot
// observe the first announcement.
describe("an undeclared target refuses to delete, and says so once", () => {
  it("returns 0 without connecting, and prints exactly one line for the process", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Two different entry points, three calls: still one line. Each returns
    // from the target check, before `postgres(url)` is ever constructed, so
    // nothing here depends on a database being up or down.
    expect(await deletePetsByNamePrefix("E2EPet-")).toBe(0);
    expect(await deleteTagsByLotePrefix("TEST-LOTE-")).toBe(0);
    expect(await deletePetsByNamePrefix("ProbeAlta-")).toBe(0);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("DATABASE_URL is not set");
    // The line must be actionable: it names how a local run opts back in.
    expect(line).toContain("supabase status");
  });
});

describe("resolveCleanupTarget", () => {
  it("calls an unset DATABASE_URL undeclared — never localhost", () => {
    // THE REGRESSION PIN. The old code returned the local default here, which
    // is what sent the nightly at a database that does not exist.
    expect(resolveCleanupTarget({})).toEqual({ kind: "undeclared" });
    // Whitespace is not a declaration either.
    expect(resolveCleanupTarget({ DATABASE_URL: "   " })).toEqual({ kind: "undeclared" });
  });

  it("reproduces the nightly's environment exactly, and declines it", () => {
    // Non-vacuity with teeth: this is .github/workflows/e2e-nightly.yml's own
    // env block — a staging origin, Supabase keys, and no DATABASE_URL.
    expect(
      resolveCleanupTarget({
        STAGING_URL: "https://dim-staging.vercel.app",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      }),
    ).toEqual({ kind: "undeclared" });
  });

  it("recognises a declared local database, by either spelling of this machine", () => {
    expect(resolveCleanupTarget({ DATABASE_URL: LOCAL_URL })).toEqual({
      kind: "local",
      url: LOCAL_URL,
    });
    expect(resolveCleanupTarget({ DATABASE_URL: LOOPBACK_URL })).toEqual({
      kind: "local",
      url: LOOPBACK_URL,
    });
    // Surrounding whitespace survives a hand-edited .env.
    expect(resolveCleanupTarget({ DATABASE_URL: `  ${LOCAL_URL}  ` })).toEqual({
      kind: "local",
      url: LOCAL_URL,
    });
  });

  it("calls a declared remote database remote — the pre-existing guard", () => {
    expect(resolveCleanupTarget({ DATABASE_URL: REMOTE_URL })).toEqual({
      kind: "remote",
      url: REMOTE_URL,
    });
  });
});

describe("isLocalDatabase", () => {
  it("judges an explicit URL on its host alone", () => {
    expect(isLocalDatabase(LOCAL_URL)).toBe(true);
    expect(isLocalDatabase(LOOPBACK_URL)).toBe(true);
    expect(isLocalDatabase(REMOTE_URL)).toBe(false);
    // A remote host that merely CONTAINS the word is not this machine.
    expect(isLocalDatabase("postgresql://u:p@localhost.evil.example.com:5432/db")).toBe(false);
  });

  it("is false with no argument when nothing declared a database", () => {
    // The no-argument form is the ENVIRONMENT gate degraded-states.spec.ts
    // skips on. False here is what stops that spec registering an undeletable
    // pet in a shared registry.
    vi.stubEnv("DATABASE_URL", undefined);
    expect(isLocalDatabase()).toBe(false);
  });

  it("is true with no argument when a local database is declared", () => {
    vi.stubEnv("DATABASE_URL", LOCAL_URL);
    expect(isLocalDatabase()).toBe(true);
  });

  it("is false with no argument when the declared database is remote", () => {
    vi.stubEnv("DATABASE_URL", REMOTE_URL);
    expect(isLocalDatabase()).toBe(false);
  });
});

describe("a declared remote target refuses to delete", () => {
  it("returns 0 and names the masked host, never the password", async () => {
    vi.stubEnv("DATABASE_URL", REMOTE_URL);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await deletePetsByNamePrefix("E2EPet-")).toBe(0);

    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("is not local");
    expect(line).toContain("db.example.supabase.co");
    expect(line).not.toContain("hunter2");
  });
});
