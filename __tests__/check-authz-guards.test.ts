/**
 * Unit tests for scripts/check-authz-guards.ts helpers.
 *
 * Mostly pure fixture tests.  Each exported helper is exercised against
 * known-bad and known-good inline source strings to verify precision (no false
 * positives) and recall (every unguarded server action is caught).
 *
 * The one exception is the SCAN-SET suite at the bottom, which does touch the
 * filesystem on purpose: this linter's worst failure was never a broken regex,
 * it was a file list that never opened the file (see listActionFiles' header).
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AUTH_GUARDS,
  DELETION_AWARE_GUARDS,
  GUARD_HOMES,
  INNER_WRITER_SUFFIXES,
  INSTITUTIONAL_GUARDS,
  MIN_ROUTE_HANDLER_FILES,
  NO_AUTH_COMMENT,
  PERSONAL_TIER_GUARDS,
  ROUTE_HANDLER_GUARDS,
  SYSTEM_GUARDS,
  callsAuthGuard,
  extractExportedAsyncFunctions,
  findDeletionUnawareMutations,
  findOffenders,
  findRouteGuardViolations,
  findRouteHandlerOffenders,
  findShadowedGuardDefinitions,
  findUnreadableMethodExports,
  guardHomeViolations,
  isInnerWriter,
  isServerActionModule,
  listActionFiles,
  listGuardShadowScanFiles,
  listRouteHandlerFiles,
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

  // -------------------------------------------------------------------------
  // Signature-vs-body accounting. The extractor used to count braces from the
  // export line, so an inline object type ANYWHERE in the signature closed the
  // depth before the body started: the body was never captured and its guard
  // call was invisible. A linter that silently stops looking is worse than no
  // linter, so these are recall fences, not style tests.
  // -------------------------------------------------------------------------

  it("captures the body past an inline object type in the parameter list", () => {
    // The exact shape that hid importIntakeRowsAction's guard (2026-08-06):
    // a nested inline object type in the params.
    const src = [
      "export async function importThingAction(",
      "  orgToken: string,",
      "  input: { a: { b: string } },",
      ") {",
      "  const auth = await requireCapabilityForOrgToken('intake.create', orgToken);",
      "  return auth;",
      "}",
    ].join("\n");
    const fns = extractExportedAsyncFunctions(src);
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe("importThingAction");
    expect(fns[0].body).toContain("requireCapabilityForOrgToken");
    expect(callsAuthGuard(fns[0].body)).toBe(true);
  });

  it("captures the body past an inline object type in the RETURN annotation", () => {
    // `Promise<{ ok: boolean }>` is the same trap one token later.
    const src = [
      "export async function fetchThingAction(",
      "  input: { id: string },",
      "): Promise<{ ok: boolean; rows: { id: string }[] }> {",
      "  const { user } = await requireUserOrRedirect();",
      "  return { ok: true, rows: [{ id: user.id }] };",
      "}",
    ].join("\n");
    const fns = extractExportedAsyncFunctions(src);
    expect(fns).toHaveLength(1);
    expect(callsAuthGuard(fns[0].body)).toBe(true);
    // The closing `}` of the FUNCTION ends the capture, not the type's.
    expect(fns[0].endLine).toBe(6);
  });

  it("captures the body of a generic export whose type parameter carries a constraint object", () => {
    const src = [
      "export async function mapRowsAction<T extends { id: string }>(",
      "  rows: T[],",
      "): Promise<T[]> {",
      "  await requireUserOrRedirect();",
      "  return rows;",
      "}",
    ].join("\n");
    const fns = extractExportedAsyncFunctions(src);
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe("mapRowsAction");
    expect(callsAuthGuard(fns[0].body)).toBe(true);
  });

  it("still finds the SECOND export after a multi-line signature (no runaway capture)", () => {
    const src = [
      "export async function firstAction(input: { a: string }) {",
      "  await requireUserOrRedirect();",
      "  return 1;",
      "}",
      "",
      "export async function secondAction() {",
      "  return 2;",
      "}",
    ].join("\n");
    const names = extractExportedAsyncFunctions(src).map((f) => f.name);
    expect(names).toEqual(["firstAction", "secondAction"]);
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
// findRouteHandlerOffenders — the same coverage rule over `app/**/route.ts`
//
// D4 (2026-08-21). A route.ts is a client-addressable entry point exactly like
// a server action, and until D4 nothing in this linter opened one. The RED
// control below (an unguarded handler MUST be flagged) is the test that would
// have failed before the widening and is the reason the rest are not vacuous.
// ---------------------------------------------------------------------------

describe("findRouteHandlerOffenders", () => {
  it("flags an unguarded handler — THE RED CONTROL", () => {
    const src = [
      "export async function GET(request: Request) {",
      "  const rows = await db.select().from(pets);",
      "  return Response.json(rows);",
      "}",
    ].join("\n");
    const offenders = findRouteHandlerOffenders("app/api/v1/pets/route.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("GET");
    expect(offenders[0]).toContain("no authorization call");
  });

  it("passes a handler gated by a session guard (AUTH_GUARDS)", () => {
    const src = [
      "export async function GET(request: Request) {",
      "  const { user } = await requireUserOrRedirect();",
      "  return Response.json({ id: user.id });",
      "}",
    ].join("\n");
    expect(findRouteHandlerOffenders("app/api/v1/me/route.ts", src)).toHaveLength(0);
  });

  it("passes a handler gated by an institutional guard (INSTITUTIONAL_GUARDS)", () => {
    // resolveInstitutionalGobActor is NOT in AUTH_GUARDS — the route rule has to
    // union the two lists, or every app/api/gob and app/api/panorama handler
    // would false-flag.
    expect(AUTH_GUARDS as readonly string[]).not.toContain("resolveInstitutionalGobActor");
    const src = [
      "export async function GET(request: Request) {",
      "  const actor = await resolveInstitutionalGobActor();",
      "  if (!actor.ok) return actor.response;",
      "  return Response.json({ ok: true });",
      "}",
    ].join("\n");
    expect(findRouteHandlerOffenders("app/api/gob/mascotas/[token]/route.ts", src)).toHaveLength(0);
  });

  it("passes a cron handler gated by a SYSTEM guard (secret, not identity)", () => {
    for (const guard of SYSTEM_GUARDS) {
      const src = [
        "export async function GET(request: Request) {",
        `  const authError = ${guard}(request);`,
        "  if (authError) return Response.json(authError, { status: authError.status });",
        "  return Response.json({ ok: true });",
        "}",
      ].join("\n");
      expect(findRouteHandlerOffenders("app/api/cron/daily/route.ts", src)).toHaveLength(0);
    }
  });

  it("a SYSTEM guard does NOT satisfy the SERVER-ACTION rule", () => {
    // The whole reason SYSTEM_GUARDS is a separate list. A cron-secret check on
    // an action proves a trusted scheduler called it and leaves "who is acting"
    // unasked — while the action is reachable from any logged-in browser with
    // the caller's cookies attached.
    for (const guard of SYSTEM_GUARDS) {
      expect(AUTH_GUARDS as readonly string[]).not.toContain(guard);
      const src = [
        "export async function runMaintenanceAction(request: Request) {",
        `  const authError = ${guard}(request);`,
        "  if (authError) return authError;",
        "  return { ok: true };",
        "}",
      ].join("\n");
      const offenders = findOffenders("app/actions/maintenance.ts", src);
      expect(offenders).toHaveLength(1);
      expect(offenders[0]).toContain("runMaintenanceAction");
    }
  });

  it("passes an intentionally-public handler opted out WITH a reason", () => {
    const src = [
      `// ${NO_AUTH_COMMENT}: liveness probe, no PII, IP rate-limited`,
      "export async function GET(request: Request) {",
      "  return Response.json({ status: 'ok' });",
      "}",
    ].join("\n");
    expect(findRouteHandlerOffenders("app/api/health/route.ts", src)).toHaveLength(0);
  });

  it("FLAGS a bare opt-out with no reason", () => {
    // The marker's own semantics (extractExportedAsyncFunctions) only look for
    // the token, so a bare `// @no-auth-required` satisfies the ACTION rule. The
    // route rule additionally requires the reason text: an exemption nobody had
    // to justify is a silent baseline.
    const src = [
      `// ${NO_AUTH_COMMENT}`,
      "export async function GET(request: Request) {",
      "  return Response.json({ status: 'ok' });",
      "}",
    ].join("\n");
    const offenders = findRouteHandlerOffenders("app/api/health/route.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("BARE");
    // …and the marker itself IS detected — the failure is the missing reason,
    // not a missing marker.
    expect(extractExportedAsyncFunctions(src)[0].hasNoAuthComment).toBe(true);
    expect(extractExportedAsyncFunctions(src)[0].noAuthReason).toBe("");
  });

  it("captures the reason text from both comment styles", () => {
    const line = extractExportedAsyncFunctions(
      [
        `// ${NO_AUTH_COMMENT}: public open data, Ley 27.275`,
        "export async function GET() {}",
      ].join("\n"),
    )[0];
    expect(line.noAuthReason).toBe("public open data, Ley 27.275");

    const block = extractExportedAsyncFunctions(
      [`/** ${NO_AUTH_COMMENT}: cron path */`, "export async function GET() {}"].join("\n"),
    )[0];
    expect(block.noAuthReason).toBe("cron path");

    const none = extractExportedAsyncFunctions("export async function GET() {}")[0];
    expect(none.noAuthReason).toBeNull();
  });

  it("does NOT count a guard named only in a comment", () => {
    const src = [
      "export async function GET(request: Request) {",
      "  // TODO: call requireUserOrRedirect() here",
      "  return Response.json({});",
      "}",
    ].join("\n");
    expect(findRouteHandlerOffenders("app/api/v1/pets/route.ts", src)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // ZERO READABLE EXPORTS — the two shapes that slipped BOTH rules.
  //
  // findUnreadableMethodExports catches a method exported under a name it can
  // still see. A destructured binding and a star re-export name no method at
  // all: the walker yields zero functions, the unreadable rule fires zero
  // offenders, and before 2026-08-21 the file came back "authorized" — passing
  // by being invisible, through a door the sibling rule did not cover.
  // -------------------------------------------------------------------------

  it("FLAGS a destructured method export (`export const { GET, POST } = handlers`)", () => {
    const src = [
      'import { handlers } from "./impl";',
      "export const { GET, POST } = handlers;",
    ].join("\n");
    // The premise: neither existing rule sees anything here.
    expect(extractExportedAsyncFunctions(src)).toHaveLength(0);
    expect(findUnreadableMethodExports("app/api/x/route.ts", src)).toHaveLength(0);

    const offenders = findRouteHandlerOffenders("app/api/x/route.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("no readable HTTP method");
  });

  it("FLAGS a star re-export (`export * from './impl'`)", () => {
    const src = 'export * from "./impl";';
    expect(extractExportedAsyncFunctions(src)).toHaveLength(0);
    expect(findUnreadableMethodExports("app/api/x/route.ts", src)).toHaveLength(0);

    const offenders = findRouteHandlerOffenders("app/api/x/route.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("no readable HTTP method");
  });

  it("stays quiet on a readable, guarded handler (the rule is not vacuous the other way)", () => {
    const src = [
      'export const dynamic = "force-dynamic";',
      "export async function GET(request: Request) {",
      "  const { user } = await requireUserOrRedirect();",
      "  return Response.json({ id: user.id });",
      "}",
    ].join("\n");
    expect(findRouteHandlerOffenders("app/api/x/route.ts", src)).toHaveLength(0);
  });

  it("does NOT double-report: an unreadable-but-visible export gets one offender, not two", () => {
    // `export const GET = withX(handler)` yields zero readable functions too,
    // but findUnreadableMethodExports already named it — the zero-readable rule
    // must stay silent so the author reads one instruction, not two.
    const src = 'import { withX } from "@/lib/x";\nexport const GET = withX(handler);';
    const offenders = findRouteHandlerOffenders("app/api/x/route.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("cannot read");
  });

  it("tells the author that a guard hoisted into a helper is not seen", () => {
    // The rule scans the handler BODY and does not follow calls. That false
    // positive is the intended direction (loud, not silent), so the message
    // has to say what to do about it — otherwise the author's fix is to
    // baseline the fence.
    const src = [
      "export async function GET(request: Request) {",
      "  const ctx = await resolveContext(request);",
      "  return Response.json(ctx);",
      "}",
    ].join("\n");
    const offenders = findRouteHandlerOffenders("app/api/x/route.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("call the guard directly in the handler body");
  });

  it("ROUTE_HANDLER_GUARDS is the deduplicated union of the three tiers", () => {
    for (const g of [...AUTH_GUARDS, ...INSTITUTIONAL_GUARDS, ...SYSTEM_GUARDS]) {
      expect(ROUTE_HANDLER_GUARDS).toContain(g);
    }
    expect(ROUTE_HANDLER_GUARDS).toEqual([...new Set(ROUTE_HANDLER_GUARDS)]);
  });
});

// ---------------------------------------------------------------------------
// findUnreadableMethodExports — the export-shape assumption, made falsifiable
//
// The route rule reuses extractExportedAsyncFunctions verbatim because 47/47
// handlers are `export async function GET(…)` today. That is a MEASUREMENT.
// Without this rule, the first `export const GET = withRateLimit(handler)`
// would yield zero functions, produce zero offenders, and pass by being
// invisible — the exact "a fence that scans nothing reports success" failure.
// ---------------------------------------------------------------------------

describe("findUnreadableMethodExports", () => {
  it("says nothing about the shape the extractor understands", () => {
    const src = "export async function GET() {\n  return Response.json({});\n}";
    expect(findUnreadableMethodExports("app/api/x/route.ts", src)).toHaveLength(0);
  });

  it("flags `export const GET = withX(handler)`", () => {
    const src = 'import { withX } from "@/lib/x";\nexport const GET = withX(handler);';
    const offenders = findUnreadableMethodExports("app/api/x/route.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("cannot read");
    // And the whole-file rule surfaces it too, not just the sub-helper.
    expect(findRouteHandlerOffenders("app/api/x/route.ts", src)).toHaveLength(1);
  });

  it("flags a re-exported handler (`export { handler as POST }`)", () => {
    const src = "async function handler() {}\nexport { handler as POST };";
    expect(findUnreadableMethodExports("app/api/x/route.ts", src)).toHaveLength(1);
  });

  it("flags a NON-async `export function DELETE(`", () => {
    const src = "export function DELETE() {\n  return new Response(null, { status: 204 });\n}";
    expect(findUnreadableMethodExports("app/api/x/route.ts", src)).toHaveLength(1);
  });

  it("ignores a method name that only appears in a COMMENT", () => {
    const src = [
      "// export const GET = withX(handler) — the shape we do NOT use",
      "export async function GET() {}",
    ].join("\n");
    expect(findUnreadableMethodExports("app/api/x/route.ts", src)).toHaveLength(0);
  });

  it("KNOWN false positive: an export declaration inside a string literal flags", () => {
    // Documented, not fixed. stripComments removes comments, not strings — the
    // same limitation this linter's header states for guard names. The error
    // direction is the safe one: a route.ts carrying `"export const POST = …"`
    // as data fails LOUD and a human deletes the string or the pattern, whereas
    // a fence that guessed its way past it would be guessing in the direction of
    // silence. Zero occurrences in the tree today (pinned by the scan-set suite
    // below, which asserts no unreadable exports across all 47 handlers).
    //
    // THIS ASSERTION PINS A LIMITATION, NOT A REQUIREMENT. The limitation is
    // scripts/lib/strip-comments.mjs keeping string and template-literal
    // CONTENTS (deliberately — a tag inside a string can be real emitted
    // markup, so blanking them would make the sibling fences blind to genuine
    // violations). If someone later teaches the stripper to blank string
    // contents for this caller, the correct move is to flip this expectation to
    // `toHaveLength(0)` and rename the test — NOT to revert the stripper change
    // to keep a green line. A test that pins a known defect has to say so, or
    // the next person reads it as the contract.
    const src = ['const label = "export const POST = x";', "export async function GET() {}"].join(
      "\n",
    );
    expect(findUnreadableMethodExports("app/api/x/route.ts", src)).toHaveLength(1);
  });

  it("ignores Next route-segment config exports (they are not handlers)", () => {
    const src = [
      'export const dynamic = "force-dynamic";',
      'export const runtime = "nodejs";',
      "export const maxDuration = 300;",
      "export async function GET() {}",
    ].join("\n");
    expect(findUnreadableMethodExports("app/api/x/route.ts", src)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findDeletionUnawareMutations — WS-AUTHZ 1.4 deletion-aware guard rule (E2)
// ---------------------------------------------------------------------------

describe("findDeletionUnawareMutations", () => {
  it("flags an inline pet write authorized on a bare auth.getUser() with no deletion-aware guard", () => {
    const src = [
      "export async function logEventAction(token: string) {",
      "  const { data: { user } } = await supabase.auth.getUser();",
      "  if (!user) throw new Error('no session');",
      "  await db.insert(petEvents).values({ petId, authorUserId: user.id });",
      "  return { ok: true };",
      "}",
    ].join("\n");
    const offenders = findDeletionUnawareMutations("app/actions/x.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("logEventAction");
    expect(offenders[0]).toContain("deletion-aware guard");
  });

  it("passes when the same write also routes through requireAlivePetAccess", () => {
    const src = [
      "export async function logEventAction(token: string) {",
      "  const access = await requireAlivePetAccess(token);",
      "  if (!access.ok) return access;",
      "  await db.insert(petEvents).values({ petId: access.pet.id });",
      "  return { ok: true };",
      "}",
    ].join("\n");
    expect(findDeletionUnawareMutations("app/actions/x.ts", src)).toHaveLength(0);
  });

  it("does NOT flag a bare-getUser write to a non-pet table", () => {
    // Reminders / notifications writes are lower-stakes and out of the pet-write
    // scope this rule targets.
    const src = [
      "export async function snoozeReminderAction(id: string) {",
      "  const { data: { user } } = await supabase.auth.getUser();",
      "  if (!user) throw new Error('no session');",
      "  await db.update(reminders).set({ snoozedUntil: new Date() });",
      "  return { ok: true };",
      "}",
    ].join("\n");
    expect(findDeletionUnawareMutations("app/actions/reminders.ts", src)).toHaveLength(0);
  });

  it("does NOT flag a bare-getUser pet READ (no insert/update/delete)", () => {
    const src = [
      "export async function readPetAction(token: string) {",
      "  const { data: { user } } = await supabase.auth.getUser();",
      "  if (!user) throw new Error('no session');",
      "  return db.select().from(pets).where(eq(pets.publicToken, token));",
      "}",
    ].join("\n");
    expect(findDeletionUnawareMutations("app/actions/x.ts", src)).toHaveLength(0);
  });

  it("does NOT flag an inner writer (identity is a param, guarded upstream)", () => {
    const src = [
      "export async function logEventForUser(userId: string, token: string) {",
      "  const { data: { user } } = await supabase.auth.getUser();",
      "  await db.insert(petEvents).values({ petId, authorUserId: userId });",
      "}",
    ].join("\n");
    expect(findDeletionUnawareMutations("src/modules/x/actions.ts", src)).toHaveLength(0);
  });

  it("the deletion-aware set excludes bare auth.getUser (the whole point of the rule)", () => {
    expect(DELETION_AWARE_GUARDS as readonly string[]).not.toContain("auth.getUser");
    expect(DELETION_AWARE_GUARDS).toContain("requirePetAccess");
    expect(DELETION_AWARE_GUARDS).toContain("requireCapability");
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

// ---------------------------------------------------------------------------
// isServerActionModule / listActionFiles — the SCAN SET
//
// This is the rule that actually decides what gets checked, and it is where the
// linter was silently wrong until 2026-08-05: discovery was two filename globs
// (`app/actions/*.ts`, flat, plus the literal name `src/modules/**/actions.ts`),
// so ten real "use server" modules — including the eight clinical WRITE actions
// under app/org/[orgToken]/atender/ — were never opened. Every regex assertion
// above was green the whole time, because a file that is never read cannot
// produce an offender. Pin the scan set, not just the predicates.
// ---------------------------------------------------------------------------

describe("isServerActionModule", () => {
  it("accepts the directive as the first statement", () => {
    expect(isServerActionModule('"use server";\nexport async function a() {}\n')).toBe(true);
    expect(isServerActionModule("'use server'\n")).toBe(true);
  });

  it("accepts a directive preceded only by comments or blank lines", () => {
    const src = ["// Org ficha wrappers.", "", "/* block */", '"use server";', ""].join("\n");
    expect(isServerActionModule(src)).toBe(true);
  });

  it("rejects a module that only MENTIONS the directive in a comment", () => {
    // Verbatim shape of src/modules/organizations/actions.internal.ts, whose
    // header says it is deliberately NOT a server-action module.
    const src = [
      '// This module is intentionally NOT a "use server" file: its exports accept',
      "// a caller-supplied actor id.",
      "export async function doThingForUser(actorUserId: string) {}",
    ].join("\n");
    expect(isServerActionModule(src)).toBe(false);
  });

  it("rejects a FUNCTION-scoped directive (an inline action, not a module)", () => {
    const src = [
      "export default async function Page() {",
      "  async function submit() {",
      '    "use server";',
      "  }",
      "  return null;",
      "}",
    ].join("\n");
    expect(isServerActionModule(src)).toBe(false);
  });
});

describe("listActionFiles", () => {
  const files = listActionFiles();

  it("scans a non-empty surface", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("still covers everything the pre-2026-08-05 filename globs covered", () => {
    expect(files).toContain("app/actions/auth.ts");
    expect(files).toContain("src/modules/transfers/actions.ts");
  });

  it("covers the route-colocated modules the old globs missed", () => {
    // Regression pins. Each of these declares "use server" and exports server
    // actions; none matches `app/actions/*.ts` or `src/modules/**/actions.ts`.
    for (const missed of [
      "app/org/[orgToken]/atender/actions.ts",
      "app/org/[orgToken]/mascotas/[publicToken]/eventos/actions.ts",
      "app/admin/outbox/actions.ts",
      "app/admin/libro/actions.ts",
      "app/gob/analytics/export/actions.ts",
      "app/(public)/p/[publicToken]/encontre/action.ts",
    ]) {
      expect(files).toContain(missed);
    }
  });

  it("excludes tests and type declarations", () => {
    for (const file of files) {
      expect(file).not.toMatch(/\.test\.[jt]sx?$/);
      expect(file).not.toContain("__tests__");
      expect(file).not.toMatch(/\.d\.ts$/);
    }
  });

  it("returns deduplicated, forward-slash, sorted paths", () => {
    expect(files).toEqual([...new Set(files)]);
    expect(files.some((f) => f.includes("\\"))).toBe(false);
    expect(files).toEqual([...files].sort());
  });

  it("does NOT absorb route handlers — four other fences import this list", () => {
    // check-audit-log-coverage.ts, check-authz-scoping.ts,
    // check-confused-deputy.ts and check-titular-gate.ts all derive their scope
    // from listActionFiles(). Widening it to cover route handlers would move
    // four boundaries from an edit whose subject was this file, so handler
    // discovery is listRouteHandlerFiles() instead. If a route.ts ever DOES
    // declare "use server" it belongs in both lists and this pin should be
    // revisited deliberately — not deleted to make a run green.
    expect(files.filter((f) => f.endsWith("/route.ts"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listRouteHandlerFiles — the ROUTE-HANDLER scan set (D4)
//
// Same lesson as listActionFiles above, one surface over: the offender-finding
// regexes can all be perfect while the file list quietly stops opening files.
// Pin concrete paths across the tree's shapes — /api, an operator API route, a
// cron, an auth callback, and a deeply-nested org route — so a glob that
// narrows to one prefix fails here loudly.
// ---------------------------------------------------------------------------

describe("listRouteHandlerFiles", () => {
  const handlers = listRouteHandlerFiles();

  it("clears its own non-vacuity floor", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(MIN_ROUTE_HANDLER_FILES);
  });

  it("covers every shape of route handler in the tree", () => {
    for (const expected of [
      "app/api/health/route.ts",
      "app/api/gob/mascotas/[token]/route.ts",
      "app/api/cron/daily/route.ts",
      "app/auth/callback/route.ts",
      "app/org/[orgToken]/mascotas/exportar/route.ts",
    ]) {
      expect(handlers).toContain(expected);
    }
  });

  it("reaches handlers OUTSIDE app/api (the prefix trap)", () => {
    // check-api-guard-headers.ts globbed `app/api/**` alone and left 13
    // handlers — both auth callbacks among them — outside a fence whose whole
    // subject is route handlers. Do not repeat it here.
    expect(handlers.filter((f) => !f.startsWith("app/api/")).length).toBeGreaterThanOrEqual(8);
  });

  it("excludes tests and type declarations", () => {
    for (const file of handlers) {
      expect(file).not.toMatch(/\.test\.[jt]sx?$/);
      expect(file).not.toContain("__tests__");
    }
  });

  it("returns deduplicated, forward-slash, sorted paths", () => {
    expect(handlers).toEqual([...new Set(handlers)]);
    expect(handlers.some((f) => f.includes("\\"))).toBe(false);
    expect(handlers).toEqual([...handlers].sort());
  });

  // -------------------------------------------------------------------------
  // THE EXPORT-SHAPE ASSUMPTION, pinned against the real tree.
  //
  // Reusing extractExportedAsyncFunctions unchanged is only sound while every
  // handler declares its methods as `export async function`. These two run over
  // the actual files so the assumption is re-measured on every CI run instead of
  // being trusted from a comment.
  // -------------------------------------------------------------------------

  it("every handler declares at least one exported async function", () => {
    const empty = handlers.filter(
      (f) => extractExportedAsyncFunctions(readFileSync(f, "utf8")).length === 0,
    );
    expect(empty).toEqual([]);
  });

  it("no handler exports an HTTP method in a shape the extractor cannot read", () => {
    const unreadable = handlers.flatMap((f) =>
      findUnreadableMethodExports(f, readFileSync(f, "utf8")),
    );
    expect(unreadable).toEqual([]);
  });

  it("the whole live surface is covered — no unguarded, un-opted-out handler", () => {
    // The end-to-end assertion `pnpm lint:authz` makes, kept here so a
    // regression fails in the test suite too and not only in the lint job.
    const offenders = handlers.flatMap((f) =>
      findRouteHandlerOffenders(f, readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("the intentionally-public handlers are exactly the ten documented ones", () => {
    // An ELEVENTH opt-out appearing here is a decision, not a detail: it means an
    // endpoint was made public and this list is where that shows up in review.
    //
    // The seventh arrived on 2026-08-21 with the first `/api/v1` endpoint. It is
    // the only one on this list whose PUBLICNESS IS THE PRODUCT rather than a
    // protocol requirement: the other six are an OAuth callback, a cookie
    // exchange, a health probe and an open-data download. `GET /api/v1/pets/
    // {publicToken}/credential` is anonymous because the pet IS the credential
    // (invariant #1) — it is bounded by two rate limiters instead of authorized,
    // and it discloses exactly what /p/{publicToken} already shows to anyone
    // holding the token.
    //
    // The EIGHTH AND NINTH arrived on 2026-08-25 with WU-A, and they are a third
    // kind again: `POST /api/v1/auth/login` and `POST /api/v1/auth/signup` are
    // public because they are PRE-AUTHENTICATION — establishing a session is
    // what they are for, so there is no identity to resolve first. Exactly the
    // reason `app/actions/auth.ts`'s two action wrappers carry the same opt-out.
    // Both are bounded rather than authorized, by the SAME budgets the web form
    // spends (`auth_login_ip`, `auth_login_email`, `auth_signup_ip`), enforced
    // inside the shared use-case before GoTrue is touched.
    //
    // The TENTH arrived on 2026-08-25 with WU-B: `GET /api/v1/localities`. It is
    // a fourth kind — PUBLIC REFERENCE DATA. `ar_localities` is the INDEC
    // catalogue: locality names, slugs, province codes and department names, with
    // no PII in the table at all, and the web already serves the same rows
    // anonymously to the /perdidas and /adoptar filter bars
    // (`searchLocalitiesPublicAction`, which carries this same opt-out). It is
    // public here rather than session-gated because a native signup asks "¿dónde
    // vivís?" before there is a session to gate on, and an endpoint that 401s
    // there teaches clients to bundle a stale copy of the national catalogue.
    // Bounded rather than authorized, by its own per-IP `api_v1_localities`
    // budget — its OWN bucket, not the module's shared `__public__` sentinel, so
    // one scraper cannot starve the web's anonymous filter bars.
    //
    // `POST /api/v1/pets` and `GET /api/v1/me/pets`, the other two WU-B routes,
    // are deliberately NOT here for the same reason `/me` is not: both call
    // requireLiveUser.
    //
    // `GET /api/v1/me` is deliberately NOT here, and its absence is load-bearing:
    // it is the first bearer-authenticated endpoint and it calls requireLiveUser.
    // Its first version explained that by writing the opt-out marker in a comment
    // saying it did NOT claim the opt-out — and landed on this list anyway,
    // because the scanner matches the token and not the sentence around it. This
    // assertion is what caught it. The route now says "AUTHORIZED, not opted out"
    // without spelling the marker.
    const optedOut = handlers.filter((f) =>
      extractExportedAsyncFunctions(readFileSync(f, "utf8")).some((fn) => fn.hasNoAuthComment),
    );
    expect(optedOut).toEqual([
      "app/(public)/denuncias/seguimiento/entrar/route.ts",
      "app/(public)/denuncias/seguimiento/salir/route.ts",
      "app/(public)/transparencia/datos/[dataset]/route.ts",
      "app/api/health/route.ts",
      "app/api/v1/auth/login/route.ts",
      "app/api/v1/auth/signup/route.ts",
      "app/api/v1/localities/route.ts",
      "app/api/v1/pets/[publicToken]/credential/route.ts",
      "app/auth/callback/route.ts",
      "app/auth/miarg/callback/route.ts",
    ]);
  });

  it("every opt-out carries a non-empty written reason", () => {
    for (const file of handlers) {
      for (const fn of extractExportedAsyncFunctions(readFileSync(file, "utf8"))) {
        if (!fn.hasNoAuthComment) continue;
        expect(`${file}: ${fn.noAuthReason ?? ""}`.length).toBeGreaterThan(file.length + 12);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// findShadowedGuardDefinitions — a guard's NAME has exactly one home
//
// THE HOLE (RN re-run HIGH, 2026-08-22). app/actions/notifications.ts defined
// its own `async function requireUser()` — a bare `auth.getUser()` with no
// erasure, deactivation or maintenance check — and fed it to three writes.
// `requireUser` is on AUTH_GUARDS, so callsAuthGuard() matched the local and
// the fence counted every export in the file as guarded. The coverage rule
// reads a function BODY for a guard's NAME; it cannot tell the real guard from
// a local that borrowed the name. This rule closes that: every recognised name
// is defined in its canonical home and nowhere else.
// ---------------------------------------------------------------------------

describe("findShadowedGuardDefinitions", () => {
  it("flags a file that DEFINES a function named like a guard — THE RED CONTROL", () => {
    // The hole used `requireUser`, a dead name pruned from the list on
    // 2026-08-22 (see "the recognised list carries NO dead name" below). The
    // same shape against a LIVE name is what the rule exists for.
    const src = [
      '"use server";',
      "async function requireLiveUser() {",
      "  const supabase = await createClient();",
      "  const { data: { user } } = await supabase.auth.getUser();",
      '  if (!user) throw new Error("Sesión expirada");',
      "  return user;",
      "}",
      "export async function markReadAction(id: string) {",
      "  const user = await requireLiveUser();",
      "  return mark(user.id, id);",
      "}",
    ].join("\n");
    const offenders = findShadowedGuardDefinitions("app/actions/notifications.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("app/actions/notifications.ts:2");
    expect(offenders[0]).toContain("requireLiveUser");
    // And the shadow is exactly what the coverage rule could not see: with the
    // local in place, findOffenders reads the export as guarded.
    expect(findOffenders("app/actions/notifications.ts", src)).toEqual([]);
  });

  it("flags a const / arrow definition with a guard's name", () => {
    const src = "const requireLiveUser = async () => ({ ok: true, user: { id: 'x' } });";
    const offenders = findShadowedGuardDefinitions("lib/helpers.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("requireLiveUser");
  });

  it("flags an import or export ALIAS onto a guard's name", () => {
    // `import { getUser as requireLiveUser }` puts `requireLiveUser(` in every
    // body that calls it while running something else entirely.
    const imported = 'import { getSessionUser as requireLiveUser } from "@/lib/session";';
    expect(findShadowedGuardDefinitions("app/actions/x.ts", imported)).toHaveLength(1);
    const exported = 'export { getSessionUser as requirePetAccess } from "./session";';
    expect(findShadowedGuardDefinitions("lib/x.ts", exported)).toHaveLength(1);
  });

  it("the recognised list carries NO dead name — every home is non-empty", () => {
    // Until 2026-08-22 four entries — `requireUser`, `requireActiveOrgOrRedirect`,
    // `requireOwnedPet`, `requireOwnedAndAlive` — were recognised by
    // callsAuthGuard and defined NOWHERE in the tree. A dead name is a free
    // pass: whoever defines it first is "the guard" (app/actions/notifications.ts
    // did exactly that with requireUser). They were kept with an EMPTY home so
    // the shadow rule would refuse any definition; pruning them is the stronger
    // control — a name that is not recognised makes its callers read as
    // UNGUARDED (next test) instead of guarded-by-nothing. So: no entry may be
    // empty, and the fence itself refuses one (guardHomeViolations below).
    for (const [name, homes] of Object.entries(GUARD_HOMES)) {
      expect(homes, `${name} is a dead name on the recognised list`).not.toEqual([]);
    }
    for (const dead of [
      "requireUser",
      "requireActiveOrgOrRedirect",
      "requireOwnedPet",
      "requireOwnedAndAlive",
    ]) {
      expect(AUTH_GUARDS as readonly string[]).not.toContain(dead);
      expect(ROUTE_HANDLER_GUARDS).not.toContain(dead);
      expect(PERSONAL_TIER_GUARDS as readonly string[]).not.toContain(dead);
      expect(DELETION_AWARE_GUARDS as readonly string[]).not.toContain(dead);
    }
  });

  it("guardHomeViolations refuses a recognised name with NO home — a dead name cannot re-enter the list", () => {
    const problems = guardHomeViolations({ requireUser: [] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("requireUser");
    expect(problems[0]).toMatch(/no home|dead/i);
  });

  it("a name OFF the list is not a free pass: a local `requireUser()` leaves its callers UNGUARDED", () => {
    // The 2026-08-22 hole, replayed against the pruned list. With `requireUser`
    // no longer recognised, the local is not a shadow of anything — and the
    // export that calls it has no guard call the coverage rule knows, so it is
    // an offender. That is the control the pruning must not weaken.
    const src = [
      '"use server";',
      "async function requireUser() {",
      "  const supabase = await createClient();",
      "  const { data: { user } } = await supabase.auth.getUser();",
      "  return user;",
      "}",
      "export async function markReadAction(id: string) {",
      "  const user = await requireUser();",
      "  return mark(user.id, id);",
      "}",
    ].join("\n");
    expect(findShadowedGuardDefinitions("app/actions/notifications.ts", src)).toEqual([]);
    const offenders = findOffenders("app/actions/notifications.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("markReadAction");
  });

  it("does NOT flag a guard defined in its canonical home", () => {
    const src = "export async function requireLiveUser(options?: RequireLiveUserOptions) { }";
    expect(findShadowedGuardDefinitions("lib/infra/live-user.ts", src)).toEqual([]);
    const local = "async function requireAdminUser(): Promise<{ userId: string }> { }";
    expect(findShadowedGuardDefinitions("app/actions/alert-firings.ts", local)).toEqual([]);
  });

  it("does NOT flag a name that merely STARTS with a guard's name (precision)", () => {
    const src = [
      "async function requireUserProfile() { }",
      "const requireLiveUserResult = await requireLiveUser();",
      "function requireCapabilityOrThrow() { }",
    ].join("\n");
    expect(findShadowedGuardDefinitions("app/actions/x.ts", src)).toEqual([]);
  });

  it("does NOT flag a definition that lives only in a comment", () => {
    const src = [
      "// A bare `async function requireUser()` used to live here. It does not now:",
      "/* const requireLiveUser = () => {} */",
      "export async function markReadAction() { await requireLiveUser(); }",
    ].join("\n");
    expect(findShadowedGuardDefinitions("app/actions/x.ts", src)).toEqual([]);
  });

  it("GUARD_HOMES names every identifier-shaped guard the coverage rules recognise", () => {
    // Parity: a guard added to AUTH_GUARDS / ROUTE_HANDLER_GUARDS without a
    // home entry would be invisible to the shadowing rule — the exact gap that
    // let the dead `requireUser` entry be borrowed.
    const recognised = new Set<string>([...AUTH_GUARDS, ...ROUTE_HANDLER_GUARDS]);
    recognised.delete("auth.getUser"); // a member expression, not a name anyone defines
    expect([...recognised].sort()).toEqual(Object.keys(GUARD_HOMES).sort());
  });

  it("every canonical home still defines its guard (the map cannot rot)", () => {
    expect(guardHomeViolations()).toEqual([]);
  });

  it("the real tree defines no guard outside its home", () => {
    const files = listGuardShadowScanFiles();
    // NON-VACUITY: the scan is tree-wide (app/, src/, lib/), not the action
    // list — a shadow imported from a helper is the same hole one hop away.
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain("app/actions/notifications.ts");
    expect(files).toContain("lib/infra/live-user.ts");
    const offenders = files.flatMap((f) =>
      findShadowedGuardDefinitions(f, readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
