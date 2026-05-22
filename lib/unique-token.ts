// Generic unique-token wrapper for short prefixed IDs (DIM, LBR, APR, OFR, APT, ...).
//
// Two helpers:
//
//   generateUniqueToken(table, column, generator) — pre-INSERT advisory
//     check that the generated value doesn't already exist. Retries up
//     to 5 times. Each retry calls `generator()` fresh. The DB unique
//     index remains the source of truth — callers should still trap
//     `isUniqueViolation(err)` from the INSERT and retry if they care
//     about the TOCTOU window between SELECT and INSERT.
//
//   isUniqueViolation(err) — narrows an unknown error to a Postgres
//     unique-constraint violation (SQLSTATE 23505). Use in a try/catch
//     around INSERTs that depend on a freshly-allocated token.
//
// The pre-check approach mirrors `generateUniqueCasePublicCode` in
// lib/case-helpers.ts. For new code, prefer using BOTH helpers
// together: pre-check to keep happy-path traffic cheap, isUniqueViolation
// to handle the race that pre-check leaves open.

import { eq } from "drizzle-orm";
import type { AnyPgTable, PgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";

const DEFAULT_MAX_RETRIES = 5;

type Executor = Pick<typeof db, "select">;

export interface UniqueTokenOptions {
  maxRetries?: number;
  /** Pass `tx` here when calling from inside `db.transaction(async (tx) => …)`. */
  executor?: Executor;
}

/**
 * Generate a token and verify it isn't already present in `(table, column)`.
 *
 * Returns the first candidate that passes the existence check. Throws
 * after `maxRetries` (default 5) consecutive collisions.
 *
 * NOTE: This check is *advisory* — another transaction can insert
 * between this SELECT and the caller's INSERT. The DB's unique index
 * is the real guard. Pair with `isUniqueViolation` for defense in depth.
 */
export async function generateUniqueToken<TTable extends AnyPgTable>(
  table: TTable,
  column: PgColumn,
  generator: () => string,
  options: UniqueTokenOptions = {},
): Promise<string> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const executor = options.executor ?? db;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const candidate = generator();
    const [existing] = await executor
      .select({ marker: column })
      .from(table)
      .where(eq(column, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new Error(`generateUniqueToken: exhausted ${maxRetries} retries`);
}

interface PgErrorLike {
  code?: unknown;
}

/** SQLSTATE 23505 = unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as PgErrorLike).code;
  if (code === "23505") return true;
  // Drizzle/postgres-js sometimes nests the original error.
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && (cause as PgErrorLike).code === "23505") return true;
  return false;
}
