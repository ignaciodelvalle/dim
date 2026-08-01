// @vitest-environment jsdom
//
// /admin/auditoria — streamed shell + bounded fetch group (platform-budget T3.3).
//
// Pins the three T3.3 guarantees:
//   1. The default export is SYNCHRONOUS (Suspense + skeleton fallback) — the
//      shell flushes before any DB call. The pre-T3 page (async default export)
//      fails these assertions.
//   2. The fetch group is bounded: when loadAuditData hangs past 8 s the body
//      resolves into the honest AnalyticsLoadFallback whose retry link KEEPS
//      the active filters — never a ~20 s blank hang.
//   3. The happy path still renders the audit log from the loader's data.
import "@testing-library/jest-dom/vitest";

import { Suspense, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/auditoria",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrRedirect: vi.fn(async () => ({
    profile: { id: "admin-1", role: "admin" },
  })),
}));

const mocks = vi.hoisted(() => ({
  loadAuditData: vi.fn(),
}));

vi.mock("./_lib/load-audit-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_lib/load-audit-data")>();
  return { ...actual, loadAuditData: mocks.loadAuditData };
});

import type { AuditData } from "./_lib/load-audit-data";
import AdminAuditoriaPage from "./page";

const AUDIT_DATA: AuditData = {
  entries: [
    {
      id: "3f0e8f7a-1111-4222-8333-444455556666",
      actorUserId: "9a0e8f7a-1111-4222-8333-444455556666",
      action: "request_approved",
      approvalRequestId: null,
      targetUserId: null,
      performedAt: new Date("2026-07-30T12:00:00Z"),
      payload: null,
    },
  ],
  hasMore: false,
  namesById: new Map([["9a0e8f7a-1111-4222-8333-444455556666", "Operadora Demo"]]),
  targetsById: new Map(),
  actorOptions: [{ id: "9a0e8f7a-1111-4222-8333-444455556666", name: "Operadora Demo" }],
};

/** Invoke the async body the page mounts behind its Suspense boundary. */
async function renderBody(searchParams: Record<string, string>) {
  const el = AdminAuditoriaPage({ searchParams: Promise.resolve(searchParams) });
  const body = el.props.children;
  return await body.type(body.props);
}

afterEach(() => {
  vi.useRealTimers();
  mocks.loadAuditData.mockReset();
});

describe("/admin/auditoria — streamed shell", () => {
  it("default export is synchronous and returns a Suspense boundary", () => {
    expect(AdminAuditoriaPage.constructor.name).not.toBe("AsyncFunction");
    const el = AdminAuditoriaPage({ searchParams: Promise.resolve({}) });
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe(Suspense);
  });

  it("the Suspense fallback is the dashboard skeleton (aria-busy)", () => {
    const el = AdminAuditoriaPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(el.props.fallback);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Cargando…");
  });
});

describe("/admin/auditoria — bounded fetch group", () => {
  it("renders the audit log when the loader resolves in time", async () => {
    mocks.loadAuditData.mockResolvedValue(AUDIT_DATA);
    const html = renderToStaticMarkup(await renderBody({}));
    expect(html).toContain("Registro de auditoría");
    expect(html).toContain("Operadora Demo");
    expect(html).not.toContain("Reintentar");
  });

  it("a hanging loader degrades into the honest fallback after 8 s — retry keeps the filters", async () => {
    vi.useFakeTimers();
    mocks.loadAuditData.mockReturnValue(new Promise(() => {}));
    const pending = renderBody({ action: "request_approved", from: "2026-01-01" });
    await vi.advanceTimersByTimeAsync(8_001);
    const node = await pending;
    vi.useRealTimers();

    const html = renderToStaticMarkup(node);
    expect(html).toContain("tardando más de lo normal");
    expect(html).toContain("Reintentar");
    // The retry href preserves the operator's active filters.
    expect(html).toContain("action=request_approved");
    expect(html).toContain("from=2026-01-01");
    // Degraded state never fabricates an entries list (no "N entradas" card).
    expect(html).not.toContain("entradas");
    expect(html).not.toContain("Operadora Demo");
  });
});
