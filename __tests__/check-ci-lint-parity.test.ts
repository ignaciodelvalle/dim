// Offline guard for the CI ↔ verify parity fence
// (scripts/check-ci-lint-parity.ts). The fence reads two real files; these
// tests pin the two parts that decide its verdict — what it derives from
// `verify`, and what it accepts as proof a lint runs in CI.
//
// The second one carries the weight. The fence's whole job is to notice a lint
// that exists in prose but not in the pipeline, so a comment mentioning a lint
// must NOT count as running it.

import { describe, expect, it } from "vitest";

import {
  lintsInVerify,
  lintsInWorkflow,
  missingFromWorkflow,
} from "@/scripts/check-ci-lint-parity";

const VERIFY = "pnpm typecheck && pnpm lint && pnpm lint:tokens && pnpm lint:rls && pnpm build";

describe("lintsInVerify", () => {
  it("keeps only the lint:* links of the && chain", () => {
    expect(lintsInVerify(VERIFY)).toEqual(["lint:tokens", "lint:rls"]);
  });

  it("does not mistake bare `lint` (Biome) for a lint:* script", () => {
    expect(lintsInVerify("pnpm lint && pnpm lint:rls")).toEqual(["lint:rls"]);
  });

  it("returns nothing when the script has no lints — the caller treats that as a broken parse", () => {
    expect(lintsInVerify("pnpm typecheck && pnpm build")).toEqual([]);
  });
});

describe("lintsInWorkflow", () => {
  it("collects a lint from any job, however the step is written", () => {
    const yaml = [
      "      - name: Lint",
      "        run: pnpm lint:tokens && pnpm lint:rls",
      "      - name: DB fences",
      "        run: >-",
      "          pnpm lint:spine &&",
      "          pnpm lint:locality",
    ].join("\n");
    expect([...lintsInWorkflow(yaml)].sort()).toEqual([
      "lint:locality",
      "lint:rls",
      "lint:spine",
      "lint:tokens",
    ]);
  });

  it("does NOT count a lint that is only named in a comment", () => {
    const yaml = [
      "      - name: Lint",
      "        # lint:seed-ids is documented here but never invoked — this is",
      "        # exactly the false pass the fence exists to prevent.",
      "        run: pnpm lint:tokens",
    ].join("\n");
    const found = lintsInWorkflow(yaml);
    expect(found.has("lint:tokens")).toBe(true);
    expect(found.has("lint:seed-ids")).toBe(false);
  });

  it("does not count a trailing comment on an otherwise real run line", () => {
    const yaml = "        run: pnpm lint:tokens # and someday pnpm lint:brand";
    const found = lintsInWorkflow(yaml);
    expect(found.has("lint:tokens")).toBe(true);
    expect(found.has("lint:brand")).toBe(false);
  });
});

describe("missingFromWorkflow", () => {
  it("names every lint verify runs and CI does not", () => {
    expect(missingFromWorkflow(VERIFY, "run: pnpm lint:tokens")).toEqual(["lint:rls"]);
  });

  it("is empty when the workflow covers all of them", () => {
    expect(missingFromWorkflow(VERIFY, "run: pnpm lint:tokens && pnpm lint:rls")).toEqual([]);
  });

  it("ignores lints CI runs that verify does not — parity is one-directional", () => {
    expect(missingFromWorkflow("pnpm lint:rls", "pnpm lint:rls && pnpm lint:extra")).toEqual([]);
  });
});
