// @vitest-environment jsdom
//
// /org/[orgToken]/agenda — the DENIAL branch (native QA batch 2, C3).
//
// The bug this pins: the page answered a missing `appointment.manage` with
// `notFound()`, so a member of the organization was shown "No encontramos esta
// página" for a page that exists, inside an org they provably belong to
// (`requireOrgAccessByToken` refuses every non-member before this point). Its
// sibling `/org/{token}/checkins` has always answered "Sin acceso — pedile el
// alta a un administrador", which is both true and actionable.
//
// Only the denial branch is exercised here. The granted branch runs two Drizzle
// queries against the live local database and is covered by the flows that own
// it; a "renders the agenda" assertion built on a hand-mocked query builder
// would pin the mock, not the page.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireOrgAccess, mockGetGrantedCapabilities } = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockGetGrantedCapabilities: vi.fn(),
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireOrgAccessByToken: (orgToken: string) => mockRequireOrgAccess(orgToken),
}));

vi.mock("@/src/modules/organizations/infrastructure/authz-resolver", () => ({
  getGrantedCapabilities: (membership: unknown) => mockGetGrantedCapabilities(membership),
}));

import OrgAgendaPage from "./page";

const ORG_TOKEN = "ORG-TEST-0001";

async function renderDenied(granted: string[]) {
  mockRequireOrgAccess.mockResolvedValue({
    organization: { id: "org-1", displayName: "Refugio Pampa" },
    membership: { id: "mem-1", organizationId: "org-1" },
  });
  mockGetGrantedCapabilities.mockResolvedValue(new Set(granted));
  const node = await OrgAgendaPage({
    params: Promise.resolve({ orgToken: ORG_TOKEN }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(node);
}

beforeEach(() => {
  mockRequireOrgAccess.mockReset();
  mockGetGrantedCapabilities.mockReset();
});

describe("/org/[orgToken]/agenda — a member without appointment.manage", () => {
  it("renders the honest denial instead of throwing a 404", async () => {
    // Before the fix this line threw NEXT_NOT_FOUND — the assertion below could
    // not even be reached, which is exactly what the tester saw as a "page not
    // found" for a page that is right there.
    const html = await renderDenied(["event.write"]);

    expect(html).toContain("Sin acceso");
  });

  it("says what to do about it, in the same words checkins uses", async () => {
    const html = await renderDenied(["event.write"]);

    expect(html).toContain("No tenés permiso para esta acción. Pedile el alta a un administrador.");
  });

  it("never claims the page does not exist", async () => {
    const html = await renderDenied([]);

    expect(html).not.toContain("No encontramos esta página");
  });

  it("leaves a way back to the org panel", async () => {
    const html = await renderDenied([]);

    expect(html).toContain(`href="/org/${ORG_TOKEN}"`);
    expect(html).toContain("Volver al panel");
  });

  it("still resolves the org from the URL token before deciding anything", async () => {
    await renderDenied([]);

    // The confused-deputy guard is untouched by this change: the capability set
    // is still read from the membership that `requireOrgAccessByToken` resolved
    // for THIS token, not from a session-default membership.
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_TOKEN);
    expect(mockGetGrantedCapabilities).toHaveBeenCalledWith({
      id: "mem-1",
      organizationId: "org-1",
    });
  });
});
