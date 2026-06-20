// Unit test for the perdidas use-case. fetchLostPets is mocked, so this runs
// with NO database — it verifies the orchestration + row mapping + that scope
// is passed through to the tested fetcher untouched.
//
// The infrastructure repository is also mocked so the not-yet-loaded-layer path
// and the perdidas path never reach @/db (the use-case statically imports the
// repository for the F2 switch arms).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/govt-dashboards", () => ({ fetchLostPets: vi.fn() }));
vi.mock("@/src/modules/panorama/infrastructure/repository", () => ({
  loadBiteEvents: vi.fn(),
  loadDenunciaCentroids: vi.fn(),
  loadOutbreakSignals: vi.fn(),
  loadShelters: vi.fn(),
  loadDecomisos: vi.fn(),
  loadRabiesCoverage: vi.fn(),
  loadMortality: vi.fn(),
}));

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

    const result = await getLayerFeatures(
      "perdidas",
      { role: "govt" },
      [{ province: "Buenos Aires", locality: "La Plata" }],
      { since: new Date("2026-06-01T00:00:00.000Z") },
    );

    expect(result.features.features).toHaveLength(1);
    expect(result.features.features[0].geometry?.coordinates).toEqual([-57.95, -34.92]);
    expect(result.features.features[0].properties.token).toBe("DIM-A");
    expect(result.truncated).toBe(false);
    expect(result.suppressedCount).toBe(0);
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

  it("delegates a choropleth layer (mortalidad) to its loader, echoing the envelope", async () => {
    const { loadMortality } = await import("@/src/modules/panorama/infrastructure/repository");
    vi.mocked(loadMortality).mockResolvedValue({
      cells: [
        {
          key: "Buenos Aires|La Plata",
          province: "Buenos Aires",
          locality: "La Plata",
          centroidLat: "-34.92",
          centroidLng: "-57.95",
          value: 12,
          suppressed: false,
        },
        {
          key: "Salta|Cafayate",
          province: "Salta",
          locality: "Cafayate",
          centroidLat: "-26.07",
          centroidLng: "-65.98",
          value: null,
          suppressed: true,
        },
      ],
      suppressedCount: 1,
      truncated: false,
    });

    const result = await getLayerFeatures("mortalidad", { role: "admin" }, [], {
      since: new Date("2026-06-01T00:00:00.000Z"),
    });

    // Both cells plot (each has a centroid); the suppressed one carries value=null.
    expect(result.features.features).toHaveLength(2);
    expect(result.suppressedCount).toBe(1);
    const suppressed = result.features.features.find(
      (f) => (f.properties as { suppressed?: boolean }).suppressed === true,
    );
    expect((suppressed?.properties as { value: number | null }).value).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
