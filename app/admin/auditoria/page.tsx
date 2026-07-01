import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { OpButton, OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { type AuditLogAction, auditLog, db, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { AUDIT_ACTION_LABELS, auditActionLabel } from "@/lib/ui/audit-action-labels";
import { buildTargetLinkInfo } from "@/lib/ui/audit-target-link";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";

const AUDITORIA_PAGE_LIMIT = 200;

export default async function AdminAuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; actor?: string; cursor?: string }>;
}) {
  await requireAdminOrRedirect();

  const sp = await searchParams;
  // actionFilter is now a known enum code (from dropdown), not a free-text ILIKE.
  // We validate it against AUDIT_ACTION_LABELS keys before trusting it.
  const rawAction = sp.action?.trim() || null;
  const actionFilter: AuditLogAction | null =
    rawAction && rawAction in AUDIT_ACTION_LABELS ? (rawAction as AuditLogAction) : null;
  const actorFilter = sp.actor?.trim() || null;
  const rawCursor = sp.cursor;
  const cursor = decodeCursor(rawCursor);

  // Build WHERE clause — push both filters into SQL so the LIMIT is
  // applied after filtering (JS-side filtering would silently miss rows
  // beyond the cap). actionFilter uses exact equality on the enum code;
  // actorFilter uses exact equality on the UUID column.
  // Keyset predicate is AND-composed last.
  const filterClauses = [];
  if (actionFilter) filterClauses.push(eq(auditLog.action, actionFilter));
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

  // Resolve target display names + roles in one batch (C12).
  // targetUserId is nullable — only resolve when present.
  const targetIds = Array.from(
    new Set(entries.map((e) => e.targetUserId).filter((id): id is string => id !== null)),
  );
  // Map id → { displayName, href } for rendering "sobre: {name}"
  const targetsById = new Map<string, { displayName: string; href: string | null }>();
  if (targetIds.length > 0) {
    const targetRows = await db
      .select({ id: profiles.id, displayName: profiles.displayName, role: profiles.role })
      .from(profiles)
      .where(inArray(profiles.id, targetIds));
    for (const r of targetRows) {
      const info = buildTargetLinkInfo({ id: r.id, displayName: r.displayName, role: r.role });
      targetsById.set(r.id, { displayName: info.displayName, href: info.href });
    }
  }

  // Build actor options for the dropdown (C30): resolve distinct actors from the
  // current page + any selected actor not on this page so the dropdown still
  // shows the selected name after pagination.
  const actorOptions: { id: string; name: string }[] = actorIds
    .map((id) => ({ id, name: namesById.get(id) ?? "Desconocido" }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-AR"));

  if (actorFilter && !actorOptions.find((o) => o.id === actorFilter)) {
    const [extra] = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, actorFilter))
      .limit(1);
    if (extra) {
      actorOptions.push({ id: extra.id, name: extra.displayName });
      actorOptions.sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
    }
  }

  // Known action codes+labels for the dropdown — derived from AUDIT_ACTION_LABELS.
  const actionOptions = Object.entries(AUDIT_ACTION_LABELS).sort((a, b) =>
    a[1].localeCompare(b[1], "es-AR"),
  );

  const hasFilters = actionFilter !== null || actorFilter !== null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Auditoría global</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Últimas {entries.length} entradas del registro de auditoría (todas las acciones de
          autoridad).
        </p>
      </header>

      <form action="/admin/auditoria" method="get" className="flex flex-wrap items-end gap-2">
        {/* Action filter — dropdown of known labels (value = enum code) */}
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-action" className="text-[11px] font-medium text-ln-op-mute">
            Acción
          </label>
          <select
            id="audit-action"
            name="action"
            defaultValue={actionFilter ?? ""}
            className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">Todas las acciones</option>
            {actionOptions.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Actor filter — dropdown of names present in the current result page */}
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-actor" className="text-[11px] font-medium text-ln-op-mute">
            Actor
          </label>
          <select
            id="audit-actor"
            name="actor"
            defaultValue={actorFilter ?? ""}
            className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">Todos los actores</option>
            {actorOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <OpButton type="submit" variant="primary" size="sm">
          Filtrar
        </OpButton>
        {hasFilters && (
          <a
            href="/admin/auditoria"
            className="text-sm text-ln-op-mute underline underline-offset-4"
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
                    <p className="text-[13px] font-medium text-ln-op-ink" title={entry.action}>
                      {auditActionLabel(entry.action)}
                    </p>
                    <p className="text-sm text-ln-op-mute">
                      {entry.actorUserId
                        ? (namesById.get(entry.actorUserId) ?? "Desconocido")
                        : "Usuario eliminado"}
                      {entry.targetUserId &&
                        (() => {
                          const target = targetsById.get(entry.targetUserId);
                          const targetName = target?.displayName ?? "Usuario eliminado";
                          const targetHref = target?.href ?? null;
                          return (
                            <>
                              {" "}
                              {"·"} sobre:{" "}
                              {targetHref ? (
                                <Link
                                  href={targetHref}
                                  className="underline underline-offset-2 hover:text-ln-op-ink"
                                >
                                  {targetName}
                                </Link>
                              ) : (
                                <span>{targetName}</span>
                              )}
                            </>
                          );
                        })()}
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
          aria-label="Paginación de auditoría"
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
