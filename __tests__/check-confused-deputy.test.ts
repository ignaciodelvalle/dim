/**
 * Unit tests for scripts/check-confused-deputy.ts helpers.
 *
 * Pure fixture tests — no filesystem I/O. Exercises the "org-token confused
 * deputy" heuristic against known-bad and known-good inline source strings
 * modelled on the real transfers / service-offerings / schedule-rules actions.
 */

import { describe, expect, it } from "vitest";

import { extractExportedAsyncFunctions } from "@/scripts/check-authz-guards";
import {
  BARE_REQUIRE_CAPABILITY_RE,
  CONFUSED_DEPUTY_ALLOWLIST,
  callsBareRequireCapability,
  callsRequireCapabilityForOrgToken,
  findConfusedDeputyOffenders,
  hasOrgTokenParam,
  isConfusedDeputyOffender,
  signatureParamList,
} from "@/scripts/check-confused-deputy";

const only = (src: string) => extractExportedAsyncFunctions(src)[0];

// ---------------------------------------------------------------------------
// BARE_REQUIRE_CAPABILITY_RE — single-arg vs two-arg (pinned) form
// ---------------------------------------------------------------------------

describe("BARE_REQUIRE_CAPABILITY_RE", () => {
  it("matches the bare single-argument form", () => {
    expect(BARE_REQUIRE_CAPABILITY_RE.test('requireCapability("custody.transfer")')).toBe(true);
    expect(BARE_REQUIRE_CAPABILITY_RE.test("requireCapability('bite.report')")).toBe(true);
  });

  it("does NOT match the two-argument (org-pinned) form", () => {
    expect(
      BARE_REQUIRE_CAPABILITY_RE.test('requireCapability("member.invite", input.organizationId)'),
    ).toBe(false);
    expect(
      BARE_REQUIRE_CAPABILITY_RE.test('requireCapability("org.transfer.accept", receiverOrg.id)'),
    ).toBe(false);
  });

  it("does NOT match requireCapabilityForOrgToken", () => {
    expect(
      BARE_REQUIRE_CAPABILITY_RE.test('requireCapabilityForOrgToken("custody.transfer", orgToken)'),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signatureParamList / hasOrgTokenParam
// ---------------------------------------------------------------------------

describe("signatureParamList + hasOrgTokenParam", () => {
  it("extracts a positional param list and detects an org token param", () => {
    const src = [
      "export async function transferCustodyAction(",
      "  orgToken: string,",
      "  publicToken: string,",
      "  _previous: TransferCustodyFormState,",
      "  formData: FormData,",
      "): Promise<TransferCustodyFormState> {",
      "  return run();",
      "}",
    ].join("\n");
    const params = signatureParamList(only(src).body);
    expect(params).toContain("orgToken");
    expect(hasOrgTokenParam(params)).toBe(true);
  });

  it("detects a token nested inside a destructured object param", () => {
    const src = [
      "export async function acceptCrossOrgTransferAction(input: {",
      "  receiverOrgToken: string;",
      "  casePublicCode: string;",
      "}): Promise<CrossOrgTransferResult> { return run(); }",
    ].join("\n");
    expect(hasOrgTokenParam(signatureParamList(only(src).body))).toBe(true);
  });

  it("does NOT treat publicToken (the PET token) as an org token", () => {
    const src = [
      "export async function setListingAction(input: { petPublicToken: string }) {",
      "  return run();",
      "}",
    ].join("\n");
    expect(hasOrgTokenParam(signatureParamList(only(src).body))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isConfusedDeputyOffender — the full heuristic
// ---------------------------------------------------------------------------

describe("isConfusedDeputyOffender", () => {
  it("FLAGS the R11 pre-fix form (orgToken param + bare requireCapability)", () => {
    const src = [
      "export async function transferCustodyAction(orgToken: string, publicToken: string) {",
      '  const auth = await requireCapability("custody.transfer");',
      "  if (auth.error !== null) return { error: auth.error };",
      "  return run();",
      "}",
    ].join("\n");
    expect(isConfusedDeputyOffender(only(src))).toBe(true);
  });

  it("does NOT flag the R11 post-fix form (requireCapabilityForOrgToken)", () => {
    const src = [
      "export async function transferCustodyAction(orgToken: string, publicToken: string) {",
      '  const auth = await requireCapabilityForOrgToken("custody.transfer", orgToken);',
      "  if (auth.error !== null) return { error: auth.error };",
      "  return run();",
      "}",
    ].join("\n");
    expect(isConfusedDeputyOffender(only(src))).toBe(false);
  });

  it("does NOT flag a two-argument (org-pinned) requireCapability", () => {
    // decomiso pattern: resolve the org from the token first, pin the check to it.
    const src = [
      "export async function acceptDecomisoAction(input: { receiverOrgToken: string }) {",
      "  const receiverOrg = await findOrgByToken(input.receiverOrgToken);",
      '  const auth = await requireCapability("org.transfer.accept", receiverOrg.id);',
      "  return run();",
      "}",
    ].join("\n");
    expect(isConfusedDeputyOffender(only(src))).toBe(false);
  });

  it("does NOT flag a bare requireCapability with no org-token param", () => {
    // adoption pattern: session-default org, scoped by petPublicToken in the use-case.
    const src = [
      "export async function setAdoptionEligibilityAction(input: { petPublicToken: string }) {",
      '  const auth = await requireCapability("intake.create");',
      "  return run();",
      "}",
    ].join("\n");
    expect(isConfusedDeputyOffender(only(src))).toBe(false);
  });

  it("does NOT flag a two-arg call whose docstring mentions the bare form (chip-match pattern)", () => {
    // Regression: the fix comment literally writes requireCapability("intake.create")
    // to explain why it pins the check. Comment text must not count as a call.
    const src = [
      "export async function confirmChipMatchAction(input: { orgToken: string }) {",
      '  // requireCapability("intake.create") alone resolves the session default — so',
      "  // we resolve the org from the token and pin the check to it.",
      "  const orgAccess = await requireOrgAccessByToken(input.orgToken);",
      '  const auth = await requireCapability("intake.create", orgAccess.organization.id);',
      "  return run();",
      "}",
    ].join("\n");
    expect(isConfusedDeputyOffender(only(src))).toBe(false);
  });

  it("does NOT flag an inner writer (guarded upstream)", () => {
    const src = [
      "export async function transferCustodyForOrg(orgToken: string, actorUserId: string) {",
      '  const auth = await requireCapability("custody.transfer");',
      "  return run();",
      "}",
    ].join("\n");
    expect(isConfusedDeputyOffender(only(src))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findConfusedDeputyOffenders — located lines + allowlist
// ---------------------------------------------------------------------------

describe("findConfusedDeputyOffenders", () => {
  it("returns a located line for each offender and skips pinned siblings", () => {
    const src = [
      "export async function badAction(orgToken: string) {",
      '  const auth = await requireCapability("service_offering.create");',
      "  return run();",
      "}",
      "export async function goodAction(orgToken: string) {",
      '  const auth = await requireCapabilityForOrgToken("service_offering.create", orgToken);',
      "  return run();",
      "}",
    ].join("\n");
    const offenders = findConfusedDeputyOffenders("app/actions/x.ts", src);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("badAction");
    expect(offenders[0]).toMatch(/app\/actions\/x\.ts:1/);
  });

  it("excludes an allowlisted offender", () => {
    const key = Object.keys(CONFUSED_DEPUTY_ALLOWLIST)[0];
    expect(key).toBeDefined();
    const [relPath, name] = key.split("#");
    const src = [
      `export async function ${name}(orgToken: string) {`,
      '  const auth = await requireCapability("bite.report");',
      "  return run();",
      "}",
    ].join("\n");
    // Sanity: it IS an offender shape…
    expect(isConfusedDeputyOffender(only(src))).toBe(true);
    // …but the allowlist entry keeps it out of the reported set.
    expect(findConfusedDeputyOffenders(relPath, src)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Guard helper smoke tests
// ---------------------------------------------------------------------------

describe("guard helpers", () => {
  it("callsBareRequireCapability / callsRequireCapabilityForOrgToken discriminate", () => {
    expect(callsBareRequireCapability('await requireCapability("x")')).toBe(true);
    expect(callsRequireCapabilityForOrgToken('await requireCapabilityForOrgToken("x", t)')).toBe(
      true,
    );
    expect(callsRequireCapabilityForOrgToken('await requireCapability("x")')).toBe(false);
  });
});
