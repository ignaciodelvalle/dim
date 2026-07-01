// Unit tests for lib/org-setup-checklist.ts — Wave 3 Item 19: Org onboarding checklist.
//
// Coverage:
//   1. deriveSetupSteps — base steps always present (coverage, members, verification).
//   2. Services step omitted when canCreateServices=false; present when true.
//   3. Capacity step present for shelter; absent for clinic, rescue_network, other.
//   4. Each step's done/pending derived correctly from input fields.
//   5. isSetupComplete — true only when ALL steps done; false when any pending.
//   6. firstPendingStep — returns first pending step; null when all done.
//   7. Auto-hide: verified + configured org → all steps done.
//
// Pure unit tests — no DB access required.

import { describe, expect, it } from "vitest";

import {
  type OrgSetupInput,
  deriveSetupSteps,
  firstPendingStep,
  isSetupComplete,
} from "@/lib/infra/org-setup-checklist";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_INPUT: OrgSetupInput = {
  orgType: "shelter",
  hasCoverage: false,
  memberCount: 1,
  canCreateServices: false,
  hasServices: false,
  hasCapacityDeclared: false,
  isVerified: false,
};

function makeInput(overrides: Partial<OrgSetupInput> = {}): OrgSetupInput {
  return { ...BASE_INPUT, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. Base steps always present
// ---------------------------------------------------------------------------

describe("deriveSetupSteps — base steps", () => {
  it("always includes coverage, members, and verification steps", () => {
    const steps = deriveSetupSteps(makeInput());
    const keys = steps.map((s) => s.key);
    expect(keys).toContain("coverage");
    expect(keys).toContain("members");
    expect(keys).toContain("verification");
  });

  it("returns steps in deterministic order: coverage → members → [services] → [capacity] → verification", () => {
    const steps = deriveSetupSteps(makeInput({ canCreateServices: true, orgType: "shelter" }));
    const keys = steps.map((s) => s.key);
    expect(keys).toEqual(["coverage", "members", "services", "capacity", "verification"]);
  });
});

// ---------------------------------------------------------------------------
// 2. Services step gating
// ---------------------------------------------------------------------------

describe("deriveSetupSteps — services step", () => {
  it("omits services step when canCreateServices=false", () => {
    const steps = deriveSetupSteps(makeInput({ canCreateServices: false }));
    expect(steps.find((s) => s.key === "services")).toBeUndefined();
  });

  it("includes services step when canCreateServices=true", () => {
    const steps = deriveSetupSteps(makeInput({ canCreateServices: true }));
    expect(steps.find((s) => s.key === "services")).toBeDefined();
  });

  it("marks services done when hasServices=true", () => {
    const steps = deriveSetupSteps(makeInput({ canCreateServices: true, hasServices: true }));
    const svc = steps.find((s) => s.key === "services");
    expect(svc?.done).toBe(true);
  });

  it("marks services pending when hasServices=false", () => {
    const steps = deriveSetupSteps(makeInput({ canCreateServices: true, hasServices: false }));
    const svc = steps.find((s) => s.key === "services");
    expect(svc?.done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Capacity step gating by org_type
// ---------------------------------------------------------------------------

describe("deriveSetupSteps — capacity step", () => {
  it("includes capacity step for shelter", () => {
    const steps = deriveSetupSteps(makeInput({ orgType: "shelter" }));
    expect(steps.find((s) => s.key === "capacity")).toBeDefined();
  });

  it("omits capacity step for clinic", () => {
    const steps = deriveSetupSteps(makeInput({ orgType: "clinic" }));
    expect(steps.find((s) => s.key === "capacity")).toBeUndefined();
  });

  it("omits capacity step for rescue_network", () => {
    const steps = deriveSetupSteps(makeInput({ orgType: "rescue_network" }));
    expect(steps.find((s) => s.key === "capacity")).toBeUndefined();
  });

  it("omits capacity step for other", () => {
    const steps = deriveSetupSteps(makeInput({ orgType: "other" }));
    expect(steps.find((s) => s.key === "capacity")).toBeUndefined();
  });

  it("marks capacity done when hasCapacityDeclared=true", () => {
    const steps = deriveSetupSteps(makeInput({ orgType: "shelter", hasCapacityDeclared: true }));
    const cap = steps.find((s) => s.key === "capacity");
    expect(cap?.done).toBe(true);
  });

  it("marks capacity pending when hasCapacityDeclared=false", () => {
    const steps = deriveSetupSteps(makeInput({ orgType: "shelter", hasCapacityDeclared: false }));
    const cap = steps.find((s) => s.key === "capacity");
    expect(cap?.done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Each step's done/pending derivation
// ---------------------------------------------------------------------------

describe("deriveSetupSteps — step done/pending derivation", () => {
  it("coverage is done when hasCoverage=true", () => {
    const steps = deriveSetupSteps(makeInput({ hasCoverage: true }));
    expect(steps.find((s) => s.key === "coverage")?.done).toBe(true);
  });

  it("coverage is pending when hasCoverage=false", () => {
    const steps = deriveSetupSteps(makeInput({ hasCoverage: false }));
    expect(steps.find((s) => s.key === "coverage")?.done).toBe(false);
  });

  it("members is done when memberCount > 1 (someone beyond admin was invited)", () => {
    const steps = deriveSetupSteps(makeInput({ memberCount: 2 }));
    expect(steps.find((s) => s.key === "members")?.done).toBe(true);
  });

  it("members is pending when memberCount = 1 (only admin)", () => {
    const steps = deriveSetupSteps(makeInput({ memberCount: 1 }));
    expect(steps.find((s) => s.key === "members")?.done).toBe(false);
  });

  it("verification is done when isVerified=true", () => {
    const steps = deriveSetupSteps(makeInput({ isVerified: true }));
    expect(steps.find((s) => s.key === "verification")?.done).toBe(true);
  });

  it("verification is pending when isVerified=false", () => {
    const steps = deriveSetupSteps(makeInput({ isVerified: false }));
    expect(steps.find((s) => s.key === "verification")?.done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. isSetupComplete
// ---------------------------------------------------------------------------

describe("isSetupComplete", () => {
  it("returns false when any step is pending", () => {
    // All pending (baseline input).
    const steps = deriveSetupSteps(makeInput());
    expect(isSetupComplete(steps)).toBe(false);
  });

  it("returns false when only some steps are done", () => {
    const steps = deriveSetupSteps(
      makeInput({ hasCoverage: true, memberCount: 2, isVerified: false }),
    );
    expect(isSetupComplete(steps)).toBe(false);
  });

  it("returns true when all applicable steps are done (shelter fully configured)", () => {
    const steps = deriveSetupSteps(
      makeInput({
        orgType: "shelter",
        hasCoverage: true,
        memberCount: 2,
        canCreateServices: false,
        hasCapacityDeclared: true,
        isVerified: true,
      }),
    );
    expect(isSetupComplete(steps)).toBe(true);
  });

  it("returns true for verified clinic with coverage + members (no capacity/services required)", () => {
    const steps = deriveSetupSteps(
      makeInput({
        orgType: "clinic",
        hasCoverage: true,
        memberCount: 3,
        canCreateServices: false,
        isVerified: true,
      }),
    );
    expect(isSetupComplete(steps)).toBe(true);
  });

  it("returns true for shelter with services when all steps including services are done", () => {
    const steps = deriveSetupSteps(
      makeInput({
        orgType: "shelter",
        hasCoverage: true,
        memberCount: 2,
        canCreateServices: true,
        hasServices: true,
        hasCapacityDeclared: true,
        isVerified: true,
      }),
    );
    expect(isSetupComplete(steps)).toBe(true);
  });

  it("returns false when services step exists but hasServices=false", () => {
    const steps = deriveSetupSteps(
      makeInput({
        orgType: "shelter",
        hasCoverage: true,
        memberCount: 2,
        canCreateServices: true,
        hasServices: false, // services not loaded yet
        hasCapacityDeclared: true,
        isVerified: true,
      }),
    );
    expect(isSetupComplete(steps)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. firstPendingStep
// ---------------------------------------------------------------------------

describe("firstPendingStep", () => {
  it("returns the first pending step when some are done", () => {
    // coverage done, members still pending
    const steps = deriveSetupSteps(makeInput({ hasCoverage: true, memberCount: 1 }));
    const first = firstPendingStep(steps);
    expect(first?.key).toBe("members");
  });

  it("returns coverage as first when everything is pending", () => {
    const steps = deriveSetupSteps(makeInput());
    const first = firstPendingStep(steps);
    expect(first?.key).toBe("coverage");
  });

  it("returns null when all steps are done", () => {
    const steps = deriveSetupSteps(
      makeInput({
        orgType: "clinic",
        hasCoverage: true,
        memberCount: 2,
        isVerified: true,
      }),
    );
    const first = firstPendingStep(steps);
    expect(first).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Auto-hide: checklist does not show for fully configured orgs
// ---------------------------------------------------------------------------

describe("auto-hide behavior", () => {
  it("a new empty shelter has no steps done", () => {
    const steps = deriveSetupSteps(makeInput({ orgType: "shelter" }));
    const doneCount = steps.filter((s) => s.done).length;
    expect(doneCount).toBe(0);
    expect(isSetupComplete(steps)).toBe(false);
  });

  it("a verified, configured shelter has all steps done → checklist hides", () => {
    const steps = deriveSetupSteps(
      makeInput({
        orgType: "shelter",
        hasCoverage: true,
        memberCount: 5,
        canCreateServices: false,
        hasCapacityDeclared: true,
        isVerified: true,
      }),
    );
    expect(isSetupComplete(steps)).toBe(true);
  });
});
