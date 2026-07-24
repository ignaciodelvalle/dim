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

const NEUTRAL_NOTICE =
  "La titularidad de esta mascota está en revisión por la autoridad. Si tenés información, será dirigida a la autoridad competente, no a las partes.";

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
