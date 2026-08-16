// Use-cases: logPiiQueryForAuthority + logPiiReadSafely
//
// logPiiReadSafely delegates to logPiiQueryForAuthority; they are kept in the
// same file because of that tight coupling.

import { auditLog, db } from "@/db";

// Logged on every PII read so it leaves a trail. Callers await this so the
// audit row (the Ley 25.326 accountability guarantee) is durable before the
// page returns. AC2: list pages log BOTH the typed-query search and the
// no-query landing (query=""), since the landing still exposes the first N
// users' name/id/role.
// Every surface that reads PII and leaves a pii_queried trail. List/search
// surfaces log the typed query; DETAIL surfaces (Lote B3: pet_profile,
// case_detail, observacion_detail — the highest-exposure reads, previously
// untraced) log the viewed subject's public token/code as the query. Free-form
// JSONB payload value, not a schema column — no migration needed.
export type PiiSurface =
  | "users"
  | "organizations"
  | "omnibox"
  | "pet_profile"
  | "case_detail"
  | "observacion_detail";

export async function logPiiQueryForAuthority(
  actorUserId: string,
  query: string,
  resultCount: number,
  surface: PiiSurface,
): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId,
    action: "pii_queried",
    payload: { query, result_count: resultCount, surface },
  });
}

// AC2: safe wrapper for list-page PII logging. Awaited so the audit row is
// durable, but a failing insert must NOT break the page render — it is logged
// to console.error and swallowed. Returns true on success, false on failure,
// so it stays unit-testable without a Next.js render context.
// @no-auth-required: thin wrapper over logPiiQueryForAuthority (an inner
// writer). Only callers are /gob list pages already gated by the /gob layout
// guard, which supplies the authenticated actorUserId; this function adds no
// new capability beyond that inner writer.
export async function logPiiReadSafely(
  actorUserId: string,
  query: string,
  resultCount: number,
  surface: PiiSurface,
): Promise<boolean> {
  try {
    await logPiiQueryForAuthority(actorUserId, query, resultCount, surface);
    return true;
  } catch (e) {
    console.error(`pii_queried log failed (${surface} list)`, e);
    return false;
  }
}
