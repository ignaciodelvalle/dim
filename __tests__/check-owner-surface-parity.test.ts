// The owner-surface parity fence, fenced.
//
// A CHECK NOBODY TESTS IS THE FAILURE THIS CHECK IS ABOUT. `scripts/check-
// owner-surface-parity.ts` exists because parity between the owner's web and
// the native app was tracked in prose and the prose rotted. The fence is a
// few hundred lines of import resolution and regex over the live tree; until
// this file existed nothing proved that a dropped kind is NAMED, that a
// renamed export FAILS rather than reporting parity, or that an exclusion
// without a reason is refused.
//
// THE LIVE TREE, MUTATED — not synthetic fixtures. The sibling icon fence
// tests against a hand-built table because its corpus is one file; this one
// reads a hundred, so every case below takes `collectInputs()` and edits ONE
// thing, which keeps each assertion about that one thing. The control case
// (the untouched tree passes) is what every other case is read against.

import { describe, expect, it } from "vitest";

import {
  DECLARED_DIVERGENCES,
  type DeclaredDivergence,
  MIN_CONTRACT_API_KEYS,
  MIN_JOINED_ACTIONS,
  MIN_KINDS,
  MIN_OWNER_ACTIONS,
  MIN_OWNER_GUARDS,
  MIN_USE_SERVER_FILES,
  MIN_V1_USE_CASES,
  type ParityInputs,
  collectInputs,
  evaluate,
  kindsFromMobile,
  resolveUseCaseModule,
} from "@/scripts/check-owner-surface-parity";

const live: ParityInputs = collectInputs();

/** A shallow copy whose arrays can be replaced without touching `live`. */
function mutated(patch: Partial<ParityInputs>): ParityInputs {
  return { ...live, ...patch };
}

/** A "use server" file with one owner-guarded action reaching `useCase`. */
function syntheticAction(opts: {
  path: string;
  specifier: string;
  useCase: string;
  reads?: string;
}): { path: string; src: string } {
  return {
    path: opts.path,
    src: [
      '"use server";',
      `import { ${opts.useCase} } from "${opts.specifier}";`,
      'import { requirePetAccess } from "@/lib/infra/pet-access";',
      "export async function syntheticOwnerAction(publicToken: string) {",
      "  const access = await requirePetAccess(publicToken);",
      "  if (!access.ok) return { error: access.error };",
      `  const result = await ${opts.useCase}({ petId: access.pet.id });`,
      opts.reads
        ? `  return { ok: true, ${opts.reads}: result.value.${opts.reads} };`
        : "  return result;",
      "}",
    ].join("\n"),
  };
}

const failuresMatching = (failures: string[], needle: string) =>
  failures.filter((f) => f.includes(needle));

describe("check-owner-surface-parity — the fence is not vacuous", () => {
  it("passes the live tree, and every declared divergence is one the scan found", () => {
    const verdict = evaluate(live);
    expect(verdict.failures).toEqual([]);
    // Bidirectional: the declaration list IS the finding list, nothing more
    // and nothing less. A declared key the scan cannot find is stale; a found
    // key nobody declared is a failure above.
    const found = verdict.divergences.map((d) => d.key).sort();
    expect(found).toEqual(Object.keys(DECLARED_DIVERGENCES).sort());
  });

  it("measures every scan well above its floor (the floors are not the measurement)", () => {
    const c = evaluate(live).census;
    expect(c.ownerGuards.length).toBeGreaterThanOrEqual(MIN_OWNER_GUARDS);
    expect(c.useServerFiles).toBeGreaterThan(MIN_USE_SERVER_FILES);
    expect(c.ownerActions).toBeGreaterThan(MIN_OWNER_ACTIONS);
    expect(c.joinedActions).toBeGreaterThan(MIN_JOINED_ACTIONS);
    expect(c.v1UseCases).toBeGreaterThan(MIN_V1_USE_CASES);
    expect(c.contractApiKeys).toBeGreaterThan(MIN_CONTRACT_API_KEYS);
    expect(c.kinds.contract).toBeGreaterThan(MIN_KINDS);
    expect(c.kinds.mobile).toBe(c.kinds.contract);
    expect(c.kinds.router).toBe(c.kinds.contract);
  });

  it("the known divergence is among the findings — the case code the app cannot show", () => {
    // If the receipt dimension ever stops seeing this, the derivation has
    // narrowed back to event kinds and the fence is no longer the one the PO
    // asked for.
    const keys = evaluate(live).divergences.map((d) => d.key);
    expect(keys).toContain("read:reportBiteAction.casePublicCode");
    expect(keys).toContain("write:createTattooAction→createTattooForUser");
  });
});

