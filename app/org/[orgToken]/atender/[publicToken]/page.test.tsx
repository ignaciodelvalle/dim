// Host contract test for the atender walk-in signing page (#43 provenance):
// the "verificado por profesional" copy MUST render only when the signer
// holds a validated matrícula, and the honest org_registered fallback copy
// MUST render only when it doesn't. This pins both branches so a future
// edit can't silently invert the honesty guarantee at line ~83.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const fixturePet = {
  id: "pet-1",
  publicToken: "DIM-TEST-0001",
  name: "Rocco",
  species: "dog",
  status: "active" as const,
};

function fixtureAccess(matriculaVerified: boolean) {
  return {
    ok: true as const,
    user: { id: "user-1" },
    organizationId: "org-1",
    organizationName: "Refugio Test",
    pet: fixturePet,
    signer: {
      label: matriculaVerified ? "matrícula 12345" : "Refugio Test",
      matriculaVerified,
    },
    eventAuthorship: matriculaVerified
      ? { authorRole: "vet" as const, authorOrganizationId: "org-1", authorVerified: true }
      : { authorRole: "shelter" as const, authorOrganizationId: "org-1", authorVerified: false },
    error: null,
  };
}

const resolveAtenderPetMock = vi.fn();

vi.mock("../atender-access", () => ({
  resolveAtenderPet: (...args: unknown[]) => resolveAtenderPetMock(...args),
}));

// #3 declared-events card — mocked so this host-contract test stays scoped to
// the #43 provenance copy and never needs a real DB connection for the
// fixture's non-UUID pet id.
vi.mock("../atender-declared-events", () => ({
  fetchPendingDeclaredEvents: vi.fn().mockResolvedValue([]),
}));

import AtenderSignPage from "./page";

async function renderPage(searchParams: { evento?: string; firmado?: string } = {}) {
  const node = await AtenderSignPage({
    params: Promise.resolve({ orgToken: "org-token", publicToken: "DIM-TEST-0001" }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(node);
}

describe("atender sign page — #43 provenance copy", () => {
  it("renders the honest org_registered fallback when the signer's matrícula is NOT verified", async () => {
    resolveAtenderPetMock.mockResolvedValueOnce(fixtureAccess(false));
    const html = await renderPage();
    // The exact inline suffix from page.tsx:83 (" · verificado por profesional")
    // must be ABSENT — not just the bare substring, which also legitimately
    // appears (quoted) inside the honest fallback paragraph below.
    expect(html).not.toContain("· verificado por profesional");
    expect(html).toContain("Queda registrado a nombre de la organización");
  });

  it("renders the 'verificado por profesional' copy when the signer's matrícula IS verified", async () => {
    resolveAtenderPetMock.mockResolvedValueOnce(fixtureAccess(true));
    const html = await renderPage();
    expect(html).toContain("· verificado por profesional");
    expect(html).not.toContain("Queda registrado a nombre de la organización");
  });
});

// RA-2 F2 — the success receipt. A non-matriculated signer's write lands as
// `org_registered`, which is a record and NOT a signature, so the page claiming
// "Evento clínico firmado." was false for that entire signer tier — and, next
// to a pending-signature card that correctly did not clear, it read as a broken
// write and invited the duplicate that permanently pollutes the health record.
describe("atender sign page — ?firmado=1 receipt must match the signer's tier", () => {
  it("does NOT claim a signature when the signer has no validated matrícula", async () => {
    resolveAtenderPetMock.mockResolvedValueOnce(fixtureAccess(false));
    const html = await renderPage({ firmado: "1" });
    expect(html).not.toContain("Evento clínico firmado.");
    expect(html).toContain("Evento registrado a nombre de la organización.");
    expect(html).toContain("no lleva firma profesional");
  });

  it("claims the signature only for a matriculated signer", async () => {
    resolveAtenderPetMock.mockResolvedValueOnce(fixtureAccess(true));
    const html = await renderPage({ firmado: "1" });
    expect(html).toContain("Evento clínico firmado.");
    expect(html).not.toContain("Evento registrado a nombre de la organización.");
  });

  it("shows no receipt at all while a capture form is open", async () => {
    resolveAtenderPetMock.mockResolvedValueOnce(fixtureAccess(false));
    const html = await renderPage({ firmado: "1", evento: "chip" });
    expect(html).not.toContain("Evento registrado a nombre de la organización.");
    expect(html).not.toContain("Evento clínico firmado.");
  });
});
