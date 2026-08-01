// Offline guard for the post-mutation redirect fence
// (scripts/check-action-redirect.ts). The fence reads real files; these tests
// pin the two decisions that make it mean anything — what counts as a server
// action, and what counts as a redirect() CALL.
//
// The comment case carries the weight. This codebase documents the N3 contract
// in prose across dozens of files, so a fence that counted words would flag the
// very explanations telling people not to call redirect().

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  countRedirectCalls,
  isServerActionModule,
  listServerActionFiles,
} from "@/scripts/check-action-redirect";

describe("isServerActionModule", () => {
  it("recognises the directive at the top of the file", () => {
    expect(isServerActionModule('"use server";\n\nexport async function a() {}')).toBe(true);
    expect(isServerActionModule("'use server';\n")).toBe(true);
  });

  it("does not treat a plain module as an action module", () => {
    expect(isServerActionModule('import { redirect } from "next/navigation";')).toBe(false);
  });

  it("does not fire on the directive quoted inside prose", () => {
    // A page component explaining that its helpers are NOT "use server".
    expect(isServerActionModule('const note = `mentions "use server" mid-line`;')).toBe(false);
  });
});

describe("countRedirectCalls", () => {
  it("counts real calls", () => {
    expect(countRedirectCalls('redirect("/a");\nredirect("/b");')).toBe(2);
  });

  it("ignores redirect() named in a line comment", () => {
    expect(countRedirectCalls('// never call redirect("/a") here\nconst x = 1;')).toBe(0);
  });

  it("ignores redirect() named in a block comment", () => {
    expect(countRedirectCalls("/**\n * Do not use redirect(target).\n */\nconst x = 1;")).toBe(0);
  });

  it("counts the call but not the comment when both are present", () => {
    expect(countRedirectCalls('// redirect() is banned\nredirect("/a");')).toBe(1);
  });

  it("does not match a longer identifier that merely ends in redirect", () => {
    expect(countRedirectCalls("safeRedirect(target);")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scan coverage
// ---------------------------------------------------------------------------
//
// The fence's only real failure was here, and neither predicate above could see
// it: the globs listed `actions.ts` (plural) but not `action.ts` (singular), so
// every route-colocated action was skipped. The baseline read `{}` and the run
// printed "0 baselined call(s) across 0 file(s)" while three post-mutation
// redirect() calls sat in the tree — and a review cited that empty baseline as
// evidence the debt was being tracked. These tests pin the scan SET, so
// narrowing the globs goes red instead of going quiet.

describe("listServerActionFiles", () => {
  const files = listServerActionFiles();

  it("finds server actions under both naming conventions the repo uses", () => {
    expect(files.some((f) => f.endsWith("/actions.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("/action.ts"))).toBe(true);
  });

  it("scans route-colocated action.ts files under app/", () => {
    // Pinned to a concrete path, not a count: a count drifts with every new
    // action, while this names a file whose disappearance from the scan set is
    // exactly the regression.
    expect(files).toContain(
      "app/org/[orgToken]/mascotas/[publicToken]/microchip/reemplazar/action.ts",
    );
  });

  it("returns only modules that declare themselves server actions", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(isServerActionModule(readFileSync(f, "utf8"))).toBe(true);
    }
  });
});
