// Unit test for the perdidas use-case. fetchLostPets is mocked, so this runs
// with NO database — it verifies the orchestration + row mapping + that scope
// is passed through to the tested fetcher untouched.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/govt-dashboards", () => ({ fetchLostPets: vi.fn() }));

import { type LostPetRow, fetchLostPets } from "@/lib/govt-dashboards";

import { getLayerFeatures } from "../get-layer-features";

const mockFetch = vi.mocked(fetchLostPets);

const lostRow = (over: Partial<LostPetRow> = {}): LostPetRow => ({
  petId: "1",
  petPublicToken: "DIM-A",
  petName: "Luna",
  species: "dog",
  petStatus: "lost",
  province: "Buenos Aires",
  locality: "La Plata",
  markedLostAt: new Date("2026-06-18T00:00:00.000Z"),
  lastSeenLat: -34.92,
  lastSeenLng: -57.95,
  ownerDisplayName: null,
  ...over,
});

beforeEach(() => mockFetch.mockReset());

describe("getLayerFeatures — perdidas", () => {
  it("maps scoped lost pets to a [lng,lat] FeatureCollection, dropping non-located", async () => {
    mockFetch.mockResolvedValue([
      lostRow(),
      lostRow({ petPublicToken: "DIM-B", lastSeenLat: null, lastSeenLng: null }),
    ]);

    const fc = await getLayerFeatures(
      "perdidas",
      { role: "govt" },
      [{ province: "Buenos Aires", locality: "La Plata" }],
      { since: new Date("2026-06-01T00:00:00.000Z") },
    );

    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry?.coordinates).toEqual([-57.95, -34.92]);
    expect(fc.features[0].properties.token).toBe("DIM-A");
  });

  it("passes the viewer's actor + jurisdictions through to fetchLostPets (scope inherited)", async () => {
    mockFetch.mockResolvedValue([]);
    const jur = [{ province: "Salta", locality: "Salta" }];

    await getLayerFeatures("perdidas", { role: "govt" }, jur, {
      since: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(mockFetch).toHaveBeenCalledWith({ role: "govt" }, jur, {
      since: expect.any(Date),
      status: "lost",
    });
  });

  it("returns an empty collection for a not-yet-loaded layer (F2) without querying", async () => {
    const fc = await getLayerFeatures("mortalidad", { role: "admin" }, [], {
      since: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(fc.features).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
