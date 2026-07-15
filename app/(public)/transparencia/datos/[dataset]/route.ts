// GET /transparencia/datos/[dataset]?format=csv|json — PUBLIC, unauthenticated
// open-data downloads (Epic B, item 2). Ley 27.275 active transparency.
//
// Only the five province-level AGGREGATE datasets, already k=5 suppressed in
// lib/open-data/datasets.ts. No auth, no PII, no per-pet rows — the response is
// province name + ISO code + an aggregate base + a percentage/count (or the
// suppression marker). See docs/datos-abiertos/diccionario.md.
//
// BOUNDED DB LOAD: the heavy national aggregate query is computed at most once
// per REVALIDATE_SECONDS per dataset behind unstable_cache; the request path only
// re-formats the cached snapshot (CSV vs JSON). generatedAt is frozen at
// snapshot time, so both formats of the same snapshot agree.

import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import {
  DATASET_IDS,
  type DatasetId,
  type DatasetMeta,
  buildDataset,
  isDatasetId,
} from "@/lib/open-data/datasets";
import {
  type DatasetFormat,
  datasetToCsv,
  datasetToJson,
  parseFormat,
} from "@/lib/open-data/serialize";

/** The underlying figures change at most daily; refresh the snapshot every 6h. */
const REVALIDATE_SECONDS = 21_600;

/** Cache the DB-backed dataset build per id. unstable_cache folds the argument
 *  into the cache key, so each dataset gets its own cached snapshot; the tags
 *  allow a manual revalidateTag("open-data") after a data correction. */
const getDatasetCached = unstable_cache(
  async (id: DatasetId) => buildDataset(id),
  ["open-data-dataset-v1"],
  { revalidate: REVALIDATE_SECONDS, tags: ["open-data"] },
);

/** Shared metadata headers so the file is self-describing even without the body. */
function metadataHeaders(meta: DatasetMeta): Record<string, string> {
  return {
    "X-Dataset-Id": meta.id,
    "X-Dataset-Generated-At": meta.generatedAt,
    "X-License": meta.license.id,
    "X-License-Url": meta.license.url,
    "X-Methodology-Url": meta.methodologyUrl,
    Link: `<${meta.methodologyUrl}>; rel="describedby"`,
    // Public, cacheable, revalidated off the request path (CDN-friendly).
    "Cache-Control": `public, max-age=3600, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    "X-Content-Type-Options": "nosniff",
  };
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ dataset: string }> },
): Promise<Response> {
  const { dataset } = await ctx.params;

  if (!isDatasetId(dataset)) {
    return NextResponse.json({ error: "unknown_dataset", datasets: DATASET_IDS }, { status: 404 });
  }

  const format: DatasetFormat = parseFormat(new URL(request.url).searchParams.get("format"));
  const built = await getDatasetCached(dataset);
  const headers = metadataHeaders(built.meta);

  if (format === "csv") {
    return new Response(datasetToCsv(built), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dataset}.csv"`,
      },
    });
  }

  return new Response(datasetToJson(built), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
