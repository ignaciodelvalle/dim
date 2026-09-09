// The read-only NATIONAL role (migration 0214) — the contract, pinned.
//
// Two halves:
//   1. SCOPE — a national reads with the same universal scope as admin, decided
//      ONLY through hasNationalReadScope (never through an empty jurisdiction
//      list), and every read-side resolver honours that.
//   2. WRITES — nothing on the government slice lets a national write, and the
//      guarantee is STRUCTURAL: the read gate is not a recognised guard for
//      "use server" exports or route handlers (scripts/check-authz-guards.ts),
//      so no writer can adopt it; the write-authority gates refuse the role
//      (pinned in __tests__/auth-guards.test.ts); and the write-side scope
//      predicate (canDecideRequest) refuses it too.
//
// Pure — no DB. The SQL clause is rendered through PgDialect, the file scans
// read the repo tree the same way the fences do.

import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  type GobReadRole,
  NATIONAL_READ_SCOPE_ROLES,
  hasNationalReadScope,
  isGobReadRole,
} from "@/lib/domain/jurisdiction-canonical";
import { roleLabel } from "@/lib/domain/role-labels";
import { canDecideRequest, visibleRequestsClause } from "@/lib/infra/approval-scope";
import { resolveScopedJurisdictions } from "@/lib/infra/gov-scope";
import { pathForRole } from "@/lib/infra/role-landing";
import { buildProjectionScope } from "@/lib/metrics/context";
import { describeNarrowedView } from "@/lib/ui/view-scope-caption";
import {
  AUTH_GUARDS,
  GUARD_HOMES,
  INSTITUTIONAL_GUARDS,
  listActionFiles,
  listRouteHandlerFiles,
} from "../scripts/check-authz-guards";

const READ_GATE = "requireGobReadAccessOrRedirect";

// ---------------------------------------------------------------------------
// 1. Scope — decided by role, never by list emptiness
// ---------------------------------------------------------------------------

describe("hasNationalReadScope — the one place universality is decided", () => {
  it("is true for admin and national, false for govt and the personal roles", () => {
    expect(hasNationalReadScope("admin")).toBe(true);
    expect(hasNationalReadScope("national")).toBe(true);
    expect(hasNationalReadScope("govt")).toBe(false);
    expect(hasNationalReadScope("owner")).toBe(false);
    expect(hasNationalReadScope("vet")).toBe(false);
    expect(hasNationalReadScope("")).toBe(false);
    expect([...NATIONAL_READ_SCOPE_ROLES].sort()).toEqual(["admin", "national"]);
  });

  it("isGobReadRole admits exactly admin | govt | national", () => {
    const admitted = ["admin", "govt", "national"] satisfies GobReadRole[];
    for (const r of admitted) expect(isGobReadRole(r)).toBe(true);
    for (const r of ["owner", "vet", "system", ""]) expect(isGobReadRole(r)).toBe(false);
  });

  it("buildProjectionScope: national → global (like admin); govt with [] → an EMPTY jurisdictions scope, never global", () => {
    expect(buildProjectionScope({ role: "national" }, [])).toEqual({ kind: "global" });
    expect(buildProjectionScope({ role: "admin" }, [])).toEqual({ kind: "global" });
    expect(buildProjectionScope({ role: "govt" }, [])).toEqual({
      kind: "jurisdictions",
      jurisdictions: [],
    });
  });

  it("resolveScopedJurisdictions: a national's list is returned unchanged (its URL selection is a drill, not a mandate intersection)", () => {
    expect(
      resolveScopedJurisdictions({
        role: "national",
        jurisdictions: [],
        selectedProvinceName: "Buenos Aires",
        selectedLocalityName: "La Plata",
      }),
    ).toEqual([]);
    // The govt fence still narrows — and narrows to nothing outside the mandate.
    expect(
      resolveScopedJurisdictions({
        role: "govt",
        jurisdictions: [{ province: "Tierra del Fuego", locality: "Ushuaia" }],
        selectedProvinceName: "Buenos Aires",
      }),
    ).toEqual([]);
  });

  it("visibleRequestsClause: a national READS the whole approval queue (renders `true`)", () => {
    const clause = visibleRequestsClause({ id: "n-1", role: "national" }, []);
    expect(clause).toBeDefined();
    const { sql } = new PgDialect().sqlToQuery(clause as NonNullable<typeof clause>);
    expect(sql.trim()).toBe("true");
  });

  it("describeNarrowedView: a national with no drill discloses nothing; with a drill, the drilled area", () => {
    expect(describeNarrowedView({ role: "national", mandateJurisdictions: [] })).toBeNull();
    expect(
      describeNarrowedView({
        role: "national",
        mandateJurisdictions: [],
        adminProvince: "Mendoza",
        adminLocality: "Godoy Cruz",
      }),
    ).toBe("Godoy Cruz, Mendoza");
  });

  it("lands on /gob and is labelled in es-AR", () => {
    expect(pathForRole("national", {})).toBe("/gob");
    expect(roleLabel("national")).toBe("Lectura nacional");
  });
});

// ---------------------------------------------------------------------------
// 2. Writes — refused, and structurally unreachable
// ---------------------------------------------------------------------------

describe("national role — writes are refused", () => {
  it("canDecideRequest (the write-side scope predicate) refuses a national even with no jurisdiction fence to fail", () => {
    // The type already excludes "national"; the runtime check must agree, so a
    // caller that widened the type could not silently gain the decision.
    const request = {
      type: "role_upgrade_vet" as const,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    };
    const nationalAsProfile = { role: "national" } as unknown as { role: "admin" | "govt" };
    expect(canDecideRequest(nationalAsProfile, request, [])).toBe(false);
    expect(
      canDecideRequest(nationalAsProfile, request, [
        { province: "Buenos Aires", locality: "La Plata" },
      ]),
    ).toBe(false);
  });

  it("the read gate is an INSTITUTIONAL page guard with a home, and NOT a recognised guard for server actions or route handlers", () => {
    expect(INSTITUTIONAL_GUARDS).toContain(READ_GATE);
    expect(GUARD_HOMES[READ_GATE]).toEqual(["lib/infra/auth-guards.ts"]);
    // The load-bearing half: absent from AUTH_GUARDS, a "use server" export
    // that called only the read gate would be flagged as UNGUARDED by
    // lint:authz — the fence, not this test, is what keeps writers off it.
    expect(AUTH_GUARDS).not.toContain(READ_GATE);
  });

  it("no server-action module and no route handler mentions the read gate", () => {
    const offenders: string[] = [];
    for (const rel of [...listActionFiles(), ...listRouteHandlerFiles()]) {
      const src = readFileSync(rel, "utf8");
      if (src.includes(READ_GATE)) offenders.push(rel);
    }
    expect(offenders, "writers must gate on requireAdminOrGovtOrRedirect").toEqual([]);
  });
});
