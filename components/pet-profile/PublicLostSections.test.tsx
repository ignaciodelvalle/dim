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

// UI review, PO 2026-08-06. Three defects on the surface a finder scans with
// somebody's lost dog in their arms: the "Última vez vista" line opened with
// six-decimal coordinates, the CTA row offered two solid buttons in two
// different hues, and a pet with no colour and no señas rendered its species
// alone as a floating orphan line.
describe("PublicLostSections — last-seen reads place-first (M3)", () => {
  const LOCATED = {
    ...BASE_PROPS,
    lastSeenPlaceName: null,
    lastSeenLocality: "Ushuaia",
    lastSeenLat: -54.80606,
    lastSeenLng: -68.304976,
    lastSeenCoords: "-54.806060, -68.304976",
    lastSeenAt: new Date("2026-05-14T12:00:00Z"),
    lostSince: new Date("2026-05-14T12:00:00Z"),
  };

  it("leads with the place and the recency, not the coordinate pair", () => {
    render(<PublicLostSections {...LOCATED} />);

    // The heading's first line answers WHERE and HOW FRESH.
    expect(screen.getByText(/^Ushuaia · hace \d+ (días|día|meses|mes)$/)).toBeInTheDocument();
  });

  it("keeps the raw coordinates, demoted to their own muted line", () => {
    const { container } = render(<PublicLostSections {...LOCATED} />);

    const coords = container.querySelector('[data-section="lost-last-seen-coords"]');
    expect(coords).not.toBeNull();
    expect(coords).toHaveTextContent("-54.806060, -68.304976");
    // …and never inside the place line it used to lead.
    expect(screen.queryByText(/^-54\.806060, -68\.304976 · Ushuaia$/)).toBeNull();
  });

  it("says 'Punto marcado en el mapa' for a pin with no address and no locality", () => {
    render(<PublicLostSections {...LOCATED} lastSeenLocality={null} />);

    expect(screen.getByText(/^Punto marcado en el mapa · hace/)).toBeInTheDocument();
  });
});

describe("PublicLostSections — one accent in the CTA row", () => {
  it("Llamar and the finder CTA are both solid azul; email and sighting stay outline", () => {
    render(
      <PublicLostSections
        {...BASE_PROPS}
        ownerPhoneE164="+5491155551234"
        ownerEmail="alguien@example.test"
        finderFormHref="/p/DIM-TEST-0001/encontre"
        sightingFormHref="/p/DIM-TEST-0001/sighting"
      />,
    );

    // The two reunification actions carry the single accent fill…
    expect(screen.getByRole("link", { name: /llamar/i }).className).toContain("bg-ln-azul");
    expect(screen.getByRole("link", { name: /tengo conmigo|encontr/i }).className).toContain(
      "bg-ln-azul",
    );
    // …and nothing in the row is green any more (ln-ok is the product's
    // "verified / al día" semantic — the wrong signal on a lost card).
    expect(screen.getByRole("link", { name: /llamar/i }).className).not.toContain("bg-ln-ok");
    // The two lower-commitment channels stay quiet.
    expect(screen.getByRole("link", { name: /email/i }).className).toContain("bg-ln-card");
    expect(screen.getByRole("link", { name: /vi cerca/i }).className).toContain("bg-ln-card");
  });
});

describe("PublicLostSections — degenerate identity line", () => {
  it("renders nothing where the description would be when the caller has no traits to show", () => {
    // page.tsx builds "" rather than a lone species word; the component must
    // not paint an empty paragraph for it.
    const { container } = render(<PublicLostSections {...BASE_PROPS} identityLine="" />);

    expect(screen.queryByText("Perro")).toBeNull();
    expect(container.querySelectorAll("p:empty")).toHaveLength(0);
  });

  it("still renders a real description line", () => {
    render(<PublicLostSections {...BASE_PROPS} identityLine="Perro · marrón · collar rojo" />);

    expect(screen.getByText("Perro · marrón · collar rojo")).toBeInTheDocument();
  });
});
