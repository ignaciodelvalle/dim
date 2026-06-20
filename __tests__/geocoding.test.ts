// Unit tests for lib/geocoding.ts — the pure logic behind the
// geocodeAddressAction / reverseGeocodeAction server actions.
//
// We mock global fetch so no real Nominatim requests fire in CI.

import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { __resetRateLimitForTests, geocodeAddress, reverseGeocode } from "@/lib/geocoding";

beforeEach(() => {
  fetchMock.mockReset();
  __resetRateLimitForTests();
});

describe("geocodeAddress — forward", () => {
  it("returns [] for queries under 3 chars without hitting the network", async () => {
    expect(await geocodeAddress("")).toEqual([]);
    expect(await geocodeAddress("ab")).toEqual([]);
    expect(await geocodeAddress("  a  ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses Nominatim payload into GeocodeResult[]", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          lat: "-34.583",
          lon: "-58.421",
          display_name: "Plaza Italia, Palermo, CABA",
          address: { state: "Buenos Aires", city: "Palermo" },
        },
      ],
    });
    const r = await geocodeAddress("Plaza Italia");
    expect(r).toHaveLength(1);
    expect(r[0].lat).toBeCloseTo(-34.583);
    expect(r[0].lng).toBeCloseTo(-58.421);
    expect(r[0].display_name).toBe("Plaza Italia, Palermo, CABA");
    expect(r[0].province).toBe("Buenos Aires");
    expect(r[0].locality).toBe("Palermo");
  });

  it("for CABA points, prefers the barrio (suburb) over the city-level 'Buenos Aires'", async () => {
    // OSM returns the city-level name in `address.city` for any CABA point; the
    // barrio is in `suburb`. The INDEC catalog has no "Buenos Aires" locality
    // under CABA (only the 48 barrios), so we must pick the barrio — otherwise
    // strict canonical validation throws "localidad Buenos Aires no existe".
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          lat: "-34.588",
          lon: "-58.430",
          display_name: "Av. Santa Fe, Palermo, CABA",
          address: {
            state: "Ciudad Autónoma de Buenos Aires",
            city: "Buenos Aires",
            suburb: "Palermo",
          },
        },
      ],
    });
    const r = await geocodeAddress("Santa Fe");
    expect(r[0].locality).toBe("Palermo");
  });

  it("non-CABA keeps city precedence (suburb does not override city)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          lat: "-31.42",
          lon: "-64.18",
          display_name: "Centro, Córdoba",
          address: { state: "Córdoba", city: "Córdoba", suburb: "Centro" },
        },
      ],
    });
    const r = await geocodeAddress("Centro");
    expect(r[0].locality).toBe("Córdoba");
  });

  it("falls through address fields city → town → suburb → village → hamlet", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          lat: "-34",
          lon: "-58",
          display_name: "Somewhere rural",
          address: { state: "X", village: "VillageName" },
        },
      ],
    });
    const r = await geocodeAddress("rural");
    expect(r[0].locality).toBe("VillageName");
  });

  it("yields locality=null when no city/town/suburb/village/hamlet is present", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { lat: "0", lon: "0", display_name: "Open ocean", address: { state: "Atlantic" } },
      ],
    });
    const r = await geocodeAddress("ocean");
    expect(r[0].province).toBe("Atlantic");
    expect(r[0].locality).toBeNull();
  });

  it("drops results with non-finite coordinates", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { lat: "nope", lon: "nope", display_name: "Garbage", address: {} },
        { lat: "-34", lon: "-58", display_name: "Good one", address: {} },
      ],
    });
    const r = await geocodeAddress("query");
    expect(r).toHaveLength(1);
    expect(r[0].display_name).toBe("Good one");
  });

  it("throws provider_error on non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(geocodeAddress("test")).rejects.toThrow("provider_error");
  });

  it("throws fetch_failed on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(geocodeAddress("test")).rejects.toThrow("fetch_failed");
  });

  it("sends the raw user query without appending bias (avoids Nominatim mis-parse)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await geocodeAddress("Plaza", { locality: "Belgrano", province: "Buenos Aires" });
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get("q")).toBe("Plaza");
    expect(url.searchParams.get("countrycodes")).toBe("ar");
    expect(url.searchParams.get("accept-language")).toBe("es");
  });

  it("sends viewbox+bounded=0 when bias.province has a known bounding box", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await geocodeAddress("Plaza Italia", {
      province: "CABA",
      locality: "CABA",
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("viewbox")).toMatch(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/);
    expect(url.searchParams.get("bounded")).toBe("0");
  });

  it("omits viewbox when bias.province is unknown or missing", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await geocodeAddress("Plaza Italia", { province: "Tierra del Fuego (no bbox yet)" });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.has("viewbox")).toBe(false);
    expect(url.searchParams.has("bounded")).toBe(false);
  });

  it("sends User-Agent header per Nominatim policy", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await geocodeAddress("test");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^DIM\/.+\(.+\)$/);
  });
});

describe("reverseGeocode — reverse", () => {
  it("returns null for invalid coordinates without hitting the network", async () => {
    expect(await reverseGeocode(Number.NaN, 0)).toBeNull();
    expect(await reverseGeocode(91, 0)).toBeNull();
    expect(await reverseGeocode(-91, 0)).toBeNull();
    expect(await reverseGeocode(0, 181)).toBeNull();
    expect(await reverseGeocode(0, -181)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns parsed display_name on success", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        display_name: "Plaza Italia, Palermo, CABA",
        address: { state: "Buenos Aires", city: "Palermo" },
      }),
    });
    const r = await reverseGeocode(-34.583, -58.421);
    expect(r?.display_name).toBe("Plaza Italia, Palermo, CABA");
    expect(r?.province).toBe("Buenos Aires");
    expect(r?.locality).toBe("Palermo");
  });

  it("returns null on 404 (out of OSM coverage)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it("returns null on other non-2xx (graceful degradation)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    expect(await reverseGeocode(-34.6, -58.4)).toBeNull();
  });

  it("returns null when display_name is missing from the response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    expect(await reverseGeocode(-34.6, -58.4)).toBeNull();
  });

  it("returns null on network failure (graceful degradation)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await reverseGeocode(-34.6, -58.4)).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows the initial bucket of 5 forward requests", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    for (let i = 0; i < 5; i++) {
      await expect(geocodeAddress(`query ${i}`)).resolves.toBeDefined();
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("throws rate_limited once the bucket is drained", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    for (let i = 0; i < 5; i++) await geocodeAddress(`warm ${i}`);
    await expect(geocodeAddress("blocked")).rejects.toThrow("rate_limited");
  });

  it("falls back to null when reverse is rate-limited (does not throw)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ display_name: "x" }) });
    for (let i = 0; i < 5; i++) await reverseGeocode(-34 - i * 0.01, -58);
    expect(await reverseGeocode(-34.99, -58)).toBeNull();
  });
});
