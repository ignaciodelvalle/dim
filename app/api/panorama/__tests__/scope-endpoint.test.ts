// Route-level tests for GET /api/panorama/scope — the embedded-drill scope
// bundle (panorama Theme 1). The endpoint returns the selected province's
// localities + centroids so a client-side drill can repopulate the switcher
// dropdown + the map's autozoom centroids without a reload. These mock the
// shared institutional gate + the reference-data loaders, asserting the auth
// posture and the bundle shape without a DB.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveActor = vi.fn();
vi.mock("../_guard", () => ({
  resolveInstitutionalPanoramaActor: () => mockResolveActor(),
}));

const mockListLocalities = vi.fn();
const mockListCentroids = vi.fn();
vi.mock("@/lib/infra/ar-localidades", () => ({
  listLocalitiesByProvince: (...a: unknown[]) => mockListLocalities(...a),
  listLocalityCentroids: (...a: unknown[]) => mockListCentroids(...a),
}));

import { NextResponse } from "next/server";
import { GET as scopeGET } from "../scope/route";

function actorOk(role: "admin" | "govt") {
  return { ok: true, actor: { role, profile: { role }, jurisdictions: [] } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListLocalities.mockResolvedValue([
    { slug: "la-plata", name: "La Plata" },
    { slug: "mar-del-plata", name: "Mar del Plata" },
  ]);
  mockListCentroids.mockResolvedValue({ "la-plata": [-57.95, -34.92] });
});

describe("GET /api/panorama/scope — auth gate", () => {
  it("returns the guard's response when the actor is not authorized", async () => {
    mockResolveActor.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    });
    const res = await scopeGET(new Request("http://localhost/api/panorama/scope?province=AR-B"));
    expect(res.status).toBe(403);
    // No reference-data query is issued for an unauthorized caller.
    expect(mockListLocalities).not.toHaveBeenCalled();
  });
});

describe("GET /api/panorama/scope — bundle", () => {
  it("returns the province's localities + centroids for an authorized actor", async () => {
    mockResolveActor.mockResolvedValue(actorOk("admin"));
    const res = await scopeGET(new Request("http://localhost/api/panorama/scope?province=AR-B"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      localities: Array<{ slug: string; name: string }>;
      localityCentroids: Record<string, [number, number]>;
    };
    expect(body.localities).toHaveLength(2);
    expect(body.localityCentroids["la-plata"]).toEqual([-57.95, -34.92]);
    // Reused the exact server-page reference loaders with the ISO→code province.
    expect(mockListLocalities).toHaveBeenCalledWith("AR-B");
    expect(mockListCentroids).toHaveBeenCalledWith("AR-B");
  });

  it("returns an EMPTY bundle for national scope (no province)", async () => {
    mockResolveActor.mockResolvedValue(actorOk("govt"));
    const res = await scopeGET(new Request("http://localhost/api/panorama/scope"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      localities: unknown[];
      localityCentroids: Record<string, unknown>;
    };
    expect(body.localities).toEqual([]);
    expect(body.localityCentroids).toEqual({});
    // No province → no reference query.
    expect(mockListLocalities).not.toHaveBeenCalled();
  });

  it("returns an EMPTY bundle for an unknown province code", async () => {
    mockResolveActor.mockResolvedValue(actorOk("admin"));
    const res = await scopeGET(
      new Request("http://localhost/api/panorama/scope?province=NOT-REAL"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { localities: unknown[] };
    expect(body.localities).toEqual([]);
    expect(mockListLocalities).not.toHaveBeenCalled();
  });
});
