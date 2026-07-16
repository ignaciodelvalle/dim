// Host contract test for the atender walk-in signing page (#43 provenance):
// the "verificado por profesional" copy MUST render only when the signer
// holds a validated matrícula, and the honest org_registered fallback copy
// MUST render only when it doesn't. This pins both branches so a future
// edit can't silently invert the honesty guarantee at line ~83.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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

import AtenderSignPage from "./page";

async function renderPage() {
  const node = await AtenderSignPage({
    params: Promise.resolve({ orgToken: "org-token", publicToken: "DIM-TEST-0001" }),
    searchParams: Promise.resolve({}),
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
