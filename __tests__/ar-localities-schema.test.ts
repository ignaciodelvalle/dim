// Verifies that migration 0019 applied correctly: tables exist, CHECK
// constraints reject invalid values, and the partial unique index fires on
// duplicates.

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { arLocalities, db } from "@/db";

const TEST_SLUG_PREFIX = "schematest-";

afterEach(async () => {
  // Tests insert rows with slugs prefixed by TEST_SLUG_PREFIX so we can clean
  // up without nuking the real catalog if it has been imported.
  const rows = await db.select({ id: arLocalities.id }).from(arLocalities);
  // Drizzle's filter API doesn't have ILIKE off-the-shelf; cleanup via raw
  // is overkill here since we know the exact slugs inserted by each test.
  for (const _ of rows) {
    // No-op; the per-test inserts handle their own cleanup.
  }
});

describe("ar_localities schema", () => {
  it("accepts a valid row and round-trips it", async () => {
    const slug = `${TEST_SLUG_PREFIX}happy-${Date.now()}`;
    const [row] = await db
      .insert(arLocalities)
      .values({
        provinceCode: "AR-C",
        localityName: "Test Locality",
        localitySlug: slug,
        category: "localidad",
        source: "manual",
      })
      .returning();
    expect(row.localitySlug).toBe(slug);
    expect(row.lastImportedAt).toBeInstanceOf(Date);
    expect(row.removedAt).toBeNull();
    await db.delete(arLocalities).where(eq(arLocalities.id, row.id));
  });

  it("rejects an invalid province_code via the CHECK constraint", async () => {
    await expect(
      db.insert(arLocalities).values({
        provinceCode: "INVALID",
        localityName: "Test",
        localitySlug: `${TEST_SLUG_PREFIX}bad-province-${Date.now()}`,
        category: "localidad",
        source: "manual",
      }),
    ).rejects.toThrow(/ar_localities_province_valid/);
  });

  it("rejects an invalid category via the CHECK constraint", async () => {
    await expect(
      db.insert(arLocalities).values({
        provinceCode: "AR-C",
        localityName: "Test",
        localitySlug: `${TEST_SLUG_PREFIX}bad-cat-${Date.now()}`,
        // biome-ignore lint/suspicious/noExplicitAny: intentional schema violation
        category: "invalid_cat" as any,
        source: "manual",
      }),
    ).rejects.toThrow(/ar_localities_category_valid/);
  });

  it("rejects an invalid source via the CHECK constraint", async () => {
    await expect(
      db.insert(arLocalities).values({
        provinceCode: "AR-C",
        localityName: "Test",
        localitySlug: `${TEST_SLUG_PREFIX}bad-source-${Date.now()}`,
        category: "localidad",
        // biome-ignore lint/suspicious/noExplicitAny: intentional schema violation
        source: "wikipedia" as any,
      }),
    ).rejects.toThrow(/ar_localities_source_valid/);
  });

  it("enforces (province_code, locality_slug) uniqueness while removed_at IS NULL", async () => {
    const slug = `${TEST_SLUG_PREFIX}duplicate-${Date.now()}`;
    const base = {
      provinceCode: "AR-C",
      localityName: "Duplicado",
      localitySlug: slug,
      category: "localidad" as const,
      source: "manual" as const,
    };
    const [first] = await db.insert(arLocalities).values(base).returning();
    await expect(db.insert(arLocalities).values(base)).rejects.toThrow();
    await db.delete(arLocalities).where(eq(arLocalities.id, first.id));
  });

  it("allows a re-insert with the same (province, slug) once the original is soft-deleted", async () => {
    const slug = `${TEST_SLUG_PREFIX}revive-${Date.now()}`;
    const base = {
      provinceCode: "AR-C",
      localityName: "Revive",
      localitySlug: slug,
      category: "localidad" as const,
      source: "manual" as const,
    };
    const [first] = await db.insert(arLocalities).values(base).returning();
    // Soft-delete: removedAt set → partial unique index no longer covers this row.
    await db
      .update(arLocalities)
      .set({ removedAt: new Date() })
      .where(eq(arLocalities.id, first.id));
    const [second] = await db.insert(arLocalities).values(base).returning();
    expect(second.id).not.toBe(first.id);
    await db.delete(arLocalities).where(eq(arLocalities.id, first.id));
    await db.delete(arLocalities).where(eq(arLocalities.id, second.id));
  });
});
