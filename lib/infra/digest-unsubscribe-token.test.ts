// The unsubscribe capability, pinned. If any property here regresses, the
// mailed "dejar de recibir" link either stops working or starts letting one
// user opt another one out — both are the exact failure this token exists to
// prevent.

import { describe, expect, it } from "vitest";

import {
  generateDigestUnsubscribeToken,
  validateDigestUnsubscribeToken,
} from "./digest-unsubscribe-token";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

describe("generateDigestUnsubscribeToken / validateDigestUnsubscribeToken", () => {
  it("accepts a token minted for the same userId", () => {
    const token = generateDigestUnsubscribeToken(USER_A);
    expect(validateDigestUnsubscribeToken(USER_A, token)).toBe(true);
  });

  it("rejects a token minted for a DIFFERENT userId — cannot opt someone else out", () => {
    const token = generateDigestUnsubscribeToken(USER_A);
    expect(validateDigestUnsubscribeToken(USER_B, token)).toBe(false);
  });

  it("is deterministic — the same userId always mints the same token", () => {
    const first = generateDigestUnsubscribeToken(USER_A);
    const second = generateDigestUnsubscribeToken(USER_A);
    expect(first).toBe(second);
  });

  it("never expires — a token minted long ago still validates (no timestamp in the payload)", () => {
    const token = generateDigestUnsubscribeToken(USER_A);
    // Nothing to fast-forward: the token carries no timestamp, so there is no
    // clock to advance. Re-validating the same token is the regression guard
    // for "someone adds a TTL check and this route quietly starts expiring
    // a link that has to survive a person opening a week-old email".
    expect(validateDigestUnsubscribeToken(USER_A, token)).toBe(true);
  });

  it("rejects a malformed token without throwing", () => {
    expect(validateDigestUnsubscribeToken(USER_A, "not-a-real-token")).toBe(false);
    expect(validateDigestUnsubscribeToken(USER_A, "")).toBe(false);
    expect(validateDigestUnsubscribeToken("", "anything")).toBe(false);
  });

  it("rejects a token from a DIFFERENT purpose family (a session/reporter token) even if base64url-valid", () => {
    // A digest-unsubscribe token and (say) a denuncia reporter token are both
    // base64url(hex(hmac)) over a different signed payload — cross-purpose
    // replay must fail even though the shape is superficially identical.
    const foreignShapedToken = Buffer.from("00".repeat(32), "hex").toString("base64url");
    expect(validateDigestUnsubscribeToken(USER_A, foreignShapedToken)).toBe(false);
  });
});
