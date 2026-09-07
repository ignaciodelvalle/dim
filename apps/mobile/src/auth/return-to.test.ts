// `signInHref` / `returnHref` — the round trip a deep link takes through
// sign-in.
//
// WHAT THESE HAVE TO PROVE
// ---------------------------------------------------------------------------
//   1. THE DESTINATION SURVIVES. That is the whole point: a notification opens
//      `/transferencias/PTR-…`, the session has expired, and the person must
//      arrive at the proposal after signing in — not at their pet list with no
//      idea what the link was for.
//   2. THE TWO HALVES AGREE. `signInHref` writes the parameter and `returnHref`
//      reads it; a disagreement is somebody landing where they did not ask.
//      The round-trip test is what pins that.
//   3. `next` CANNOT LEAVE THE APP. `mimar://ingreso?next=…` is a url anybody
//      can compose and send, so by the time it is read it is untrusted input.
//      A value naming another scheme or another host is discarded.

import { describe, expect, it } from "@jest/globals";

import { ROUTES } from "../ui/routes";
import { endedByThePerson, returnHref, signInHref, signedOutHref } from "./return-to";

describe("signInHref", () => {
  it("carries a real destination", () => {
    expect(signInHref("/transferencias/PTR-ABCD-2345")).toEqual({
      pathname: ROUTES.ingreso,
      params: { next: "/transferencias/PTR-ABCD-2345" },
    });
  });

  it("carries nothing for the paths that would loop or mean nothing", () => {
    // Sign-in itself and the gate would loop. The pet list is the DEFAULT
    // landing, so a parameter naming it changes nothing and makes every
    // ordinary sign-in url look like a redirect chain.
    expect(signInHref(ROUTES.ingreso)).toBe(ROUTES.ingreso);
    expect(signInHref("/")).toBe(ROUTES.ingreso);
    expect(signInHref(ROUTES.misMascotas)).toBe(ROUTES.ingreso);
    expect(signInHref(ROUTES.identidadPendiente)).toBe(ROUTES.ingreso);
    expect(signInHref("   ")).toBe(ROUTES.ingreso);
  });
});

describe("returnHref", () => {
  it("returns to an app-internal path", () => {
    expect(returnHref("/transferencias/PTR-ABCD-2345")).toBe("/transferencias/PTR-ABCD-2345");
    expect(returnHref("/mascotas/DIM-PAMP-0001/perdida")).toBe("/mascotas/DIM-PAMP-0001/perdida");
  });

  it("keeps a query string, which several routes carry", () => {
    expect(returnHref("/mascotas/DIM-PAMP-0001/asentar?kind=weight")).toBe(
      "/mascotas/DIM-PAMP-0001/asentar?kind=weight",
    );
  });

  it("falls back to the gate when there is nothing to return to", () => {
    expect(returnHref(undefined)).toBe(ROUTES.root);
    expect(returnHref("")).toBe(ROUTES.root);
    expect(returnHref("   ")).toBe(ROUTES.root);
  });

  it("resolves a repeated parameter instead of stringifying the array", () => {
    // A path parameter can legally repeat. Without this the value becomes
    // "/a,/b", which starts with a slash and would pass every other check.
    expect(returnHref(["/transferencias/PTR-A", "/mascotas"])).toBe("/transferencias/PTR-A");
  });

  it("REFUSES anything that could leave the app", () => {
    // The sign-in screen is addressable, so this value is untrusted by the time
    // it is read. Each of these is a way out of the app.
    expect(returnHref("https://evil.example/phish")).toBe(ROUTES.root);
    expect(returnHref("mimar://transferencias/PTR-A")).toBe(ROUTES.root);
    expect(returnHref("//evil.example/phish")).toBe(ROUTES.root);
    expect(returnHref("javascript:alert(1)")).toBe(ROUTES.root);
    // Not absolute — expo-router would resolve it against wherever it happens
    // to be, which is a destination nobody chose.
    expect(returnHref("transferencias/PTR-A")).toBe(ROUTES.root);
  });
});

describe("the round trip", () => {
  it("puts a person back where the link was taking them", () => {
    const interrupted = "/transferencias/PTR-ABCD-2345";
    const href = signInHref(interrupted);
    // The two halves, composed, exactly as the two screens compose them.
    const carried = typeof href === "string" ? undefined : href.params.next;
    expect(returnHref(carried)).toBe(interrupted);
  });

  it("lands on the gate when nothing was carried", () => {
    const href = signInHref(ROUTES.misMascotas);
    const carried = typeof href === "string" ? undefined : href.params.next;
    expect(returnHref(carried)).toBe(ROUTES.root);
  });
});

