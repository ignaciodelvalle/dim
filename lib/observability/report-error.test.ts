// Unit tests for the client observability seam (task #56a). Locks the
// structured shape passed to console.error so a future sink swap (Sentry /
// Vercel Observability / etc.) can rely on this payload contract.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportError } from "@/lib/observability/report-error";

describe("reportError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("logs message, stack, and digest in a structured payload", () => {
    const error = Object.assign(new Error("algo explotó"), { digest: "d-abc123" });

    reportError(error);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [, payload] = consoleErrorSpy.mock.calls[0];
    expect(payload).toMatchObject({
      message: "algo explotó",
      digest: "d-abc123",
    });
    expect(payload.stack).toBeDefined();
  });

  it("merges extra context into the payload", () => {
    const error = new Error("boom");

    reportError(error, { route: "ErrorBoundary", homeHref: "/gob" });

    const [, payload] = consoleErrorSpy.mock.calls[0];
    expect(payload).toMatchObject({
      message: "boom",
      route: "ErrorBoundary",
      homeHref: "/gob",
    });
  });

  it("handles an error with no digest", () => {
    const error = new Error("sin digest");

    reportError(error, { route: "global-error" });

    const [, payload] = consoleErrorSpy.mock.calls[0];
    expect(payload.digest).toBeUndefined();
    expect(payload.route).toBe("global-error");
  });
});
