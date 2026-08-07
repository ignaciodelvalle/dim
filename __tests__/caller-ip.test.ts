// Unit tests for callerIp() — lib/rate-limit.ts
//
// callerIp() must return a TRUSTED IP, not a client-controlled one.
//攻撃 vector: the first segment of x-forwarded-for is set by the client.
// An attacker can rotate it to get a fresh rate-limit bucket per request.
//
// Trust order (Vercel / standard reverse proxy):
//   1. x-real-ip  — edge-set, not forwarded from client, always trusted.
//   2. last segment of x-forwarded-for — edge-appended hop, trusted.
//   3. "unknown"  — no proxy headers (local dev / direct invocation).

import { describe, expect, it } from "vitest";

import { callerIp } from "@/lib/infra/rate-limit";

// ---------------------------------------------------------------------------
// Minimal header-getter factory (matches the HeaderGetter interface)
// ---------------------------------------------------------------------------

function makeHeaders(map: Record<string, string | undefined>) {
  return {
    get(name: string): string | null {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("callerIp()", () => {
  it("returns x-real-ip when present — preferred trusted source", () => {
    const hdrs = makeHeaders({ "x-real-ip": "203.0.113.1" });
    expect(callerIp(hdrs)).toBe("203.0.113.1");
  });

  it("trims whitespace from x-real-ip", () => {
    const hdrs = makeHeaders({ "x-real-ip": "  203.0.113.1  " });
    expect(callerIp(hdrs)).toBe("203.0.113.1");
  });

  it("falls back to the LAST segment of x-forwarded-for when x-real-ip is absent", () => {
    // The last hop is edge-appended — trusted.
    const hdrs = makeHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" });
    expect(callerIp(hdrs)).toBe("9.10.11.12");
  });

  it("trims whitespace from the last XFF segment", () => {
    const hdrs = makeHeaders({ "x-forwarded-for": "1.2.3.4,  9.10.11.12  " });
    expect(callerIp(hdrs)).toBe("9.10.11.12");
  });

  it("does NOT return the first XFF segment (the spoofable client-controlled value)", () => {
    // Attacker sends X-Forwarded-For: FAKE, <real-edge-ip>
    // We must return the LAST segment, not the attacker-supplied first one.
    const hdrs = makeHeaders({ "x-forwarded-for": "FAKE-ATTACKER-IP, 192.0.2.99" });
    const result = callerIp(hdrs);
    expect(result).not.toBe("FAKE-ATTACKER-IP");
    expect(result).toBe("192.0.2.99");
  });

  it("handles a single-segment x-forwarded-for (no proxy chain)", () => {
    const hdrs = makeHeaders({ "x-forwarded-for": "198.51.100.7" });
    expect(callerIp(hdrs)).toBe("198.51.100.7");
  });

  it("returns 'unknown' when neither x-real-ip nor x-forwarded-for is present", () => {
    const hdrs = makeHeaders({});
    expect(callerIp(hdrs)).toBe("unknown");
  });

  it("returns 'unknown' when x-forwarded-for is an empty string", () => {
    const hdrs = makeHeaders({ "x-forwarded-for": "" });
    expect(callerIp(hdrs)).toBe("unknown");
  });

  it("returns 'unknown' when x-forwarded-for contains only whitespace/commas", () => {
    const hdrs = makeHeaders({ "x-forwarded-for": " , , " });
    expect(callerIp(hdrs)).toBe("unknown");
  });

  // ---------------------------------------------------------------------------
  // Spoof scenario: attacker sends X-Forwarded-For but x-real-ip is present
  // ---------------------------------------------------------------------------

  it("SPOOF SCENARIO: x-real-ip wins over spoofed XFF first segment", () => {
    // Attacker sends: X-Forwarded-For: 1.2.3.4, <real-edge-ip>
    // Edge also sets: X-Real-IP: <real-edge-ip>
    // callerIp() must return x-real-ip, NOT 1.2.3.4.
    const hdrs = makeHeaders({
      "x-forwarded-for": "1.2.3.4, 203.0.113.99",
      "x-real-ip": "203.0.113.99",
    });
    const result = callerIp(hdrs);
    expect(result).toBe("203.0.113.99");
    expect(result).not.toBe("1.2.3.4");
  });
});
