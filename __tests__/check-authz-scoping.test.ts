/**
 * Unit tests for scripts/check-authz-scoping.ts helpers.
 *
 * Pure fixture tests — no filesystem I/O. Exercises the "guard-called-but-not-
 * jurisdiction-scoped" heuristic against known-bad and known-good inline source
 * strings modelled on the real actions inventoried in
 * docs/design/handoffs/2026-07-04-authz-inventory-raw.md.
 */

import { describe, expect, it } from "vitest";

import { extractExportedAsyncFunctions } from "@/scripts/check-authz-guards";
import {
  SCOPING_MARKERS,
  TENANT_GUARDS,
  callsTenantGuard,
  findScopingOffenders,
  hasScopingMarker,
  isScopingOffender,
  ratchet,
} from "@/scripts/check-authz-scoping";

// ---------------------------------------------------------------------------
// callsTenantGuard — institutional/capability/org guards only
// ---------------------------------------------------------------------------

describe("callsTenantGuard", () => {
  it("matches an admin/govt institutional guard", () => {
    expect(callsTenantGuard("await requireAdminOrGovtOrRedirect();")).toBe(true);
  });

  it("matches a capability guard", () => {
    expect(
      callsTenantGuard('const { organization } = await requireCapability("intake.create");'),
    ).toBe(true);
  });

  it("does NOT treat a personal-tier guard as a tenant guard", () => {
    // requireUserOrRedirect / requirePetAccess scope to the caller's own
    // identity — an action gated only by those is never a candidate.
    expect(callsTenantGuard("const { user } = await requireUserOrRedirect();")).toBe(false);
    expect(callsTenantGuard("const access = await requirePetAccess(publicToken);")).toBe(false);
  });

  it("keeps requireAdminUser (file-local admin re-check) in the tenant set", () => {
    expect(TENANT_GUARDS).toContain("requireAdminUser");
    expect(callsTenantGuard("const auth = await requireAdminUser();")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasScopingMarker — a visible jurisdiction/tenant/owner predicate
// ---------------------------------------------------------------------------

describe("hasScopingMarker", () => {
  it("detects a tenant-id WHERE predicate", () => {
    expect(hasScopingMarker("eq(serviceOfferings.organizationId, organization.id)")).toBe(true);
  });

  it("detects a jurisdiction predicate", () => {
    expect(hasScopingMarker("session.jurisdictions.some((j) => j.province === petProvince)")).toBe(
      true,
    );
  });

  it("detects the inline authority re-check pattern (Good example in the audit)", () => {
    expect(
      hasScopingMarker("if (organization.publicToken !== input.receiverOrgToken) notFound();"),
    ).toBe(true);
    expect(hasScopingMarker("if (caseRow.openedByOrganizationId !== govtOrg.id) throw;")).toBe(
      true,
    );
  });

  it("detects an ownerships join", () => {
    expect(
      hasScopingMarker("and(eq(ownerships.ownerUserId, user.id), isNull(ownerships.endedAt))"),
    ).toBe(true);
  });

  it("returns false for a body that forwards an id with no predicate", () => {
    expect(hasScopingMarker("return _updateBusinessRuleWriter(input.ruleId, input);")).toBe(false);
    expect(SCOPING_MARKERS.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isScopingOffender — the full heuristic
// ---------------------------------------------------------------------------

const only = (src: string) => extractExportedAsyncFunctions(src)[0];

describe("isScopingOffender", () => {
  it("FLAGS a tenant-guarded action that forwards an id with no scoping", () => {
    const src = [
      "export async function deactivateGovtAction(targetGovtUserId: string) {",
      "  await requireAdminOrRedirect();",
      "  return deactivateGovtForAuthority(actor, targetGovtUserId);",
      "}",
    ].join("\n");
    expect(isScopingOffender(only(src))).toBe(true);
  });

  it("does NOT flag a tenant-guarded action that scopes the resource", () => {
    const src = [
      "export async function updateOfferingCapacityAction(orgToken: string, input: X) {",
      '  const { organization } = await requireCapability("service_offering.create");',
      "  await db.update(serviceOfferings).where(eq(serviceOfferings.organizationId, organization.id));",
      "}",
    ].join("\n");
    expect(isScopingOffender(only(src))).toBe(false);
  });

  it("does NOT flag an action gated only by a personal-tier guard", () => {
    const src = [
      "export async function bookSlotAction(slotId: string, petId: string) {",
      "  const { user } = await requireUserOrRedirect();",
      "  return bookSlotWriter(user.id, slotId, petId);",
      "}",
    ].join("\n");
    expect(isScopingOffender(only(src))).toBe(false);
  });

  it("does NOT flag an inner writer (guarded upstream)", () => {
    const src = [
      "export async function deactivateGovtForAuthority(actorUserId: string, targetId: string) {",
      "  return _run(actorUserId, targetId);",
      "}",
    ].join("\n");
    expect(isScopingOffender(only(src))).toBe(false);
  });

  it("does NOT flag an action opted out with @no-auth-required", () => {
    const src = [
      "// @no-auth-required: cron writer, CRON_SECRET-gated route",
      "export async function materializeAllActiveSlots() {",
      "  return run();",
      "}",
    ].join("\n");
    expect(isScopingOffender(only(src))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findScopingOffenders — one line per offender, with location
// ---------------------------------------------------------------------------

describe("findScopingOffenders", () => {
  it("returns a located line for each offender and skips scoped siblings", () => {
    const src = [
      "export async function revokeVetRoleAction(targetUserId: string) {",
      "  await requireAdminOrGovtOrRedirect();",
      "  return revokeVetRoleForAuthority(actor, targetUserId);",
      "}",
      "export async function scopedAction(orgToken: string) {",
      "  const { organization } = await requireOrgAccessByToken(orgToken);",
      "  await db.select().where(eq(t.organizationId, organization.id));",
      "}",
    ].join("\n");
    const offenders = findScopingOffenders("app/actions/x.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("revokeVetRoleAction");
    expect(offenders[0]).toMatch(/app\/actions\/x\.ts:1/);
  });
});

// ---------------------------------------------------------------------------
// ratchet — only GROWTH beyond baseline is a violation
// ---------------------------------------------------------------------------

describe("ratchet", () => {
  it("passes when a baselined file's offender count is unchanged", () => {
    const r = ratchet({ "a.ts": 2 }, { "a.ts": ["a.ts:1 x", "a.ts:2 y"] });
    expect(r.grew).toEqual([]);
    expect(r.newFiles).toEqual([]);
  });

  it("flags GROWTH beyond baseline", () => {
    const r = ratchet({ "a.ts": 1 }, { "a.ts": ["a.ts:1 x", "a.ts:2 y"] });
    expect(r.grew).toHaveLength(1);
    expect(r.grew[0]).toMatchObject({ file: "a.ts", baseline: 1, actual: 2 });
  });

  it("flags a NEW file that introduces an offender", () => {
    const r = ratchet({}, { "new.ts": ["new.ts:1 z"] });
    expect(r.newFiles).toHaveLength(1);
    expect(r.newFiles[0].file).toBe("new.ts");
  });

  it("passes when a baselined file SHRINKS (debt burned down)", () => {
    const r = ratchet({ "a.ts": 3 }, { "a.ts": ["a.ts:1 x"] });
    expect(r.grew).toEqual([]);
    expect(r.newFiles).toEqual([]);
  });
});
