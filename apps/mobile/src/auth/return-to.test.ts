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
import { returnHref, signInHref } from "./return-to";

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
