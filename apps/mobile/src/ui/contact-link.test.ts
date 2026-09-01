// `contactLink` — the phone-or-email decision `ContactRow` renders around.

import { describe, expect, it } from "@jest/globals";

import { contactLink } from "./contact-link";

describe("email", () => {
  it("routes through mailto:, never tel: — an '@' value read as a phone used to open a dead tel: link", () => {
    expect(contactLink("juan@example.com")).toEqual({
      href: "mailto:juan@example.com",
      label: "Escribir a juan@example.com",
      kind: "email",
    });
  });
});

describe("phone", () => {
  it("sanitizes spaces/dashes for the href but keeps the original spacing in the label", () => {
    expect(contactLink("+54 294 412-3456")).toEqual({
      href: "tel:+542944123456",
      label: "Llamar al +54 294 412-3456",
      kind: "phone",
    });
  });

  it("keeps a plain local number without a leading +", () => {
    expect(contactLink("11 4123-4567")).toEqual({
      href: "tel:1141234567",
      label: "Llamar al 11 4123-4567",
      kind: "phone",
    });
  });
});

describe("unlinkable", () => {
  it("returns null for text with no '@' and fewer than 6 digits", () => {
    expect(contactLink("abc")).toBeNull();
  });

  it("returns null right at the boundary — 5 digits is too short", () => {
    expect(contactLink("12345")).toBeNull();
  });

  it("links at the boundary — 6 digits is enough", () => {
    expect(contactLink("123456")?.kind).toBe("phone");
  });
});
