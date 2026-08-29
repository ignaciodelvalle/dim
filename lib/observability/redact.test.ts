// Tests for the client error-report redaction layer (task #56b).
//
// These are the tests that decide whether it is safe to point this seam at a
// third party at all. Each one carries a real PII shape from this product's
// domain, not a synthetic placeholder.

import { describe, expect, it } from "vitest";

import { redactContextValue, redactText } from "@/lib/observability/redact";

describe("redactText — the four shapes the privacy checklist names", () => {
  it("removes an Argentine DNI (8 digits) from an error message", () => {
    const out = redactText("no se encontró el titular con documento 30123456");

    expect(out).not.toContain("30123456");
    expect(out).toContain("[redacted:digits]");
  });

  it("removes a 7-digit DNI too (the short end of the Argentine space)", () => {
    const out = redactText("dni=4123456 rejected");

    expect(out).not.toContain("4123456");
  });

  it("removes a DIM pet public token", () => {
    const out = redactText("failed to load credential DIM-BOBB-0022");

    expect(out).not.toContain("DIM-BOBB-0022");
    expect(out).toContain("[redacted:credential]");
  });

  it("removes CAS- and DEN- product codes as well", () => {
    const out = redactText("caso CAS-A1B2-C3D4 y denuncia DEN-9Z8Y-7X6W");

    expect(out).not.toContain("CAS-A1B2-C3D4");
    expect(out).not.toContain("DEN-9Z8Y-7X6W");
  });

  it("removes an email address", () => {
    const out = redactText("owner ivan.greve+dim@gmail.com could not be notified");

    expect(out).not.toContain("ivan.greve+dim@gmail.com");
    expect(out).not.toContain("gmail.com");
    expect(out).toContain("[redacted:email]");
  });

  it("removes an Argentine phone number in international form", () => {
    const out = redactText("contacto de emergencia +54 9 11 1234-5678 no responde");

    expect(out).not.toContain("1234-5678");
    expect(out).toContain("[redacted:phone]");
  });

  it("removes a bare 10-digit local phone number", () => {
    const out = redactText("tel 1123456789 invalido");

    expect(out).not.toContain("1123456789");
  });
});

describe("redactText — tokens that ARE the authorization", () => {
  it("removes a libreta share token carried as a path segment", () => {
    const out = redactText("GET /libreta/compartir/s7Kd93ptQxLm failed with 500");

    expect(out).not.toContain("s7Kd93ptQxLm");
    expect(out).toContain("[redacted:token]");
  });

  it("removes an org portal token from a homeHref-shaped path", () => {
    const out = redactText("/org/9f3kd82hsn2p");

    expect(out).not.toContain("9f3kd82hsn2p");
  });

  it("removes a Supabase JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g";
    const out = redactText(`fetch failed: ${jwt}`);

    expect(out).not.toContain(jwt);
    expect(out).toContain("[redacted:jwt]");
  });

  it("removes an Authorization header echoed into a message", () => {
    const out = redactText("401 with header Bearer sk_live_9aB7cD2eF4gH6jK8");

    expect(out).not.toContain("sk_live_9aB7cD2eF4gH6jK8");
    expect(out).toContain("[redacted:authorization]");
  });

  it("keeps a sensitive query key but drops its value", () => {
    const out = redactText("navigation to /verificar?access_token=abc123XYZdef&page=2 threw");

    expect(out).not.toContain("abc123XYZdef");
    expect(out).toContain("access_token=[redacted]");
    // Non-sensitive params stay — the shape of the failing request is signal.
    expect(out).toContain("page=2");
  });
});

describe("redactText — does not destroy the debugging signal", () => {
  it("leaves a plain route path intact", () => {
    expect(redactText("/mis-mascotas")).toBe("/mis-mascotas");
    expect(redactText("/gob/panorama")).toBe("/gob/panorama");
  });

  it("leaves ordinary prose and small numbers intact", () => {
    const message = "loadWithTimeout timed out after 10000 ms (attempt 3)";

    expect(redactText(message)).toBe(message);
  });

  it("scrubs a stack frame's query string without eating the frame", () => {
    const stack = "at Page (/app/(public)/p/page.tsx:42:11)";

    expect(redactText(stack)).toContain("page.tsx:42:11");
  });
});

describe("redactContextValue — only primitives survive", () => {
  it("scrubs a string value", () => {
    expect(redactContextValue("/org/9f3kd82hsn2p")).toBe("/org/[redacted:token]");
  });

  it("passes finite numbers and booleans through", () => {
    expect(redactContextValue(42)).toBe(42);
    expect(redactContextValue(true)).toBe(true);
    expect(redactContextValue(false)).toBe(false);
  });

  it("drops a non-finite number", () => {
    expect(redactContextValue(Number.NaN)).toBeUndefined();
    expect(redactContextValue(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("drops an object outright rather than guessing at its keys", () => {
    // This is the case that matters: a caller attaching a whole profile row.
    expect(redactContextValue({ dniHash: "abc", email: "a@b.com" })).toBeUndefined();
    expect(redactContextValue(["30123456"])).toBeUndefined();
    expect(redactContextValue(() => "x")).toBeUndefined();
  });
});
