// @vitest-environment jsdom
//
// /gob/analitica — bug fix (qa-triage-2026-07-23, finding #11): this typo of
// /gob/analytics used to 404. Regression guard: it now redirects to
// /gob/analytics, preserving every query param.

import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

import GobAnaliticaRedirectPage from "./page";

describe("/gob/analitica — redirects to /gob/analytics (typo fix)", () => {
  it("redirects to /gob/analytics with no query string when no params are given", async () => {
    await GobAnaliticaRedirectPage({ searchParams: Promise.resolve({}) });
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/gob/analytics");
  });

  it("preserves every original search param", async () => {
    await GobAnaliticaRedirectPage({
      searchParams: Promise.resolve({
        period: "12m",
        province: "AR-C",
      }),
    });
    const url = new URL(redirectMock.mock.calls.at(-1)?.[0] as string, "http://localhost");
    expect(url.pathname).toBe("/gob/analytics");
    expect(url.searchParams.get("period")).toBe("12m");
    expect(url.searchParams.get("province")).toBe("AR-C");
  });

  it("preserves repeated array-valued params", async () => {
    await GobAnaliticaRedirectPage({
      searchParams: Promise.resolve({ tag: ["a", "b"] }),
    });
    const url = new URL(redirectMock.mock.calls.at(-1)?.[0] as string, "http://localhost");
    expect(url.searchParams.getAll("tag")).toEqual(["a", "b"]);
  });
});
