// Structure test — /p/[publicToken] AppShell variant=landing migration
// (Item 7, Phase C2). Proves the chrome invariant after dropping the page-owned
// `<main id="main-content">` on every render path: the LANDING SHELL now owns
// the single `#main-content`, and NO render path (active credential / throttle /
// lost) emits its own `<main>` or a second `#main-content`. The skip-link target
// must be unambiguous (WCAG 2.4.1 / 1.3.1).
//
// This guards directly against the duplicate-<main> regression the Phase C
// (public) layout passthrough + this C2 landing wrap exist to prevent.
//
// Rendering strategy mirrors the repo's other component structure tests
// (pet-sighting-form / finder-in-possession-form): react-dom/server →
// static HTML string, no jsdom. The page is a heavy async server component, so
// its DB + auth surface is mocked exactly like public-token-page-rate-limit.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Small helpers — count landmark occurrences in a rendered HTML string.
// ---------------------------------------------------------------------------

function countMainTags(html: string): number {
  return (html.match(/<main(\s|>)/g) ?? []).length;
}
function countMainContentIds(html: string): number {
  return (html.match(/id="main-content"/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// Mocks shared by the page render (mirror public-token-page-rate-limit.test.ts)
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key === "x-real-ip" ? "198.51.100.7" : null),
  })),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

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

// next/dynamic — LostPublicCredential lazy-loads the map. Return a no-op so the
// component renders synchronously to static markup.
vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

const { MockRateLimitError, mockEnforceRateLimit } = vi.hoisted(() => {
  class MockRateLimitError extends Error {
    resetAt: Date;
    reason: string;
    constructor(resetAt: Date, reason: string) {
      super(`Rate limit exceeded: ${reason}`);
      this.name = "RateLimitError";
      this.resetAt = resetAt;
      this.reason = reason;
    }
  }
  return {
    MockRateLimitError,
    mockEnforceRateLimit: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: (endpoint: string, id: string, cfg: unknown) =>
      mockEnforceRateLimit(endpoint, id, cfg),
    RateLimitError: MockRateLimitError,
  };
});

const mockDbSelect = vi.fn();
const mockDb = { select: mockDbSelect };

