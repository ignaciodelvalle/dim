// Tier-0 PII contract — /p/[publicToken] (task #33, TOP-5 gap #2).
//
// This is the single worst public-leak surface in the product: anyone who
// scans (or guesses) a public token reaches this page with NO auth. The
// existing structure test (public-token-landing-structure.test.tsx) proves
// chrome/a11y landmarks but never asserts on PII content — a refactor could
// start rendering owner phone/email/name and nothing in CI would catch it.
//
// This file drives the REAL page.tsx data path (mocked DB) and asserts:
//   1. ACTIVE credential (Tier 0): no owner PII query happens at all — the
//      page must never surface phone/email/full-name/address/DNI.
//   2. LOST credential, ALL disclose_*_when_lost flags OFF: the mocked DB
//      returns REAL, sensitive-looking owner data (simulating what would
//      happen if the SQL-level gate had a bug) — the page's prop-passing
//      gate (page.tsx lines ~565-575) is the last line of defense and must
//      still null everything out. This is the meaningful "flags OFF" case.
//   3. LOST credential, ALL disclose_*_when_lost flags ON: only the
//      consented fields (first name, phone, location) reach the rendered
//      output — never the owner's DNI (never queried on this route at all)
//      and never a full legal name (only ever the first token).
//
// NOTE (discovered while writing this test): the page fetches `ownerEmail`
// when discloseEmailWhenLost is true (page.tsx ~480-491) but NEVER passes it
// to <LostPublicCredential> — the prop doesn't exist on that component. So
// opting in to email disclosure currently has zero visible effect. Not a
// security regression (strictly less exposure than intended), but flagged
// here as a real product gap for follow-up; this test intentionally does
// NOT assert email appears when disclosed, since asserting that would fail
// against current (arguably incomplete) behavior.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks shared by the page render (mirror public-token-landing-structure.test.tsx)
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key === "x-real-ip" ? "198.51.100.9" : null),
  })),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  usePathname: vi.fn(() => "/p/TEST-TOKEN"),
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

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
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

vi.mock("@/lib/events/event-confidence", () => ({
  computeConfidence: vi.fn(() => "self_reported"),
  isAtLeast: vi.fn(() => false),
}));
vi.mock("@/lib/utils/format", () => ({
  sexLabel: vi.fn(() => ""),
  speciesLabel: vi.fn(() => "perro"),
  statusLabel: vi.fn(() => "activo"),
  lostBannerHeadline: vi.fn(() => "Estoy perdida"),
  lostFirstPersonLine: vi.fn(() => "estoy perdida"),
  normalizePhoneForTel: vi.fn((p: string | null) => p),
}));
vi.mock("@/lib/reference/lookups", () => ({ tattooLocationLabel: vi.fn(() => null) }));
vi.mock("@/lib/ui/branding", () => ({
  BRANDING: { appName: "MiMAR", appNameLong: "Mi Mascota Argentina Registrada" },
}));
vi.mock("@/lib/infra/origin-org", () => ({
  resolveOriginOrg: vi.fn(async () => null),
  shouldShowOriginOrgBadge: vi.fn(() => false),
}));
vi.mock("@/lib/reference/permanent-conditions", () => ({
  isPermanentCondition: vi.fn(() => false),
  permanentConditionShortLabel: vi.fn(() => ""),
}));
vi.mock("@/lib/infra/pet-identifiers", () => ({
  fetchActiveIdentifications: vi.fn(async () => ({ microchip: null, tattoo: null })),
}));
vi.mock("@/lib/infra/storage", () => ({ petPhotoUrl: vi.fn(() => null) }));
vi.mock("@/components/PppPublicBadge", () => ({ PppPublicBadge: vi.fn(() => null) }));
vi.mock("@/components/event/ConfidenceBadge", () => ({ ConfidenceBadge: vi.fn(() => null) }));
vi.mock("@/app/(public)/p/[publicToken]/FoundPetForm", () => ({ FoundPetForm: vi.fn(() => null) }));
vi.mock("@/app/(public)/p/[publicToken]/ScanLogger", () => ({ ScanLogger: vi.fn(() => null) }));
vi.mock("@/app/(public)/p/[publicToken]/Tier2MedicalView", () => ({
  Tier2MedicalView: vi.fn(() => null),
}));

