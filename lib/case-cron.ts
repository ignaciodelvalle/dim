// Shared cron runner for case-system crons. Encapsulates:
//  - cron-secret auth (via authorizeCronRequest from lib/cron-auth.ts)
//  - cronRuns INSERT (status='running') + UPDATE (status='ok'|'failed')
//  - per-candidate try/catch so one bad row doesn't poison the batch
//  - error aggregation into cron_runs.details
//
// Each case-system cron route (route.ts) imports this and supplies the
// scan/process pair. The route itself owns the `NextResponse.json` shape
// so we can keep this helper framework-agnostic and unit-testable.

import { eq } from "drizzle-orm";

import { cronRuns, db } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";

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
 * Standardized cron request auth check. Returns `null` on success or
 * a `{ ok: false, error, status }` triple on failure that the caller
 * route can serialize directly to NextResponse.json.
 *
 * Delegates to authorizeCronRequest (lib/cron-auth.ts) which accepts both
 * `Authorization: Bearer <CRON_SECRET>` (Vercel contract) and the legacy
 * `x-cron-secret` header.
 *
 * @deprecated Prefer importing `authorizeCronRequest` from `@/lib/cron-auth`
 *   directly. This wrapper exists for routes that already use checkCronSecret
 *   so they can migrate incrementally.
 */
export function checkCronSecret(req: {
  headers: { get(name: string): string | null };
}): { ok: false; error: string; status: number } | null {
  return authorizeCronRequest(req);
}
