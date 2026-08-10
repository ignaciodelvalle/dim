/**
 * Every storage bucket the code writes to must be a bucket the SQL creates.
 *
 * WHY THIS EXISTS. On 2026-08-10 an adversarial review found that
 * `ATTACHMENT_BUCKET` — the destination for ALL decomiso evidence — was
 * `"pet-attachments"`, a bucket that exists in neither the local database nor
 * staging. Evidence is a hard server-side requirement (`validateAttachments`
 * demands >= 2 files) and the upload runs before the transaction opens, so
 * every decomiso in the product's history would have died on its first step
 * with `Bucket not found`. Nobody noticed: the 408 seeded `custody_episode`
 * rows were written by script, skipping the action entirely.
 *
 * The string appeared in exactly ONE place in the whole repo — the constant
 * itself. Nothing could have caught it: not typecheck (it is a string), not a
 * unit test (none exercised the upload), not the fences (none look at storage).
 * The only thing that would have is what this test does — cross the names the
 * code uses against the names the schema creates.
 *
 * The bucket list is PARSED from db/**.sql, not typed here. A test that
 * restates the answer cannot detect the answer changing.
 */

import { globSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ATTACHMENT_BUCKET } from "@/src/modules/decomiso/domain/types";

/** Bucket ids created by the schema, parsed from the storage migrations. */
function declaredBuckets(): Set<string> {
  const files = [...globSync("db/*storage*.sql"), ...globSync("db/migrations/*.sql")];
  const out = new Set<string>();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/storage\.buckets[\s\S]{0,400}?values\s*\(\s*'([a-z0-9-]+)'/gi)) {
      out.add(m[1]);
    }
  }
  return out;
}

/**
 * Bucket names written as literals at a `storage.from(...)` call site.
 * Extracted from source so a new hardcoded upload target is covered without
 * anyone remembering to add it here.
 */
function literalBucketsInCode(): Map<string, string[]> {
  const files = [
    ...globSync("app/**/*.{ts,tsx}"),
    ...globSync("lib/**/*.{ts,tsx}"),
    ...globSync("src/**/*.{ts,tsx}"),
  ].filter((f) => !f.includes("node_modules") && !/\.(test|spec)\./.test(f));

  const out = new Map<string, string[]>();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/storage\s*\.from\(\s*"([a-z0-9-]+)"\s*\)/g)) {
      const list = out.get(m[1]) ?? [];
      list.push(file.replace(/\\/g, "/"));
      out.set(m[1], list);
    }
  }
  return out;
}

const DECLARED = declaredBuckets();

describe("storage buckets", () => {
  it("parses a non-empty set of buckets from the SQL (or this test proves nothing)", () => {
    expect(DECLARED.size).toBeGreaterThan(0);
    expect(DECLARED.has("event-attachments")).toBe(true);
  });

  // The regression itself.
  it("decomiso evidence uploads to a bucket that exists", () => {
    expect(DECLARED.has(ATTACHMENT_BUCKET)).toBe(true);
  });

  // The bucket the upload targets must also be the one the signer reads, or the
  // rows land in `attachments` and no surface can ever render them.
  it("decomiso evidence lands in the bucket lib/infra/storage.ts signs", () => {
    const signer = readFileSync("lib/infra/storage.ts", "utf8");
    expect(signer).toContain(`.from("${ATTACHMENT_BUCKET}")`);
  });

  it("every hardcoded storage.from(...) target exists", () => {
    const missing: string[] = [];
    for (const [bucket, files] of literalBucketsInCode()) {
      if (!DECLARED.has(bucket)) missing.push(`${bucket} (${files.join(", ")})`);
    }
    expect(
      missing,
      `These buckets are written to in code but created nowhere in db/**.sql:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("scans a non-empty corpus", () => {
    expect(literalBucketsInCode().size).toBeGreaterThan(0);
  });
});
