// Unit tests for the client observability seam (tasks #56a, #56b).
//
// Locks three things: the payload contract a future provider adapter relies on,
// the redaction guarantee that makes forwarding to a third party acceptable at
// all, and the promise that reporting an error can never itself throw.

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildErrorReport, reportError } from "@/lib/observability/report-error";
import {
  type ErrorSink,
  type RedactedErrorReport,
  resetErrorSink,
  setErrorSink,
} from "@/lib/observability/sink";

/** Installs a capturing sink and returns the array it writes into. */
function captureReports(): RedactedErrorReport[] {
  const received: RedactedErrorReport[] = [];
  const sink: ErrorSink = { name: "test-capture", send: (r) => received.push(r) };
  setErrorSink(sink);
  return received;
}

afterEach(() => {
  resetErrorSink();
  vi.restoreAllMocks();
});

describe("payload contract", () => {
  it("carries message, stack and digest in a structured report", () => {
    const received = captureReports();
    const error = Object.assign(new Error("algo explotó"), { digest: "d-abc123" });

    reportError(error);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ message: "algo explotó", digest: "d-abc123" });
    expect(received[0].stack).toBeDefined();
    expect(received[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("omits digest when the error has none", () => {
    const received = captureReports();

    reportError(new Error("sin digest"), { route: "global-error" });

    expect(received[0].digest).toBeUndefined();
    expect(received[0].context.route).toBe("global-error");
  });

  it("includes the error class name when it is more specific than Error", () => {
    const received = captureReports();

    reportError(new TypeError("x is not a function"));

    expect(received[0].name).toBe("TypeError");
  });

  it("puts allowlisted context under `context`, not at the top level", () => {
    const received = captureReports();

    reportError(new Error("boom"), { route: "ErrorBoundary", homeHref: "/gob" });

    expect(received[0].context).toEqual({ route: "ErrorBoundary", homeHref: "/gob" });
    expect(received[0]).not.toHaveProperty("route");
  });

  it("caps the stack so an unbounded blob cannot ride along", () => {
    const error = new Error("deep");
    error.stack = ["Error: deep", ...Array.from({ length: 40 }, (_, i) => `    at f${i} ()`)].join(
      "\n",
    );

    const report = buildErrorReport(error);

    expect(report.stack?.split("\n")).toHaveLength(7);
  });
});

describe("the context allowlist is closed, and enforced at runtime", () => {
  it("DROPS a key that is not on the allowlist", () => {
    const received = captureReports();

    // A JS caller, an `as never`, or a parsed blob can carry keys the type
    // system never saw. The allowlist has to hold without it.
    reportError(new Error("boom"), {
      route: "ErrorBoundary",
      ownerEmail: "ivan@gmail.com",
      dni: "30123456",
      profile: { address: "Av. Bustillo 1234" },
    } as never);

    expect(received[0].context).toEqual({ route: "ErrorBoundary" });
    const serialized = JSON.stringify(received[0]);
    expect(serialized).not.toContain("ivan@gmail.com");
    expect(serialized).not.toContain("30123456");
    expect(serialized).not.toContain("Bustillo");
  });

  it("scrubs the VALUE of an allowlisted key — the org token leak that exists today", () => {
    const received = captureReports();

    // app/org/[orgToken]/error.tsx really does pass `/org/${orgToken}`.
    reportError(new Error("boom"), { route: "ErrorBoundary", homeHref: "/org/9f3kd82hsn2p" });

    expect(received[0].context.homeHref).toBe("/org/[redacted:token]");
  });

  it("keeps an all-digit correlationId, which the scrubber would otherwise eat", () => {
    const received = captureReports();

    // 8 hex chars; ~2.3% of them are all digits, and the fail-closed 7+ digit
    // rule would redact exactly those. Distinguished by KEY, never by shape.
    reportError(new Error("timeout"), { source: "loadWithTimeout", correlationId: "40318775" });

    expect(received[0].context.correlationId).toBe("40318775");
    expect(received[0].context.source).toBe("loadWithTimeout");
  });
});

describe("redaction happens before the sink ever sees the report", () => {
  it("scrubs PII out of the message", () => {
    const received = captureReports();

    reportError(new Error("titular 30123456 <ivan@gmail.com> tel +54 9 11 1234-5678"));

    const { message } = received[0];
    expect(message).not.toContain("30123456");
    expect(message).not.toContain("ivan@gmail.com");
    expect(message).not.toContain("1234-5678");
  });

  it("scrubs PII out of the stack", () => {
    const received = captureReports();
    const error = new Error("boom");
    error.stack = "Error: boom\n    at load (/p/DIM-BOBB-0022?access_token=abc123XYZ:1:1)";

    reportError(error);

    expect(received[0].stack).not.toContain("DIM-BOBB-0022");
    expect(received[0].stack).not.toContain("abc123XYZ");
  });

  it("hands a third-party sink nothing that the redactor did not clear", () => {
    // The whole safety argument in one test: whatever a provider adapter
    // receives has already been through redaction.
    const received = captureReports();
    const error = Object.assign(new Error("owner ivan@gmail.com dni 30123456"), {
      digest: "d-1",
    });
    error.stack = "Error\n    at x (/libreta/compartir/s7Kd93ptQxLm:1:1)";

    reportError(error, { homeHref: "/org/9f3kd82hsn2p" } as never);

    const serialized = JSON.stringify(received[0]);
    expect(serialized).not.toContain("ivan@gmail.com");
    expect(serialized).not.toContain("30123456");
    expect(serialized).not.toContain("s7Kd93ptQxLm");
    expect(serialized).not.toContain("9f3kd82hsn2p");
  });
});

describe("reporting an error can never make things worse", () => {
  it("does not propagate when the sink throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setErrorSink({
      name: "broken-provider",
      send: () => {
        throw new Error("provider SDK exploded");
      },
    });

    // Inside a React error boundary, a throw here turns a recoverable error
    // screen into an unrecoverable one.
    expect(() => reportError(new Error("boom"))).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("does not forward the original when the error cannot be redacted", () => {
    const received = captureReports();
    const hostile = new Error("placeholder");
    Object.defineProperty(hostile, "message", {
      get() {
        throw new Error("hostile getter");
      },
    });

    expect(() => reportError(hostile)).not.toThrow();
    expect(received).toHaveLength(1);
    expect(received[0].message).toBe("[reportError] failed to build a redacted report");
    expect(received[0].context).toEqual({});
  });
});
