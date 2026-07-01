import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { approvalRequests, auditLog, db, profiles } from "@/db";
import { auditActionLabel } from "@/lib/audit-action-labels";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";

const ADMIN_HISTORIAL_PAGE_LIMIT = 100;

export default async function AdminHistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { user } = await requireAdminOrRedirect();
  const { cursor: rawCursor } = await searchParams;
  const cursor = decodeCursor(rawCursor);

  // Keyset predicate — only rows older than cursor.
  const cursorClause = keysetWhere(auditLog.performedAt, auditLog.id, cursor);
  const whereClause = cursorClause
    ? and(eq(auditLog.actorUserId, user.id), cursorClause)
    : eq(auditLog.actorUserId, user.id);

  // Entries and actor profile are independent — run in parallel.
  // Fetch limit+1 to detect hasMore for keyset pagination (PERF-5).
  const [[actor], rawEntries] = await Promise.all([
    db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        performedAt: auditLog.performedAt,
        approvalRequestId: auditLog.approvalRequestId,
      })
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.performedAt), desc(auditLog.id))
      .limit(ADMIN_HISTORIAL_PAGE_LIMIT + 1),
  ]);

  const hasMore = rawEntries.length > ADMIN_HISTORIAL_PAGE_LIMIT;
  const entries = hasMore ? rawEntries.slice(0, ADMIN_HISTORIAL_PAGE_LIMIT) : rawEntries;

  const lastEntry = entries.at(-1);
  const olderLink =
    hasMore && lastEntry
      ? olderHref("/admin/historial", {}, { ts: lastEntry.performedAt, id: lastEntry.id })
      : null;
  const newerLink = rawCursor ? newerHref("/admin/historial", {}) : null;

  // Build a lookup from approvalRequestId → publicToken so we can link to the
  // detail page instead of showing raw UUIDs (P2 audit action labels).
  const reqIds = entries.map((e) => e.approvalRequestId).filter((id): id is string => id !== null);
  const tokenByReqId = new Map<string, string>();
  if (reqIds.length > 0) {
    const reqRows = await db
      .select({ id: approvalRequests.id, publicToken: approvalRequests.publicToken })
      .from(approvalRequests)
      .where(inArray(approvalRequests.id, reqIds));
    for (const r of reqRows) tokenByReqId.set(r.id, r.publicToken);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Mi historial</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Últimas {entries.length} acciones realizadas por{" "}
          <span className="font-semibold">{actor?.displayName ?? user.id}</span>.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">No registraste acciones todavía.</p>
      ) : (
        <OpCard>
          <OpCardHead
            title="Acciones registradas"
            actions={<span className="text-sm text-ln-op-mute">{entries.length} entradas</span>}
          />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[13px] text-ln-op-ink">{auditActionLabel(entry.action)}</p>
                    {entry.approvalRequestId &&
                      (() => {
                        const token = tokenByReqId.get(entry.approvalRequestId);
                        return token ? (
                          <Link
                            href={`/gob/cola/${token}`}
                            className="font-mono text-[11px] text-ln-op-azul underline underline-offset-2 hover:opacity-80"
                          >
                            Ver solicitud →
                          </Link>
                        ) : (
                          <p className="font-mono text-[11px] text-ln-op-mute">
                            req: {entry.approvalRequestId.slice(0, 8)}…
                          </p>
                        );
                      })()}
                  </div>
                  <time className="whitespace-nowrap text-sm text-ln-op-mute">
                    {new Date(entry.performedAt).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
      )}

      {/* Pagination footer */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de historial"
          className="flex items-center justify-between gap-4 border-t border-ln-op-line pt-4"
        >
          <div>
            {newerLink && (
              <Link
                href={newerLink}
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
              >
                ← Más recientes
              </Link>
            )}
          </div>
          <div>
            {olderLink && (
              <Link
                href={olderLink}
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
              >
                Ver más antiguos →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