vi.mock("@/db", () => ({
  db: mockDb,
  pets: {},
  attachments: {},
  ownerships: {},
  petEvents: {},
  petServiceDog: {},
  cases: {},
  organizations: {},
  profiles: {},
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal();
  return actual as object;
});

// Heavy lib + child component deps (not under test) — neutralised so the page
// renders to markup without touching real infra. Children that would otherwise
// inject their own DOM are stubbed to null; we only assert on the page-owned
// chrome (the credential wrapper), never on child internals.
vi.mock("@/lib/event-confidence", () => ({
  computeConfidence: vi.fn(() => "self_reported"),
  isAtLeast: vi.fn(() => false),
}));
vi.mock("@/lib/format", () => ({
  sexLabel: vi.fn(() => ""),
  speciesLabel: vi.fn(() => "perro"),
  statusLabel: vi.fn(() => "activo"),
  // Used by LostPublicCredential (lost render path).
  lostBannerHeadline: vi.fn(() => "Estoy perdida"),
  lostFirstPersonLine: vi.fn(() => "estoy perdida"),
  normalizePhoneForTel: vi.fn((p: string | null) => p),
}));
// LostPublicCredential deps (lost render path).
vi.mock("@/lib/lookups", () => ({ tattooLocationLabel: vi.fn(() => null) }));
vi.mock("@/lib/branding", () => ({
  BRANDING: { appName: "MiMAR", appNameLong: "Mi Mascota Argentina Registrada" },
}));
vi.mock("@/lib/location", () => ({ readPoint: vi.fn(() => null) }));
vi.mock("@/lib/origin-org", () => ({
  resolveOriginOrg: vi.fn(async () => null),
  shouldShowOriginOrgBadge: vi.fn(() => false),
}));
vi.mock("@/lib/permanent-conditions", () => ({
  isPermanentCondition: vi.fn(() => false),
  permanentConditionShortLabel: vi.fn(() => ""),
}));
vi.mock("@/lib/pet-identifiers", () => ({
  fetchActiveIdentifications: vi.fn(async () => ({ microchip: null, tattoo: null })),
}));
vi.mock("@/lib/storage", () => ({ petPhotoUrl: vi.fn(() => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/components/PppPublicBadge", () => ({ PppPublicBadge: vi.fn(() => null) }));
vi.mock("@/components/event/ConfidenceBadge", () => ({ ConfidenceBadge: vi.fn(() => null) }));
vi.mock("@/components/pet-profile/LostPublicCredential", () => ({
  LostPublicCredential: vi.fn(() => null),
}));
vi.mock("@/app/(public)/p/[publicToken]/FoundPetForm", () => ({ FoundPetForm: vi.fn(() => null) }));
vi.mock("@/app/(public)/p/[publicToken]/ScanLogger", () => ({ ScanLogger: vi.fn(() => null) }));
vi.mock("@/app/(public)/p/[publicToken]/Tier2MedicalView", () => ({
  Tier2MedicalView: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// DB select-chain stub. The first .limit() resolves the pet row; every later
// query resolves to []. Lets us drive the active-credential happy path with a
// single seeded pet object.
// ---------------------------------------------------------------------------

function buildSelectChain(firstResult: unknown[]) {
  let callCount = 0;
  const chain = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => {
      callCount++;
      return callCount === 1 ? firstResult : [];
    }),
  };
  return chain;
}

// Minimal ACTIVE pet row — enough for the active credential render path. All
// disclosure/Tier flags are off, so no gating branch fires and no PII is read.
const ACTIVE_PET = {
  id: "pet-1",
  name: "Firulais",
  status: "active",
  species: "dog",
  breed: null,
  sex: "male",
  color: null,
  distinguishingFeatures: null,
  dateOfBirth: null,
  publicToken: "DIM-AAAA-BBBB",
  primaryPhotoId: null,
  emergencyInfoVisible: false,
  discloseConditionsPublicly: false,
  permanentConditions: [] as string[],
  permanentConditionsOther: null,
  potentiallyDangerousBreed: false,
  tier2PublicPermanent: false,
  tier2PublicEnabledUntil: null,
  jurisdictionLocality: null,
  jurisdictionProvince: null,
  discloseFirstNameWhenLost: false,
  disclosePhoneWhenLost: false,
  discloseEmailWhenLost: false,
  discloseLastLocationWhenLost: false,
  allowFinderFormWhenLost: false,
};

describe("/p/[publicToken] — landing-shell structure (Item 7, Phase C2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRateLimit.mockResolvedValue(undefined);
  });

  it("AppShell variant=landing owns EXACTLY ONE #main-content", async () => {
    const { AppShell } = await import("@/components/layout/AppShell");
    const html = renderToStaticMarkup(
      <AppShell variant="landing">
        <div data-testid="child">credential body</div>
      </AppShell>,
    );
    expect(countMainContentIds(html)).toBe(1);
    expect(countMainTags(html)).toBe(1);
  });

  it("ACTIVE credential render path emits NO page-owned <main> / #main-content", async () => {
    mockDbSelect.mockImplementation(() => buildSelectChain([{ pet: ACTIVE_PET, photo: null }]));
    const { default: PublicCredentialPage } = await import("@/app/(public)/p/[publicToken]/page");

    const element = await PublicCredentialPage({
      params: Promise.resolve({ publicToken: "DIM-AAAA-BBBB" }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    // The page now renders a <div> wrapper; the shell provides the single
    // #main-content. So the page's own output must contain ZERO of either.
    expect(countMainTags(html)).toBe(0);
    expect(countMainContentIds(html)).toBe(0);
    // Sanity: the credential actually rendered (active content present).
    expect(html).toContain("Credencial pública");
  });

  it("THROTTLE (rate-limited) render path emits NO page-owned <main> / #main-content", async () => {
    mockDbSelect.mockImplementation(() => buildSelectChain([]));
    mockEnforceRateLimit.mockRejectedValue(
      new MockRateLimitError(new Date(Date.now() + 60_000), "public_token_page:ip:minute"),
    );
    const { default: PublicCredentialPage } = await import("@/app/(public)/p/[publicToken]/page");

    const element = await PublicCredentialPage({
      params: Promise.resolve({ publicToken: "DIM-AAAA-BBBB" }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(countMainTags(html)).toBe(0);
    expect(countMainContentIds(html)).toBe(0);
    // Sanity: the throttle notice actually rendered, and no DB query ran.
    expect(html).toContain("Demasiadas consultas");
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("ACTIVE credential composed under the landing shell yields EXACTLY ONE #main-content", async () => {
    mockDbSelect.mockImplementation(() => buildSelectChain([{ pet: ACTIVE_PET, photo: null }]));
    const { AppShell } = await import("@/components/layout/AppShell");
    const { default: PublicCredentialPage } = await import("@/app/(public)/p/[publicToken]/page");

    const page = await PublicCredentialPage({
      params: Promise.resolve({ publicToken: "DIM-AAAA-BBBB" }),
    });
    const html = renderToStaticMarkup(
      <AppShell variant="landing">{page as React.ReactElement}</AppShell>,
    );

    expect(countMainContentIds(html)).toBe(1);
    expect(countMainTags(html)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// LostPublicCredential — the lost render path. It previously owned its own
// full-screen <main id="main-content">; after C2 it is a plain <div> so the
// landing shell owns the single landmark. Rendered directly (the component is
// synchronous) with the real (un-mocked) implementation.
// ---------------------------------------------------------------------------

describe("LostPublicCredential — no page-owned <main> after C2", () => {
  it("renders a <div> wrapper, NOT a <main> / #main-content", async () => {
    vi.doUnmock("@/components/pet-profile/LostPublicCredential");
    vi.resetModules();
    const { LostPublicCredential } = await import("@/components/pet-profile/LostPublicCredential");

    const html = renderToStaticMarkup(
      React.createElement(LostPublicCredential, {
        petName: "Firulais",
        petPhotoUrl: null,
        petSex: "male",
        identityLine: "Canino · marrón",
        ownerFirstName: null,
        ownerPhoneE164: null,
        lastSeenPlaceName: null,
        lastSeenLocality: null,
        distinguishingFeatures: null,
        finderFormHref: null,
        sightingFormHref: null,
        lostSince: new Date(),
        tattooCode: null,
        tattooLocation: null,
        tattooDescription: null,
        tattooPhotoUrl: null,
        lastSeenLat: null,
        lastSeenLng: null,
        lostDescription: null,
      }),
    );

    expect(countMainTags(html)).toBe(0);
    expect(countMainContentIds(html)).toBe(0);
    // Sanity: the lost banner content still renders.
    expect(html).toContain('data-section="lost-urgent-banner"');
  });
});
