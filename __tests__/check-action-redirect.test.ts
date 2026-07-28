// Offline guard for the post-mutation redirect fence
// (scripts/check-action-redirect.ts). The fence reads real files; these tests
// pin the two decisions that make it mean anything — what counts as a server
// action, and what counts as a redirect() CALL.
//
// The comment case carries the weight. This codebase documents the N3 contract
// in prose across dozens of files, so a fence that counted words would flag the
// very explanations telling people not to call redirect().

import { describe, expect, it } from "vitest";

import { countRedirectCalls, isServerActionModule } from "@/scripts/check-action-redirect";

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