describe("endedByThePerson — NAV-2, confirmed on a device", () => {
  it("is TRUE for the three ends a person asked for", () => {
    // The gate skips `next` on these, so signing out from Ajustes and signing
    // back in no longer re-opens Ajustes — the screen whose button they pressed.
    expect(endedByThePerson("user_action")).toBe(true);
    expect(endedByThePerson("revoked_all")).toBe(true);
    expect(endedByThePerson("account_erased")).toBe(true);
  });

  it("is FALSE for every end that was done TO them — that is what `next` is for", () => {
    // A session taken mid-task is the case the destination exists to serve: a
    // notification opened, the token had expired, and after signing in the
    // person must arrive at the link, not at a pet list.
    expect(endedByThePerson("auth_expired")).toBe(false);
    expect(endedByThePerson("session_shift_expired")).toBe(false);
    expect(endedByThePerson("auth_required")).toBe(false);
    expect(endedByThePerson("account_deactivated")).toBe(false);
    expect(endedByThePerson(null)).toBe(false);
  });

  it("composes with signInHref the way the gate composes them", () => {
    const atAjustes = "/ajustes";
    // Deliberate: the gate never builds the parameter at all.
    expect(endedByThePerson("user_action") ? ROUTES.ingreso : signInHref(atAjustes)).toBe(
      ROUTES.ingreso,
    );
    // Expired at the same screen: the destination survives.
    expect(endedByThePerson("auth_expired") ? ROUTES.ingreso : signInHref(atAjustes)).toEqual({
      pathname: ROUTES.ingreso,
      params: { next: atAjustes },
    });
  });
});

describe("signedOutHref — the suppression is scoped to ONE screen", () => {
  const PROPOSAL = "/transferencias/PTR-ABCD-2345";

  it("drops the destination on the screen the person signed out from", () => {
    // NAV-2, unchanged: "Cerrar sesión" in Ajustes must not hand Ajustes back
    // at the next sign-in.
    expect(
      signedOutHref({ reason: "user_action", endedAt: ROUTES.ajustes, pathname: ROUTES.ajustes }),
    ).toBe(ROUTES.ingreso);
  });

  it("KEEPS the destination of a deep link opened AFTER a deliberate sign-out", () => {
    // THE REASON IS STICKY. `signOut()` writes "user_action" and nothing clears
    // it until the next sign-in, so this is the real state of the store when
    // somebody signs out in Ajustes, stays in the app, and taps a
    // transfer-proposal notification. Reading the reason alone sent them to a
    // bare `ingreso`, and after signing in they landed on their pet list with
    // the proposal — which goes on expiring — nowhere in sight.
    expect(
      signedOutHref({ reason: "user_action", endedAt: ROUTES.ajustes, pathname: PROPOSAL }),
    ).toEqual({ pathname: ROUTES.ingreso, params: { next: PROPOSAL } });
  });

  it("keeps the destination for an EXPIRED session at that very screen", () => {
    // The other half of the invariant: nobody closed anything, so nothing is
    // withheld — not even on the screen a sign-out would have erased.
    expect(
      signedOutHref({ reason: "auth_expired", endedAt: undefined, pathname: ROUTES.ajustes }),
    ).toEqual({ pathname: ROUTES.ingreso, params: { next: ROUTES.ajustes } });
  });

  it("carries nothing for the paths that would loop, whatever ended the session", () => {
    // `signInHref`'s rule still applies underneath: the pet list is the default
    // landing and sign-in itself would loop.
    expect(signedOutHref({ reason: null, endedAt: undefined, pathname: ROUTES.misMascotas })).toBe(
      ROUTES.ingreso,
    );
    expect(signedOutHref({ reason: null, endedAt: undefined, pathname: ROUTES.ingreso })).toBe(
      ROUTES.ingreso,
    );
  });

  it("does not suppress on a reason with no screen attached to it", () => {
    // `endedAt` is required at every ender, so this shape can only come from a
    // store written before one existed. Suppressing everywhere on it would be
    // the sticky-reason bug again, so it suppresses nowhere.
    expect(
      signedOutHref({ reason: "user_action", endedAt: undefined, pathname: PROPOSAL }),
    ).toEqual({ pathname: ROUTES.ingreso, params: { next: PROPOSAL } });
  });
});
