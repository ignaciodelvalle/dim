// Cron route — auto-expire approval_requests that have been `pending` for
// more than 60 days. Each candidate is swept inside its own tx so a single
// row's failure doesn't poison the rest of the batch.
//
// GET /api/cron/auto-expire-approvals
// Auth: `x-cron-secret` header must match process.env.CRON_SECRET.
//
// Returns: { status: "ok" | "failed", itemsProcessed, runId }

import { type NextRequest, NextResponse } from "next/server";

import { and, eq, isNull, lt } from "drizzle-orm";

import { approvalRequests, auditLog, cronRuns, db, notifications, profiles } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_DAYS = 60;
// Canonical name: snake_case of the route directory (cron-registry SSOT rule,
// projection-cron audit 2026-07-03 B2) — was mismatched with the registry, so
// cron-health reported this cron never_ran while telemetry accrued elsewhere.
const CRON_NAME = "auto_expire_approvals";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  // Pick the oldest active admin as the system actor. audit_log.actor_user_id
  // is a nullable SET NULL FK (migration 0080) — a real profile is no longer
  // required, but using a real admin actor produces more meaningful audit rows.
  const [systemActor] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.role, "admin"),
        eq(profiles.accountType, "institutional"),
        isNull(profiles.deactivatedAt),
      ),
    )
    .orderBy(profiles.createdAt)
    .limit(1);

  if (!systemActor) {
    return NextResponse.json(
      { ok: false, error: "no_active_admin_for_system_actor" },
      { status: 500 },
    );
  }

  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "running" })
    .returning();

  const cutoff = new Date(Date.now() - EXPIRY_DAYS * DAY_MS);
  let itemsProcessed = 0;
  let status: "ok" | "failed" = "ok";
  const errors: { id: string; reason: string }[] = [];

  try {
    const stale = await db
      .select({
        id: approvalRequests.id,
        publicToken: approvalRequests.publicToken,
        applicantUserId: approvalRequests.applicantUserId,
        createdAt: approvalRequests.createdAt,
      })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.status, "pending"), lt(approvalRequests.createdAt, cutoff)));

    for (const r of stale) {
      try {
        await db.transaction(async (tx) => {
          // Anti-race: only update if still pending. If somebody approved/
          // rejected/withdrew between the SELECT and the UPDATE, skip silently.
          const updated = await tx
            .update(approvalRequests)
            .set({
              status: "withdrawn",
              withdrawnAt: new Date(),
              decisionNotes: "Auto-expirada por inactividad mayor a 60 días",
              updatedAt: new Date(),
            })
            .where(and(eq(approvalRequests.id, r.id), eq(approvalRequests.status, "pending")))
            .returning({ id: approvalRequests.id });
          if (updated.length === 0) return;

          await tx.insert(auditLog).values({
            actorUserId: systemActor.id,
            action: "approval_request_withdrawn_by_system",
            approvalRequestId: r.id,
            payload: {
              reason: "auto_expired",
              cron_run_id: run.id,
              days_pending: Math.floor((Date.now() - r.createdAt.getTime()) / DAY_MS),
            },
          });

          await tx.insert(notifications).values({
            userId: r.applicantUserId,
            notificationType: "approval_request_auto_expired",
            title: "Tu solicitud fue auto-expirada",
            body: "Tu solicitud pendiente fue cerrada automáticamente por inactividad mayor a 60 días. Podés volver a iniciarla cuando quieras.",
            severity: "info",
            ctaLabel: "Ver solicitudes",
            ctaUrl: "/cuenta/solicitudes",
          });
        });
        itemsProcessed += 1;
      } catch (err) {
        errors.push({ id: r.id, reason: err instanceof Error ? err.message : "unknown" });
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

  return NextResponse.json({ status, itemsProcessed, runId: run.id });
}
