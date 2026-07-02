// Cron route — re-evaluate PPP classification (breed list + weight
// threshold) across all configured jurisdictions.
// Spec 2026-05-19-govt-business-rules-poc-design §4.5; admin-rules-console ADR-3.
//
// GET /api/cron/business-rules-reeval
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
//
// Use case: belt-and-suspenders sweep. The writer (createBusinessRuleAction
// etc.) already re-evals inline after each successful write, so this cron
// is for safety nets — recovering from a writer-time crash, applying a
// breeds.ts edit that changed the AR default, etc. Idempotent.

import { type NextRequest, NextResponse } from "next/server";

import { db, govtBusinessRules } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { reEvaluatePppClassificationChange } from "@/lib/infra/business-rules-reeval";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();
  try {
    // Re-eval every distinct jurisdiction that has a ppp_breed_list OR
    // ppp_weight_threshold row (either can affect classification via the
    // composed resolver). Also include a single "default AR scan" so pets
    // in AR without any override still get re-evaluated against the
    // hardcoded defaults.
    const rows = await db
      .select({
        country: govtBusinessRules.jurisdictionCountry,
        province: govtBusinessRules.jurisdictionProvince,
        locality: govtBusinessRules.jurisdictionLocality,
      })
      .from(govtBusinessRules)
      .where(inArray(govtBusinessRules.ruleType, ["ppp_breed_list", "ppp_weight_threshold"]));

    let totalScanned = 0;
    let totalFlippedToPpp = 0;
    let totalFlippedToNonPpp = 0;
    let totalNotified = 0;

    // Always include the country-level default scan first.
    const scopes: { country: string; province: string | null; locality: string | null }[] = [
      { country: "AR", province: null, locality: null },
      ...rows.map((r) => ({
        country: r.country,
        province: r.province,
        locality: r.locality,
      })),
    ];

    for (const scope of scopes) {
      const result = await reEvaluatePppClassificationChange(scope);
      totalScanned += result.scanned;
      totalFlippedToPpp += result.flippedToPpp;
      totalFlippedToNonPpp += result.flippedToNonPpp;
      totalNotified += result.notified;
    }

    return NextResponse.json({
      ok: true,
      scopes: scopes.length,
      scanned: totalScanned,
      flippedToPpp: totalFlippedToPpp,
      flippedToNonPpp: totalFlippedToNonPpp,
      notified: totalNotified,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "error desconocido",
      },
      { status: 500 },
    );
  }
}
