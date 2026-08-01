// Unit tests for the "identity still provisional" predicate.
//
// The rule must reproduce exactly what the handle_new_user trigger writes
// (`split_part(email, '@', 1)`), and must NOT fire on names the trigger could
// never have produced.

import { describe, expect, it } from "vitest";

import { emailLocalPart, isIdentityPending } from "@/lib/domain/identity-completeness";

describe("emailLocalPart", () => {
  it("returns the segment before the first @, like Postgres split_part(email, '@', 1)", () => {
    expect(emailLocalPart("ana.perez@gmail.com")).toBe("ana.perez");
  });

  it("keeps the plus-addressing suffix — it is part of the local part", () => {
    expect(emailLocalPart("ignaciodelvalle2014+cursor-owner2@gmail.com")).toBe(
      "ignaciodelvalle2014+cursor-owner2",
    );
  });

  it("splits on the FIRST @, not the last (mirrors split_part, not lastIndexOf)", () => {
    // Malformed, but the trigger would store "a" — so must this.
    expect(emailLocalPart("a@b@c.com")).toBe("a");
  });

  it("returns the whole string when there is no @", () => {
    expect(emailLocalPart("nobody")).toBe("nobody");
  });

  it("returns empty string for null / undefined / empty email", () => {
    expect(emailLocalPart(null)).toBe("");
    expect(emailLocalPart(undefined)).toBe("");
    expect(emailLocalPart("")).toBe("");
  });
});

describe("isIdentityPending", () => {
  const EMAIL = "ignaciodelvalle2014+cursor-owner2@gmail.com";

  it("flags the exact staging defect: display_name === email local part", () => {
    expect(
      isIdentityPending({ displayName: "ignaciodelvalle2014+cursor-owner2", email: EMAIL }),
    ).toBe(true);
  });

  it("flags it case-insensitively — casing is not evidence of a real name", () => {
    expect(
      isIdentityPending({ displayName: "IgnacioDelValle2014+Cursor-Owner2", email: EMAIL }),
    ).toBe(true);
  });

  it("flags a blank or whitespace-only display_name", () => {
    expect(isIdentityPending({ displayName: "", email: EMAIL })).toBe(true);
    expect(isIdentityPending({ displayName: "   ", email: EMAIL })).toBe(true);
    expect(isIdentityPending({ displayName: null, email: EMAIL })).toBe(true);
    expect(isIdentityPending({ displayName: undefined, email: EMAIL })).toBe(true);
  });

  it("ignores surrounding whitespace when comparing against the local part", () => {
    expect(
      isIdentityPending({ displayName: "  ignaciodelvalle2014+cursor-owner2  ", email: EMAIL }),
    ).toBe(true);
  });

  it("clears once completeIdentityAction writes a real First Last", () => {
    expect(isIdentityPending({ displayName: "Ignacio Del Valle", email: EMAIL })).toBe(false);
  });

  it("does not flag a real name that merely CONTAINS the local part", () => {
    // Substring, not equality — the trigger writes the local part exactly.
    expect(
      isIdentityPending({
        displayName: "ignaciodelvalle2014+cursor-owner2 Del Valle",
        email: EMAIL,
      }),
    ).toBe(false);
  });

  it("does not flag a single-word name that is NOT the local part", () => {
    // Deliberately out of scope: a mononym set by an admin or a seed script is
    // not the measured defect. Widening the rule is a product decision.
    expect(isIdentityPending({ displayName: "Pampa", email: EMAIL })).toBe(false);
  });

  it("does not flag when there is no email to compare against", () => {
    expect(isIdentityPending({ displayName: "Servicio Interno", email: null })).toBe(false);
    expect(isIdentityPending({ displayName: "Servicio Interno", email: "" })).toBe(false);
  });

  it("still flags a blank name when there is no email either", () => {
    expect(isIdentityPending({ displayName: "", email: null })).toBe(true);
  });

  it("compares against the local part only — a name equal to the FULL email is not the trigger's output", () => {
    expect(isIdentityPending({ displayName: EMAIL, email: EMAIL })).toBe(false);
  });
});
