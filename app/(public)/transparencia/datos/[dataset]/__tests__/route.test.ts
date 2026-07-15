// Route tests for GET /transparencia/datos/[dataset].
//
// The DB-backed dataset build is mocked (targeted vitest — no DB). We assert the
// route's contract: 404 for an unknown slug, format negotiation (json default /
// csv), download filename, and the self-describing metadata headers.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { type BuiltDataset, OPEN_DATA_LICENSE } from "@/lib/open-data/datasets";

// unstable_cache: pass the function through unchanged (no data cache in tests).
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Mock only the DB-backed builder; keep isDatasetId / DATASET_IDS real.
// vi.hoisted so the fn exists before the hoisted vi.mock factory runs.
const { buildDataset } = vi.hoisted(() => ({ buildDataset: vi.fn() }));
vi.mock("@/lib/open-data/datasets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/open-data/datasets")>();
  return { ...actual, buildDataset };
});

import { GET } from "../route";

const fakeBuilt: BuiltDataset = {
  meta: {
    id: "mortalidad",
    title: "Fallecimientos registrados",
    summary: "resumen",
    unit: "una fila por provincia",
    cadence: "diaria",
    license: OPEN_DATA_LICENSE,
    methodologyUrl: "https://www.mimar.gob.ar/transparencia#metodologia",
    dictionaryUrl: "https://www.mimar.gob.ar/transparencia#diccionario",
    generatedAt: "2026-07-15T00:00:00.000Z",
    suppression: { k: 5, marker: "suprimido por privacidad", rule: "regla" },
    columns: [],
    rowCount: 1,
    suppressedCount: 0,
  },
  rows: [{ provincia: "Córdoba", codigo_iso: "AR-X", fallecimientos_registrados: 42 }],
};

function req(url: string): Request {
  return new Request(url);
}

function params(dataset: string) {
  return { params: Promise.resolve({ dataset }) };
}

beforeEach(() => {
  buildDataset.mockReset();
  buildDataset.mockResolvedValue(fakeBuilt);
});

describe("GET /transparencia/datos/[dataset]", () => {
  it("404s an unknown dataset slug and lists the valid ids", async () => {
    const res = await GET(req("https://x/transparencia/datos/nope"), params("nope"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("unknown_dataset");
    expect(body.datasets).toContain("mortalidad");
    expect(buildDataset).not.toHaveBeenCalled();
  });

  it("defaults to JSON with { meta, data } and metadata headers", async () => {
    const res = await GET(req("https://x/transparencia/datos/mortalidad"), params("mortalidad"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("X-License")).toBe("CC-BY-4.0");
    expect(res.headers.get("X-Methodology-Url")).toContain("/transparencia#metodologia");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=21600");
    const body = await res.json();
    expect(body.meta.id).toBe("mortalidad");
    expect(body.data[0].fallecimientos_registrados).toBe(42);
  });

  it("serves CSV with an attachment filename when ?format=csv", async () => {
    const res = await GET(
      req("https://x/transparencia/datos/mortalidad?format=csv"),
      params("mortalidad"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="mortalidad.csv"');
    const text = await res.text();
    expect(text).toContain("# licencia:");
    expect(text).toContain("Córdoba,AR-X,42");
  });
});
