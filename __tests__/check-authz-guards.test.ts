/**
 * Unit tests for scripts/check-authz-guards.ts helpers.
 *
 * Pure fixture tests — no filesystem I/O.  Each exported helper is exercised
 * against known-bad and known-good inline source strings to verify precision
 * (no false positives) and recall (every unguarded server action is caught).
 */

import { describe, expect, it } from "vitest";

import {
  AUTH_GUARDS,
  INNER_WRITER_SUFFIXES,
  INSTITUTIONAL_GUARDS,
  NO_AUTH_COMMENT,
  PERSONAL_TIER_GUARDS,
  callsAuthGuard,
  extractExportedAsyncFunctions,
  findOffenders,
  findRouteGuardViolations,
  isInnerWriter,
} from "@/scripts/check-authz-guards";

// ---------------------------------------------------------------------------
// callsAuthGuard — recognizes a guard call anywhere in a function body
// ---------------------------------------------------------------------------

describe("callsAuthGuard", () => {
  it("matches a direct requireUserOrRedirect() call", () => {
    expect(callsAuthGuard("const { user } = await requireUserOrRedirect();")).toBe(true);
  });

  it("matches requireOrgInterventionAccess (module-private welfare guard)", () => {
    // Regression: the welfare derived-report actions are guarded by this private
    // wrapper, which itself calls requireUserOrRedirect. It must be recognized.
    expect(AUTH_GUARDS).toContain("requireOrgInterventionAccess");
    expect(
      callsAuthGuard("const actor = await requireOrgInterventionAccess(input.orgToken);"),
    ).toBe(true);
  });

  it("matches the inline auth.getUser() pattern (literal dot only)", () => {
    expect(callsAuthGuard("const { data } = await supabase.auth.getUser();")).toBe(true);
  });

  it("does NOT match a guard-like identifier without a call", () => {
    // A bare reference (no parentheses) is not a guard call.
    expect(callsAuthGuard("const fn = requireUserOrRedirect;")).toBe(false);
  });

  it("does NOT match an unguarded body", () => {
    expect(callsAuthGuard("const result = await doWork(input);\nreturn result;")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isInnerWriter — inner writers take caller identity as a param, guarded upstream
// ---------------------------------------------------------------------------

describe("isInnerWriter", () => {
  it("recognizes a ForUser-suffixed inner writer", () => {
    expect(isInnerWriter("createReportForUser")).toBe(true);
  });

  it("recognizes a FromCron-suffixed system writer", () => {
    expect(isInnerWriter("expireProposalsFromCron")).toBe(true);
  });

  it("does NOT treat a public Action as an inner writer", () => {
    expect(isInnerWriter("submitOrgContactAction")).toBe(false);
  });

  it("every suffix is non-empty (sanity)", () => {
    expect(INNER_WRITER_SUFFIXES.every((s) => s.length > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractExportedAsyncFunctions — brace-matched bodies + @no-auth-required scan
// ---------------------------------------------------------------------------

describe("extractExportedAsyncFunctions", () => {
  it("captures the full body via brace matching", () => {
    const src = [
      "export async function fooAction() {",
      "  if (x) { doThing(); }",
      "  return 1;",
      "}",
    ].join("\n");
    const fns = extractExportedAsyncFunctions(src);
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe("fooAction");
    expect(fns[0].body).toContain("doThing();");
  });

  it("detects @no-auth-required in the contiguous comment block above the export", () => {
    const src = [
      `// ${NO_AUTH_COMMENT}: public flow, rate-limited`,
      "export async function publicAction() {",
      "  return 1;",
      "}",
    ].join("\n");
    expect(extractExportedAsyncFunctions(src)[0].hasNoAuthComment).toBe(true);
  });

  it("detects the marker on a JSDoc line directly above the export", () => {
    const src = [
      `/** System action. ${NO_AUTH_COMMENT}: cron path */`,
      "export async function expireSomethingAction() {",
      "  return 1;",
      "}",
    ].join("\n");
    expect(extractExportedAsyncFunctions(src)[0].hasNoAuthComment).toBe(true);
  });

  it("does NOT see a marker separated from the export by a non-comment line", () => {
    // Convention lock-in: the marker must be ADJACENT to the export. A marker in
    // a banner above an `export type` is NOT detected — contiguity breaks at the
    // type declaration, so the action is (correctly) flagged loud, never silent.
    const src = [
      `// ${NO_AUTH_COMMENT}: cron path`,
      "export type Stats = { n: number };",
      "/** System action. */",
      "export async function expireSomethingAction() {",
      "  return 1;",
      "}",
    ].join("\n");
    const fn = extractExportedAsyncFunctions(src).find((f) => f.name === "expireSomethingAction")!;
    expect(fn.hasNoAuthComment).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findOffenders — the end-to-end rule: pass for covered, fail for unguarded
// ---------------------------------------------------------------------------

describe("findOffenders", () => {
  it("flags an exported action with no guard, no marker, no inner-writer suffix", () => {
    const src = [
      "export async function deleteEverythingAction(id: string) {",
      "  await db.delete(id);",
      "  return { ok: true };",
      "}",
    ].join("\n");
    const offenders = findOffenders("app/actions/danger.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("deleteEverythingAction");
  });

  it("passes an action that calls a recognized guard", () => {
    const src = [
      "export async function listMineAction() {",
      "  const { user } = await requireUserOrRedirect();",
      "  return db.byOwner(user.id);",
      "}",
    ].join("\n");
    expect(findOffenders("app/actions/mine.ts", src)).toHaveLength(0);
  });

  it("passes an inner writer that takes caller identity as a param", () => {
    const src = [
      "export async function createReportForUser(userId: string) {",
      "  return db.insert({ userId });",
      "}",
    ].join("\n");
    expect(findOffenders("src/modules/x/actions.ts", src)).toHaveLength(0);
  });

  it("passes an unguarded action that is explicitly opted out", () => {
    const src = [
      `// ${NO_AUTH_COMMENT}: public contact form, IP rate-limited`,
      "export async function submitContactAction() {",
      "  return { ok: true };",
      "}",
    ].join("\n");
    expect(findOffenders("src/modules/x/actions.ts", src)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findRouteGuardViolations — WS-AUTHZ 1.3 route↔guard rule
// ---------------------------------------------------------------------------

describe("findRouteGuardViolations", () => {
  it("the guard tiers are disjoint (a guard can't be both personal and institutional)", () => {
    const overlap = PERSONAL_TIER_GUARDS.filter((g) =>
      (INSTITUTIONAL_GUARDS as readonly string[]).includes(g),
    );
    expect(overlap).toEqual([]);
  });

  it("flags an admin route gated by requireUserOrRedirect alone", () => {
    const src = [
      'import { requireUserOrRedirect } from "@/lib/infra/auth-guards";',
      "export default async function Page() {",
      "  await requireUserOrRedirect();",
      "  return null;",
      "}",
    ].join("\n");
    const offenders = findRouteGuardViolations("app/admin/secretos/page.tsx", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("personal-tier guard only");
  });

  it("passes an admin route gated by requireAdminOrRedirect", () => {
    const src = [
      'import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";',
      "export default async function Page() {",
      "  await requireAdminOrRedirect();",
      "  return null;",
      "}",
    ].join("\n");
    expect(findRouteGuardViolations("app/admin/secretos/page.tsx", src)).toHaveLength(0);
  });

  it("passes the shared-surface pattern: admin route using requireAdminOrGovtOrRedirect", () => {
    // e.g. app/admin/casos/page.tsx — narrows to admin in-body, or is a
    // role-adaptive dashboard shared with govt. The institutional guard is
    // present, so the route↔guard rule is satisfied.
    const src = [
      'import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";',
      "export default async function Page() {",
      "  const session = await requireAdminOrGovtOrRedirect();",
      '  if (session.profile.role !== "admin") redirect("/gob/casos");',
      "  return null;",
      "}",
    ].join("\n");
    expect(findRouteGuardViolations("app/admin/casos/page.tsx", src)).toHaveLength(0);
  });

  it("ignores a citizen route — the rule is operator-tree-scoped only", () => {
    const src = [
      'import { requireUserOrRedirect } from "@/lib/infra/auth-guards";',
      "export default async function Page() {",
      "  await requireUserOrRedirect();",
      "  return null;",
      "}",
    ].join("\n");
    expect(findRouteGuardViolations("app/mis-mascotas/page.tsx", src)).toHaveLength(0);
    expect(findRouteGuardViolations("app/org/[orgToken]/page.tsx", src)).toHaveLength(0);
  });

  it("ignores an operator route that calls no guard of its own (gated by its layout)", () => {
    const src = ["export default async function Page() {", "  return null;", "}"].join("\n");
    expect(findRouteGuardViolations("app/gob/panorama/page.tsx", src)).toHaveLength(0);
  });
});
