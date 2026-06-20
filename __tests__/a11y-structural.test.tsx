/**
 * 2.4 — Structural a11y tests.
 *
 * Covers: fieldset/legend for radio groups, single anchor in AdoptionListingCard,
 * list-role parent for scroll-snap chip row.
 *
 * Pattern: react-dom/server renderToStaticMarkup (repo convention — no jsdom).
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function countOccurrences(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

// ---------------------------------------------------------------------------
// next/link — render as a plain <a> for static markup tests
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

// ---------------------------------------------------------------------------
// Item 1a — Step1Kind (denuncia kind selector)
// ---------------------------------------------------------------------------

import { Step1Kind } from "@/app/(public)/denuncias/nueva/_components/Step1Kind";

describe("Step1Kind — fieldset/legend grouping (UX 2.4 item 1)", () => {
  it("wraps radio inputs in a <fieldset> with a <legend>", () => {
    const html = renderToStaticMarkup(<Step1Kind selected={null} onSelect={() => {}} />);
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    // All radio inputs share name="kindCard" — group must be discoverable
    expect(html).toContain('name="kindCard"');
    expect(html).toContain('type="radio"');
  });

  it("legend text is present for screen readers", () => {
    const html = renderToStaticMarkup(<Step1Kind selected={null} onSelect={() => {}} />);
    expect(html).toContain("obligatorio");
  });

  it("selected kind is checked", () => {
    const html = renderToStaticMarkup(<Step1Kind selected="neglect" onSelect={() => {}} />);
    expect(html).toContain('value="neglect"');
    expect(html).toContain("checked");
  });
});

// ---------------------------------------------------------------------------
// Item 1b — Step2Severity (denuncia severity selector)
// ---------------------------------------------------------------------------

import { Step2Severity } from "@/app/(public)/denuncias/nueva/_components/Step2Severity";

describe("Step2Severity — fieldset/legend grouping (UX 2.4 item 1)", () => {
  it("wraps severity radios in a <fieldset> with a <legend>", () => {
    const html = renderToStaticMarkup(<Step2Severity selected={null} onSelect={() => {}} />);
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain('name="severityCard"');
    expect(html).toContain('type="radio"');
  });

  it("fieldset contains exactly one legend", () => {
    const html = renderToStaticMarkup(<Step2Severity selected={null} onSelect={() => {}} />);
    expect(countOccurrences(html, /<legend/g)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Item 2 — AdoptionListingCard: no nested <a> inside <a>
// ---------------------------------------------------------------------------

import { AdoptionListingCard } from "@/components/AdoptionListingCard";
import type { AdoptionListingItem } from "@/components/AdoptionListingCard";

const MOCK_ITEM: AdoptionListingItem = {
  petId: "pet-uuid-0001",
  petPublicToken: "PET-0001",
  orgPublicToken: "ORG-0001",
  orgId: "org-uuid-0001",
  orgAvatarUrl: null,
  name: "Luna",
  species: "dog",
  breed: "Mestiza",
  sex: "female",
  color: null,
  primaryPhotoId: null,
  primaryPhotoStoragePath: null,
  isSterilized: true,
  microchipId: null,
  adoptionStory: "Una perra muy cariñosa.",
  adoptionRequirements: null,
  adoptionListedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  adoptionAgeBucket: "adult",
  adoptionSizeEstimate: "medium",
  adoptionEnergyLevel: "medium",
  adoptionGoodWithKids: null,
  adoptionGoodWithDogs: null,
  adoptionGoodWithCats: null,
  adoptionNeedsYard: null,
  adoptionFeeArs: null,
  jurisdictionProvince: "Buenos Aires",
  jurisdictionLocality: "La Plata",
  orgDisplayName: "Refugio ABC",
};

describe("AdoptionListingCard — no nested anchors (UX 2.4 item 2)", () => {
  it("renders exactly one top-level anchor (pet link)", () => {
    const html = renderToStaticMarkup(<AdoptionListingCard item={MOCK_ITEM} />);
    // Count opening <a tags — should be 2 (pet link + org link) but NEVER nested
    const anchors = html.match(/<a /g) ?? [];
    expect(anchors.length).toBe(2); // pet + org publisher
    // The pet link must NOT contain another <a> inside it
    const petLinkMatch = html.match(/<a href="\/adoptar\/PET-0001"[^>]*>([\s\S]*?)<\/a>/);
    expect(petLinkMatch).not.toBeNull();
    const petLinkContent = petLinkMatch?.[1] ?? "";
    expect(petLinkContent).not.toContain("<a ");
  });

  it("renders the org publisher link outside the pet link when showPublisher=true", () => {
    const html = renderToStaticMarkup(<AdoptionListingCard item={MOCK_ITEM} showPublisher />);
    // The org link must appear in the HTML
    expect(html).toContain('href="/refugios/ORG-0001"');
    expect(html).toContain("Refugio ABC");
  });

  it("renders no org link when showPublisher=false", () => {
    const html = renderToStaticMarkup(
      <AdoptionListingCard item={MOCK_ITEM} showPublisher={false} />,
    );
    expect(html).not.toContain('href="/refugios/ORG-0001"');
  });

  it("compact variant renders without the story", () => {
    const html = renderToStaticMarkup(<AdoptionListingCard item={MOCK_ITEM} variant="compact" />);
    // adoptionStory should not appear in compact mode
    expect(html).not.toContain("Una perra muy cariñosa.");
  });
});

// ---------------------------------------------------------------------------
// Item 5 — EventCatcher chip row: radiogroup div, not ul; no li children
// ---------------------------------------------------------------------------

// EventCatcher is a "use client" component with hooks. Stub them for SSR.
const mockUseRouter = vi.fn(() => ({ push: vi.fn() }));
const mockUseRef = vi.fn(<T,>(init: T) => ({ current: init }));
const mockUseState = vi.fn((init: unknown) => [init, vi.fn()]);
const mockUseTransition = vi.fn(() => [false, vi.fn()]);

vi.mock("next/navigation", () => ({
  useRouter: () => mockUseRouter(),
}));

vi.mock("@/app/actions/quick-capture", () => ({
  quickCaptureAction: vi.fn(),
}));

vi.mock("@/app/(app)/mis-mascotas/[publicToken]/anotar/handoff", () => ({
  buildAnotarUrl: vi.fn(
    (token: string, opts: { kind?: string }) => `/mis-mascotas/${token}/anotar`,
  ),
  buildKindDeeplink: vi.fn(() => null),
}));

vi.mock("@/components/ui/Button", () => ({
  LnButton: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    // biome-ignore lint/a11y/useButtonType: test mock — type passed through props
    React.createElement("button", props, children),
}));

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof React;
  return {
    ...actual,
    useRef: <T,>(init: T) => mockUseRef(init),
    useState: (init: unknown) => mockUseState(init),
    useTransition: () => mockUseTransition(),
  };
});

import { EventCatcher } from "@/components/EventCatcher";
import type { EventCatcherPet } from "@/components/EventCatcher";

const MOCK_PETS: EventCatcherPet[] = [
  {
    id: "1",
    name: "Coco",
    publicToken: "TK-0001",
    photoUrl: null,
    status: "active",
    state: "ok",
  },
  {
    id: "2",
    name: "Max",
    publicToken: "TK-0002",
    photoUrl: null,
    status: "active",
    state: "ok",
  },
];

describe("EventCatcher chip row — div radiogroup, no li (UX 2.4 item 5)", () => {
  it("renders role=radiogroup on a <div>, not a <ul>", () => {
    const html = renderToStaticMarkup(<EventCatcher pets={MOCK_PETS} />);
    // Must have a div with role="radiogroup"
    expect(html).toContain('role="radiogroup"');
    // The radiogroup element must be a <div>, not a <ul>
    expect(html).toMatch(/<div[^>]*role="radiogroup"/);
    expect(html).not.toMatch(/<ul[^>]*role="radiogroup"/);
  });

  it("chip wrappers are <div> elements, not <li>", () => {
    const html = renderToStaticMarkup(<EventCatcher pets={MOCK_PETS} />);
    // No <li> elements should appear in the pet chip row
    // (other elements in the tree may be list-like, but shrink-0 chip wrappers should be divs)
    expect(html).not.toContain('<li class="shrink-0"');
    expect(html).not.toContain('<li style="scroll-snap-align');
  });

  it("renders empty-state when no pets provided", () => {
    const html = renderToStaticMarkup(<EventCatcher pets={[]} />);
    expect(html).toContain("No tenés mascotas registradas");
  });
});