describe("the kind vocabulary — three sources that must agree", () => {
  it("(a) names the kind when the phone drops one", () => {
    const withoutBite = (live.mobileViewModel ?? "").replace('\n  "bite",\n', "\n");
    expect(withoutBite).not.toBe(live.mobileViewModel);
    const failures = evaluate(mutated({ mobileViewModel: withoutBite })).failures;
    const named = failuresMatching(failures, "contract and mobile disagree");
    expect(named).toHaveLength(1);
    expect(named[0]).toContain("in contract only: bite");
    // The router still agrees with the contract: exactly one disagreement.
    expect(failuresMatching(failures, "contract and router disagree")).toEqual([]);
  });

  it("(b) fails on the floor, not on parity, when the export it reads is renamed", () => {
    const renamed = (live.mobileViewModel ?? "").replaceAll("WRITABLE_KINDS", "WRITEABLE_KINDS");
    expect(kindsFromMobile(renamed)).toBeNull();
    const failures = evaluate(mutated({ mobileViewModel: renamed })).failures;
    expect(failuresMatching(failures, "could not derive the mobile kind vocabulary")).toHaveLength(
      1,
    );
    // And it does NOT go on to report a disagreement it cannot compute.
    expect(failuresMatching(failures, "disagree")).toEqual([]);
  });

  it("fails on an unreadable contract or router source the same way", () => {
    expect(
      failuresMatching(
        evaluate(mutated({ contractRecordEvent: null })).failures,
        "could not derive the contract kind vocabulary",
      ),
    ).toHaveLength(1);
    expect(
      failuresMatching(
        evaluate(mutated({ routerWriters: null })).failures,
        "could not derive the router kind vocabulary",
      ),
    ).toHaveLength(1);
  });
});

describe("the join — a web door the app lacks is named", () => {
  it("names the action and the use-case when no v1 route reaches it", () => {
    const extra = syntheticAction({
      path: "src/modules/pets/synthetic-actions.ts",
      specifier: "./application/synthetic/do-something",
      useCase: "doSomething",
    });
    const verdict = evaluate(mutated({ webActionFiles: [...live.webActionFiles, extra] }));
    const named = failuresMatching(verdict.failures, "write:syntheticOwnerAction→doSomething");
    expect(named).toHaveLength(1);
    expect(named[0]).toContain("src/modules/pets/application/synthetic/do-something");
  });

  it("names the field when the web reads a receipt fact no v1 read carries", () => {
    // createVaccination IS reached by v1 (the events router), so the action
    // joins; what it reads off the result is then judged.
    const extra = syntheticAction({
      path: "app/actions/synthetic.ts",
      specifier: "@/src/modules/events/application/medical/vaccination-use-case",
      useCase: "createVaccination",
      reads: "secretReceiptCode",
    });
    const verdict = evaluate(mutated({ webActionFiles: [...live.webActionFiles, extra] }));
    expect(
      failuresMatching(verdict.failures, "read:syntheticOwnerAction.secretReceiptCode"),
    ).toHaveLength(1);
    expect(failuresMatching(verdict.failures, "write:syntheticOwnerAction")).toEqual([]);
  });

  it("resolves the relative and the absolute spelling of one module to one id", () => {
    // The whole join rests on this: the web action inside src/modules/events
    // says `./application/x`, the v1 route says `@/src/modules/events/application/x`.
    expect(resolveUseCaseModule("src/modules/events/actions.ts", "./application/x/y")).toBe(
      "src/modules/events/application/x/y",
    );
    expect(
      resolveUseCaseModule("app/api/v1/z/route.ts", "@/src/modules/events/application/x/y"),
    ).toBe("src/modules/events/application/x/y");
    expect(resolveUseCaseModule("app/x.ts", "@/lib/infra/pets")).toBeNull();
    expect(
      resolveUseCaseModule("src/modules/events/actions.ts", "./infrastructure/repo"),
    ).toBeNull();
  });

  it("an empty app set fails the floor rather than declaring every web door a gap", () => {
    const failures = evaluate(mutated({ v1Files: [] })).failures;
    expect(failuresMatching(failures, "use-cases reached from app/api/v1 — found 0")).toHaveLength(
      1,
    );
  });

  it("an empty guard set fails the floor rather than seeing no owner actions", () => {
    const failures = evaluate(
      mutated({ guardSources: live.guardSources.map((g) => ({ ...g, src: "" })) }),
    ).failures;
    expect(failuresMatching(failures, "owner guard exports")).toHaveLength(1);
    expect(failuresMatching(failures, "owner-guarded actions — found 0")).toHaveLength(1);
  });
});

describe("the declarations — explicit, reasoned, live", () => {
  it("refuses an entry without a reason or without what would close it", () => {
    const hollow: Record<string, DeclaredDivergence> = {
      ...DECLARED_DIVERGENCES,
      "read:reportBiteAction.casePublicCode": { reason: "  ", closes: "" },
    };
    const failures = evaluate(live, hollow).failures;
    expect(failuresMatching(failures, "declared without a reason")).toHaveLength(1);
  });

  it("refuses a declaration the scan no longer finds", () => {
    const stale: Record<string, DeclaredDivergence> = {
      ...DECLARED_DIVERGENCES,
      "write:ghostAction→ghostUseCase": { reason: "was true once", closes: "nothing" },
    };
    const failures = evaluate(live, stale).failures;
    const named = failuresMatching(failures, "stale declaration");
    expect(named).toHaveLength(1);
    expect(named[0]).toContain("write:ghostAction→ghostUseCase");
  });

  it("refuses an undeclared divergence, naming the remedy", () => {
    const { "read:reportBiteAction.casePublicCode": _dropped, ...rest } = DECLARED_DIVERGENCES;
    const failures = evaluate(live, rest).failures;
    const named = failuresMatching(
      failures,
      "divergence not declared: read:reportBiteAction.casePublicCode",
    );
    expect(named).toHaveLength(1);
    expect(named[0]).toContain("DECLARED_DIVERGENCES");
  });
});
