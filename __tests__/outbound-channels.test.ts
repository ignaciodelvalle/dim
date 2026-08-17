// Pins the outbound-channel readiness table.
//
// The defect this guards against is not a crash — it is a GREEN LIE. The
// denuncia access endpoint answers identically whether mail was sent or the
// mailer was never configured (anti-oracle, by design), so the operator screen
// is the only place the difference can be told. A channel that reports itself
// "configured" when it cannot send would put the last honest signal on the
// wrong side of the truth.

import { describe, expect, it } from "vitest";

import {
  type EnvLike,
  deriveOutboundChannels,
  outboundChannelsReady,
} from "@/lib/infra/outbound-channels";

const FULLY_WIRED: EnvLike = {
  RESEND_API_KEY: "re_live_xxx",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPub",
  VAPID_PRIVATE_KEY: "priv",
};

function channel(env: EnvLike, key: string) {
  const found = deriveOutboundChannels(env).find((c) => c.key === key);
  if (!found) throw new Error(`no channel ${key}`);
  return found;
}

describe("deriveOutboundChannels", () => {
  it("reports email unconfigured when the key is absent, and names what is missing", () => {
    const email = channel({}, "email");
    expect(email.status).toBe("unconfigured");
    // The operator must be told WHICH var to set — a red pill with no name
    // sends them reading source code.
    expect(email.requires).toContain("RESEND_API_KEY");
  });

  it("treats an empty or whitespace-only key as absent, not as configured", () => {
    // The failure this pins is real and has bitten this project before: an env
    // var set to "" is present as a KEY, so a `in`/`!== undefined` check calls
    // it configured while every send silently no-ops. Same shape as the empty
    // NEXT_PUBLIC_SITE_URL that made the credential QR encode a relative URL.
    expect(channel({ RESEND_API_KEY: "" }, "email").status).toBe("unconfigured");
    expect(channel({ RESEND_API_KEY: "   " }, "email").status).toBe("unconfigured");
  });

  it("requires BOTH halves of the VAPID pair before calling push configured", () => {
    // Half a key pair is a misconfiguration, not a partial capability.
    const onlyPublic = channel({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPub" }, "webPush");
    const onlyPrivate = channel({ VAPID_PRIVATE_KEY: "priv" }, "webPush");
    expect(onlyPublic.status).toBe("unconfigured");
    expect(onlyPrivate.status).toBe("unconfigured");
    expect(channel(FULLY_WIRED, "webPush").status).toBe("configured");
  });

  it("reports SMS as not-built in EVERY environment — no env var can turn it on", () => {
    // There is no app-level SMS sender at all. If some future env happened to
    // carry a Twilio key (Supabase Auth's own OTP block does), this must not
    // start claiming the product can text a reporter.
    for (const env of [{}, FULLY_WIRED, { TWILIO_AUTH_TOKEN: "x", RESEND_API_KEY: "y" }]) {
      const sms = channel(env, "sms");
      expect(sms.status).toBe("not-built");
      expect(sms.requires).toHaveLength(0);
    }
  });

  it("states the human consequence of every channel, not the module that is off", () => {
    // The card renders `consequence` verbatim to an operator deciding whether
    // it is safe to onboard real people. A blank or generic string here is the
    // whole feature failing quietly.
    for (const c of deriveOutboundChannels({})) {
      expect(c.consequence.length).toBeGreaterThan(40);
      expect(c.consequence).not.toMatch(/undefined|TODO/);
    }
    // The email consequence must name the stranded person specifically: since
    // the denuncia code page stopped rendering content, the emailed link is a
    // reporter's ONLY route to their own denuncia.
    expect(channel({}, "email").consequence).toMatch(/denunci/i);
  });

  it("never carries a secret VALUE, only variable names", () => {
    // The card is rendered in a React tree. A value on this object is one
    // serialization mistake away from the browser.
    const serialized = JSON.stringify(deriveOutboundChannels(FULLY_WIRED));
    expect(serialized).not.toContain("re_live_xxx");
    expect(serialized).not.toContain("priv");
    // Sanity: the names DO travel, so the assertion above is about values.
    expect(serialized).toContain("RESEND_API_KEY");
  });
});

describe("outboundChannelsReady", () => {
  it("is true when every configurable channel is wired, despite SMS not existing", () => {
    // A product gap must not read as an environment failure an operator could
    // fix by pasting a key — otherwise this signal is red forever and stops
    // being read at all.
    expect(outboundChannelsReady(deriveOutboundChannels(FULLY_WIRED))).toBe(true);
  });

  it("is false while any configurable channel is missing its secrets", () => {
    expect(outboundChannelsReady(deriveOutboundChannels({}))).toBe(false);
    expect(outboundChannelsReady(deriveOutboundChannels({ RESEND_API_KEY: "re_live_xxx" }))).toBe(
      false,
    );
  });
});
