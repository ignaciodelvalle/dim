// @vitest-environment jsdom
//
// PublicLostSections — custody-dispute neutrality (D2 hardening, red-team
// 2026-07). While pets.inCustodyDispute is set the caller nulls every contact
// field and both relay hrefs; this component must then (a) render the neutral
// authority notice, (b) NOT render the misleading "no channels enabled"
// warning, and (c) obviously render no relay CTA. The non-disputed degenerate
// state (nothing disclosed, no dispute) keeps its honest warning.

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DISPUTE_TIP_NOTICE } from "@/lib/ui/dispute-copy";

import { PublicLostSections } from "./PublicLostSections";

const BASE_PROPS = {
  petName: "Firulais",
  petSex: "male",
  identityLine: "Canino · marrón",
  ownerFirstName: null,
  ownerPhoneE164: null,
  ownerEmail: null,
  lastSeenPlaceName: null,
  lastSeenLocality: null,
  distinguishingFeatures: null,
  finderFormHref: null,
  sightingFormHref: null,
  lostSince: new Date("2026-06-01T12:00:00Z"),
};

// PO decision 2026-07-30: the notice used to open with "La titularidad de esta
// mascota está en revisión por la autoridad… no a las partes." — which told a
// stranger who just found an animal that two people are fighting over it. The
// finder is not a party and does not need the reason; what they need is the
// truth about who receives their message. The wording now states the routing
// and withholds the conflict, and lives in one place so the five surfaces that
// render it cannot drift apart. Imported rather than duplicated on purpose: a
// copy edit must break this test, not slip past it.
const NEUTRAL_NOTICE = DISPUTE_TIP_NOTICE;

afterEach(cleanup);

describe("PublicLostSections — custody dispute (D2)", () => {
  it("disputed: renders the neutral authority notice, no relay CTAs, no 'no channels' warning", () => {
    render(<PublicLostSections {...BASE_PROPS} custodyDisputed />);

    expect(screen.getByText(NEUTRAL_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText("Esta mascota no tiene canales de contacto habilitados.")).toBeNull();
    // No relay/contact CTA of any kind.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("not disputed + nothing disclosed: keeps the honest 'no channels' warning, no neutral notice", () => {
    render(<PublicLostSections {...BASE_PROPS} />);

    expect(
      screen.getByText("Esta mascota no tiene canales de contacto habilitados."),
    ).toBeInTheDocument();
    expect(screen.queryByText(NEUTRAL_NOTICE)).toBeNull();
  });

  it("not disputed + sighting href: renders the sighting CTA (relay path intact)", () => {
    render(<PublicLostSections {...BASE_PROPS} sightingFormHref="/p/DIM-TEST-0001/sighting" />);

    expect(screen.getByRole("link", { name: /vi cerca/i })).toHaveAttribute(
      "href",
      "/p/DIM-TEST-0001/sighting",
    );
  });
});

// "Tu nombre" toggle (pets.discloseFirstNameWhenLost) — Cowork QA v3, M1.
// The owner-side card promises: El público ve "Lo busca <nombre>". The name
// used to render ONLY inside the phone CTA ("Llamar a X"), so with the phone
// toggle off the promise silently broke. The name line must be standalone —
// independent of every other disclosure toggle.
describe("PublicLostSections — owner name disclosure (M1)", () => {
  it("name disclosed, phone off: renders the standalone 'Lo busca' line", () => {
    render(<PublicLostSections {...BASE_PROPS} ownerFirstName="Graciela" />);

    expect(screen.getByText(/Lo busca Graciela/)).toBeInTheDocument();
  });

  it("name disclosed + phone disclosed: renders both the name line and the call CTA", () => {
    render(
      <PublicLostSections
        {...BASE_PROPS}
        ownerFirstName="Graciela"
        ownerPhoneE164="+5491155551234"
      />,
    );

    expect(screen.getByText(/Lo busca Graciela/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /llamar a Graciela/i })).toBeInTheDocument();
  });

  it("name not disclosed: no 'Lo busca' line", () => {
    render(<PublicLostSections {...BASE_PROPS} />);

    expect(screen.queryByText(/Lo busca/)).toBeNull();
  });
});
