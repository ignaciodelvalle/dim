import { and, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { auditLog, db, profiles } from "@/db";
import { auditActionLabel } from "@/lib/audit-action-labels";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/keyset-pagination";
import { likeContains } from "@/lib/like-helpers";

const AUDITORIA_PAGE_LIMIT = 200;

export default async function AdminAuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; actor?: string; cursor?: string }>;
}) {
  await requireAdminOrRedirect();

  const sp = await searchParams;
  const actionFilter = sp.action?.trim() || null;
  const actorFilter = sp.actor?.trim() || null;
  const rawCursor = sp.cursor;
  const cursor = decodeCursor(rawCursor);

  // Build WHERE clause — push both filters into SQL so the LIMIT is
  // applied after filtering (JS-side filtering would silently miss rows
  // beyond the cap). actionFilter uses ILIKE for substring match;
  // actorFilter uses exact equality on the UUID column.
  // Keyset predicate is AND-composed last.
  const filterClauses = [];
  if (actionFilter)
    filterClauses.push(sql`${auditLog.action} ILIKE ${likeContains(actionFilter)} ESCAPE '\\'`);
  if (actorFilter) filterClauses.push(eq(auditLog.actorUserId, actorFilter));
  const cursorClause = keysetWhere(auditLog.performedAt, auditLog.id, cursor);
  if (cursorClause) filterClauses.push(cursorClause);
  const whereClause = filterClauses.length > 0 ? and(...filterClauses) : undefined;

  // Fetch limit+1 to detect hasMore.
  const rawEntries = await db
    .select({
      id: auditLog.id,
      actorUserId: auditLog.actorUserId,
      action: auditLog.action,
      approvalRequestId: auditLog.approvalRequestId,
      targetUserId: auditLog.targetUserId,
      performedAt: auditLog.performedAt,
    })
    .from(auditLog)
    .where(whereClause)
    .orderBy(desc(auditLog.performedAt), desc(auditLog.id))
    .limit(AUDITORIA_PAGE_LIMIT + 1);

  const hasMore = rawEntries.length > AUDITORIA_PAGE_LIMIT;
  const entries = hasMore ? rawEntries.slice(0, AUDITORIA_PAGE_LIMIT) : rawEntries;

  // Pagination links — changing a filter resets cursor to page 1.
  const filterParams: Record<string, string | undefined> = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(actorFilter ? { actor: actorFilter } : {}),
  };
  const lastEntry = entries.at(-1);
  const olderLink =
    hasMore && lastEntry
      ? olderHref("/admin/auditoria", filterParams, {
          ts: lastEntry.performedAt,
          id: lastEntry.id,
        })
      : null;
  const newerLink = rawCursor ? newerHref("/admin/auditoria", filterParams) : null;

  // Resolve actor names in one batch. actorUserId is nullable (ARCH-H,
  // migration 0080): rows whose actor was hard-deleted have NULL actor_user_id.
  const actorIds = Array.from(
    new Set(entries.map((e) => e.actorUserId).filter((id): id is string => id !== null)),
  );
  const namesById = new Map<string, string>();
  if (actorIds.length > 0) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, actorIds));
    for (const r of rows) namesById.set(r.id, r.displayName);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Auditoría global</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Últimas {entries.length} entradas del registro de auditoría (todas las acciones de
          autoridad).
        </p>
      </header>

      <form action="/admin/auditoria" method="get" className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="action"
          defaultValue={actionFilter ?? ""}
          placeholder="Filtrar por acción"
          className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <button
          type="submit"
          className="rounded-[6px] bg-ln-op-azul px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
        >
          Filtrar
        </button>
        {(actionFilter || actorFilter) && (
          <a
            href="/admin/auditoria"
            className="text-[12px] text-ln-op-mute underline underline-offset-4"
          >
            Limpiar filtros
          </a>
        )}
      </form>

      {entries.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">No hay entradas que coincidan.</p>
      ) : (
        <OpCard>
          <OpCardHead
            title="Registro de auditoría"
            actions={<span className="text-[12px] text-ln-op-mute">{entries.length} entradas</span>}
          />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[13px] font-medium text-ln-op-ink" title={entry.action}>
                      {auditActionLabel(entry.action)}
                    </p>
                    <p className="text-[12px] text-ln-op-mute">
                      {entry.actorUserId
                        ? (namesById.get(entry.actorUserId) ?? "Desconocido")
                        : "Usuario eliminado"}
                      {entry.approvalRequestId && (
                        <>
                          {" "}
                          {"·"} req:{" "}
                          <span className="font-ln-mono">
                            {entry.approvalRequestId.slice(0, 8)}&#x2026;
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <time className="whitespace-nowrap text-[12px] text-ln-op-mute">
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
          aria-label="Paginación de auditoría"
          className="flex items-center justify-between gap-4 border-t border-ln-op-line pt-4"
        >
          <div>
            {newerLink && (
              <Link
                href={newerLink}
                className="text-[12px] font-medium text-ln-op-azul no-underline hover:underline"
              >
                ← Más recientes
              </Link>
            )}
          </div>
          <div>
            {olderLink && (
              <Link
                href={olderLink}
                className="text-[12px] font-medium text-ln-op-azul no-underline hover:underline"
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
