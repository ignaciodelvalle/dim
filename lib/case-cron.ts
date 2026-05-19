// Shared cron runner for case-system crones. Encapsulates:
//  - cron-secret auth (header `x-cron-secret`)
//  - cronRuns INSERT (status='running') + UPDATE (status='ok'|'failed')
//  - per-candidate try/catch so one bad row doesn't poison the batch
//  - error aggregation into cron_runs.details
//
// Each case-system cron route (route.ts) imports this and supplies the
// scan/process pair. The route itself owns the `NextResponse.json` shape
// so we can keep this helper framework-agnostic and unit-testable.

import { eq } from "drizzle-orm";

import { cronRuns, db } from "@/db";

export interface RunCaseCronInput<TCandidate> {
  /** Stable name for this cron — used as the `cron_runs.cron_name` value. */
  name: string;
  /** Returns the list of candidate rows to process this run. */
  scan: () => Promise<TCandidate[]>;
  /** Processes a single candidate inside its own transaction. */
  processOne: (candidate: TCandidate) => Promise<void>;
  /**
   * Extracts a stable id from a candidate — used for error reporting in
   * `cron_runs.details.errors[]`. Default: `(c) => (c as { id: string }).id`.
   */
  candidateId?: (candidate: TCandidate) => string;
}

export interface RunCaseCronResult {
  runId: string;
  status: "ok" | "failed";
  itemsProcessed: number;
  errors: { id: string; reason: string }[];
}

export async function runCaseCron<TCandidate>(
  input: RunCaseCronInput<TCandidate>,
): Promise<RunCaseCronResult> {
  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: input.name, status: "running" })
    .returning();

  let itemsProcessed = 0;
  let status: "ok" | "failed" = "ok";
  const errors: { id: string; reason: string }[] = [];
  const idOf = input.candidateId ?? ((c: TCandidate) => (c as { id: string }).id);

  try {
    const candidates = await input.scan();
    for (const candidate of candidates) {
      try {
        await input.processOne(candidate);
        itemsProcessed += 1;
      } catch (err) {
        errors.push({
          id: idOf(candidate),
          reason: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  } catch (err) {
    status = "failed";
    errors.push({ id: "global", reason: err instanceof Error ? err.message : "unknown" });
  }

  await db
    .update(cronRuns)
    .set({
      status,
      finishedAt: new Date(),
      itemsProcessed,
      details: errors.length > 0 ? { errors } : {},
    })
    .where(eq(cronRuns.id, run.id));

  return { runId: run.id, status, itemsProcessed, errors };
}

/**
 * Standardized cron-secret header check. Returns `null` on success or
 * a `{ ok: false, error, status }` triple on failure that the caller
 * route can serialize directly to NextResponse.json.
 */
export function checkCronSecret(headerValue: string | null): {
  ok: false;
  error: string;
  status: number;
} | null {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (headerValue !== cronSecret) {
      return { ok: false, error: "Unauthorized", status: 401 };
    }
    return null;
  }
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "CRON_SECRET not configured in production", status: 401 };
  }
  // Non-production fallback: allow but warn at the call site.
  return null;
}