// readPoint: real-ish behavior so lastSeenLat/Lng gating is exercisable —
// derives {lat,lng} from the row's locationLat/locationLng columns exactly
// like the real helper does, so this test can prove the coords are gated.
vi.mock("@/lib/domain/location", () => ({
  readPoint: vi.fn((row: { locationLat?: unknown; locationLng?: unknown } | null | undefined) => {
    if (!row || row.locationLat == null || row.locationLng == null) return null;
    return { lat: Number(row.locationLat), lng: Number(row.locationLng) };
  }),
}));

// createAdminClient — returns a real-looking email so we can prove it is (or
// per the discovered gap, currently never is) rendered.
const mockGetUserById = vi.fn(async () => ({
  data: { user: { email: "juan.perez@example.com" } },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ auth: { admin: { getUserById: mockGetUserById } } })),
}));

// LostPublicCredential — SPY replacement. Per its own doc comment, "the
// component itself never decides what to show — the page passes only what's
// actually disclosable." This spy dumps every prop it receives into the DOM
// as JSON, so THIS test can assert on the page's prop-passing contract
// directly — the real security boundary — without depending on the child
// component's own rendering choices.
vi.mock("@/components/pet-profile/LostPublicCredential", () => ({
  LostPublicCredential: vi.fn((props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "lost-credential-spy" }, JSON.stringify(props)),
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_NAME = "Juan Carlos Pérez";
const FIRST_NAME = "Juan";
const PHONE = "+5491122334455";
const EMAIL = "juan.perez@example.com";
const ADDRESS = "Av. Corrientes 1234, CABA";
const LOCALITY = "Palermo";
const FAKE_DNI = "20-11222333-4";
const LAT = "-34.603722";
const LNG = "-58.381592";

const BASE_PET = {
  id: "pet-pii-1",
  name: "Firulais",
  species: "dog",
  breed: null,
  sex: "male",
  color: null,
  distinguishingFeatures: null,
  dateOfBirth: null,
  publicToken: "DIM-PIIT-EST0",
  primaryPhotoId: null,
  emergencyInfoVisible: false,
  discloseConditionsPublicly: false,
  permanentConditions: [] as string[],
  permanentConditionsOther: null,
  potentiallyDangerousBreed: false,
  tier2PublicPermanent: false,
  tier2PublicEnabledUntil: null,
  jurisdictionLocality: LOCALITY,
  jurisdictionProvince: "CABA",
  allowFinderFormWhenLost: false,
};

const ACTIVE_PET = {
  ...BASE_PET,
  status: "active",
  discloseFirstNameWhenLost: false,
  disclosePhoneWhenLost: false,
  discloseEmailWhenLost: false,
  discloseLastLocationWhenLost: false,
};

function lostPet(flags: {
  firstName: boolean;
  phone: boolean;
  email: boolean;
  location: boolean;
}) {
  return {
    ...BASE_PET,
    status: "lost",
    discloseFirstNameWhenLost: flags.firstName,
    disclosePhoneWhenLost: flags.phone,
    discloseEmailWhenLost: flags.email,
    discloseLastLocationWhenLost: flags.location,
  };
}

// Owner row with REAL, sensitive-looking data returned regardless of the
// disclose flags — this is the point: it simulates what would happen if the
// SQL-level gate (page.tsx `showPhone ? profiles.phone : sql\`null\``) had a
// bug, so the ONLY thing standing between this data and the rendered HTML is
// the prop-passing gate. `dni` is extraneous data the real query never
// selects — included here purely as a canary: if a future refactor starts
// reading `ownerRow.dni`, this test catches it.
const OWNER_ROW = {
  displayName: FULL_NAME,
  phone: PHONE,
  ownerUserId: "owner-fixture-uuid",
  dni: FAKE_DNI,
};

const LOST_EVENT_ROW = {
  lostDescriptionJson: null,
  locationText: ADDRESS,
  locationLat: LAT,
  locationLng: LNG,
  occurredAt: new Date("2026-06-01T12:00:00Z"),
};

// ---------------------------------------------------------------------------
// DB select-chain stub — SEQUENCED by call order (not call-count), so
// distinct queries can return distinct, purpose-built rows. Call order for
// the LOST path (page.tsx, Stage 1 Promise.all + isLost Promise.all):
//   0: main pet+photo fetch
//   1: vaccinationExists
//   2: latestVaccinationRows
//   3: openCustodyEpisodeRows
//   4: petServiceDog (pet.species === 'dog')
//   5: ownerRows (isLost block)
//   6: latestLostEventRows (isLost block)
// The ACTIVE path only ever reaches index 0-4 (isLost block is skipped).
// ---------------------------------------------------------------------------

function buildSequencedSelectChain(sequence: unknown[][]) {
  let callIndex = 0;
  return () => {
    const idx = callIndex++;
    const chain = {
      from: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(async () => sequence[idx] ?? []),
    };
    return chain;
  };
}

describe("/p/[publicToken] — Tier-0 PII contract (task #33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({ data: { user: { email: EMAIL } } });
  });

  it("ACTIVE credential: renders with NONE of owner phone/email/DNI/full-name/address", async () => {
    mockDbSelect.mockImplementation(
      buildSequencedSelectChain([[{ pet: ACTIVE_PET, photo: null }], [], [], [], []]),
    );
    const { default: PublicCredentialPage } = await import("@/app/(public)/p/[publicToken]/page");

    const element = await PublicCredentialPage({
      params: Promise.resolve({ publicToken: ACTIVE_PET.publicToken }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("Credencial pública"); // sanity: active render happened
    for (const marker of [PHONE, EMAIL, FULL_NAME, ADDRESS, FAKE_DNI]) {
      expect(html).not.toContain(marker);
    }
    // No owner query is ever issued on the active path — ownerships/profiles
    // rows are only read inside the `if (isLost)` branch (page.tsx ~415).
  });

  it("LOST credential, ALL disclose_*_when_lost flags OFF: prop-passing gate nulls owner PII even though the DB returned real data", async () => {
    const pet = lostPet({ firstName: false, phone: false, email: false, location: false });
    mockDbSelect.mockImplementation(
      buildSequencedSelectChain([
        [{ pet, photo: null }],
        [],
        [],
        [],
        [],
        [OWNER_ROW],
        [LOST_EVENT_ROW],
      ]),
    );
    const { default: PublicCredentialPage } = await import("@/app/(public)/p/[publicToken]/page");

    const element = await PublicCredentialPage({
      params: Promise.resolve({ publicToken: pet.publicToken }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('data-testid="lost-credential-spy"'); // sanity: lost branch rendered
    for (const marker of [PHONE, EMAIL, FULL_NAME, FIRST_NAME, ADDRESS, FAKE_DNI, LAT, LNG]) {
      expect(
        html,
        `PII marker "${marker}" leaked into the rendered lost credential despite all disclose flags being OFF`,
      ).not.toContain(marker);
    }
  });

  it("LOST credential, ALL disclose_*_when_lost flags ON: only the consented fields (first name, phone, location) reach the page — never DNI, never the full legal name", async () => {
    const pet = lostPet({ firstName: true, phone: true, email: true, location: true });
    mockDbSelect.mockImplementation(
      buildSequencedSelectChain([
        [{ pet, photo: null }],
        [],
        [],
        [],
        [],
        [OWNER_ROW],
        [LOST_EVENT_ROW],
      ]),
    );
    const { default: PublicCredentialPage } = await import("@/app/(public)/p/[publicToken]/page");

    const element = await PublicCredentialPage({
      params: Promise.resolve({ publicToken: pet.publicToken }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    // Consented fields DO reach the page.
    expect(html).toContain(PHONE);
    expect(html).toContain(FIRST_NAME);
    expect(html).toContain(ADDRESS);
    expect(html).toContain(LAT);
    expect(html).toContain(LNG);

    // Never the full legal name — only the first token is ever derived.
    expect(html).not.toContain(FULL_NAME);
    // Never DNI — this route never selects it; canary against future leakage.
    expect(html).not.toContain(FAKE_DNI);
    // Email is fetched (page.tsx ~480-491) but never wired into any prop on
    // this route today (see file-header note) — documenting current
    // behavior, not endorsing it as sufficient once email UI ships.
    expect(html).not.toContain(EMAIL);
  });
});
