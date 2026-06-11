// Cron route — close lost_pet_episode cases inactive >180 days.
//
// GET /api/cron/close-stale-lost-episodes
// Auth: `x-cron-secret` header must match process.env.CRON_SECRET.
// Returns: { status, itemsProcessed, runId }

import { type NextRequest, NextResponse } from "next/server";

import {
  type CloseStaleLostEpisodesCandidate,
  closeStaleLostEpisode,
  findStaleLostEpisodes,
} from "@/lib/case-closers/close-stale-lost-episodes";
import { checkCronSecret, runCaseCron } from "@/lib/case-cron";

export const dynamic = "force-dynamic";

const CRON_NAME = "close_stale_lost_episodes";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronSecret(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const result = await runCaseCron<CloseStaleLostEpisodesCandidate>({
    name: CRON_NAME,
    scan: () => findStaleLostEpisodes(),
    processOne: (candidate) => closeStaleLostEpisode(candidate),
  });

  return NextResponse.json({
    status: result.status,
    itemsProcessed: result.itemsProcessed,
    runId: result.runId,
  });
}
