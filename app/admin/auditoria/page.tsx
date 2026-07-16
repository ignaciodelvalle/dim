import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import Link from "next/link";

import { DateInputAr } from "@/components/ui/DateInputAr";
import { OpButton, OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { auditLog, db, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { AUDIT_ACTION_LABELS, auditActionLabel } from "@/lib/ui/audit-action-labels";
import { parseAuditActions, parseAuditDateRange } from "@/lib/ui/audit-filters";
import { groupConsecutiveAuditRows } from "@/lib/ui/audit-row-grouping";
import { buildTargetLinkInfo, businessRuleTargetSummary } from "@/lib/ui/audit-target-link";
import { formatDateTime } from "@/lib/utils/format";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";

const AUDITORIA_PAGE_LIMIT = 200;

export default async function AdminAuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
    cursor?: string;
  }>;
}) {
  await requireAdminOrRedirect();

  const sp = await searchParams;
  // action is a (possibly comma-separated) list of known enum codes, validated
  // against AUDIT_ACTION_LABELS keys before trusting it — never a free-text ILIKE.
  // Multi-action powers the "Decisiones 7d" KPI drill (approved + rejected).
  const actionFilters = parseAuditActions(sp.action);
  const actorFilter = sp.actor?.trim() || null;
  // Date-range filter (date-only, YYYY-MM-DD). `until` is exclusive (whole `to`
  // day included). Powers the KPI drill's trailing-7d scope.
  const { since, until } = parseAuditDateRange(sp.from, sp.to);
  const fromValid = since ? sp.from : undefined;
  const toValid = until ? sp.to : undefined;
  const rawCursor = sp.cursor;
  const cursor = decodeCursor(rawCursor);

  // Build WHERE clause — push every filter into SQL so the LIMIT is
  // applied after filtering (JS-side filtering would silently miss rows
  // beyond the cap). action uses IN over the validated enum codes; actor uses
  // exact UUID equality; the date range is a half-open [since, until) interval.
  // Keyset predicate is AND-composed last.
  const filterClauses = [];
  if (actionFilters.length > 0) filterClauses.push(inArray(auditLog.action, actionFilters));
  if (actorFilter) filterClauses.push(eq(auditLog.actorUserId, actorFilter));
  if (since) filterClauses.push(gte(auditLog.performedAt, since));
  if (until) filterClauses.push(lt(auditLog.performedAt, until));
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
      payload: auditLog.payload,
    })
    .from(auditLog)
    .where(whereClause)
    .orderBy(desc(auditLog.performedAt), desc(auditLog.id))
    .limit(AUDITORIA_PAGE_LIMIT + 1);

  const hasMore = rawEntries.length > AUDITORIA_PAGE_LIMIT;
  const entries = hasMore ? rawEntries.slice(0, AUDITORIA_PAGE_LIMIT) : rawEntries;

  // Pagination links — changing a filter resets cursor to page 1. The multi-
  // action list is preserved as a comma-joined param so paging past a KPI drill
  // keeps both decision actions in scope.
  const filterParams: Record<string, string | undefined> = {
    ...(actionFilters.length > 0 ? { action: actionFilters.join(",") } : {}),
    ...(actorFilter ? { actor: actorFilter } : {}),
    ...(fromValid ? { from: fromValid } : {}),
    ...(toValid ? { to: toValid } : {}),
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

  const hasFilters =
    actionFilters.length > 0 || actorFilter !== null || since !== null || until !== null;
  // The action <select> is single-select; when a KPI drill applies more than
  // one action (approved + rejected) it can't be represented there, so surface
  // the active action filter as a readable chip instead.
  const multiActionLabels =
    actionFilters.length > 1 ? actionFilters.map((a) => auditActionLabel(a)) : null;

  // Collapse consecutive runs of the same action+actor (e.g. a ~150-row bulk
  // override backfill) into one expandable group so real events stay scannable.
  const groups = groupConsecutiveAuditRows(entries);

  const actorName = (uid: string | null) =>
    uid ? (namesById.get(uid) ?? "Desconocido") : "Usuario eliminado";

  const fmtTime = (d: Date) => formatDateTime(d);

  // Link a collapsed run to the filtered view (same action + actor). action is
  // always a valid enum code; actor is omitted when the actor was hard-deleted.
  const runFilterHref = (action: string, uid: string | null) => {
    const params = new URLSearchParams({ action });
    if (uid) params.set("actor", uid);
    return `/admin/auditoria?${params.toString()}`;
  };

  // Shared row body — the label line + actor/target detail + timestamp. Reused
  // for standalone rows and for the expanded children of a collapsed run.
  const EntryBody = ({ entry }: { entry: (typeof entries)[number] }) => (
    <>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[var(--text-md)] font-medium text-ln-op-ink" title={entry.action}>
          {auditActionLabel(entry.action)}
        </p>
        <p className="text-sm text-ln-op-mute">
          {actorName(entry.actorUserId)}
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
              <span className="font-ln-mono">{entry.approvalRequestId.slice(0, 8)}&#x2026;</span>
            </>
          )}
          {(() => {
            const target = businessRuleTargetSummary(entry.action, entry.payload);
            return target ? (
              <>
                {" "}
                {"·"} sobre: <span className="font-ln-mono">{target}</span>
              </>
            ) : null;
          })()}
        </p>
      </div>
      <time className="whitespace-nowrap text-sm text-ln-op-mute">
        {fmtTime(entry.performedAt)}
      </time>
    </>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Auditoría global</h1>
        <p className="text-[var(--text-md)] text-ln-op-ink-2">
          {hasFilters
            ? `${entries.length} ${entries.length === 1 ? "entrada" : "entradas"} del registro de auditoría que coinciden con los filtros.`
            : `Últimas ${entries.length} entradas del registro de auditoría (todas las acciones de autoridad).`}
        </p>
      </header>

      <form action="/admin/auditoria" method="get" className="flex flex-wrap items-end gap-2">
        {/* Action filter. A single/absent action uses the dropdown; a multi-action
            drill (e.g. Decisiones 7d = aprobadas + rechazadas) can't be shown in a
            single-select, so it renders as a read-only chip backed by a hidden
            input — keeping exactly one `action` field and preserving both codes
            across pagination and re-submits. */}
        {multiActionLabels ? (
          <div className="flex flex-col gap-1">
            <span className="text-[var(--text-sm)] font-medium text-ln-op-mute">Acción</span>
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink">
              {multiActionLabels.join(" + ")}
            </span>
            <input type="hidden" name="action" value={actionFilters.join(",")} />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="audit-action"
              className="text-[var(--text-sm)] font-medium text-ln-op-mute"
            >
              Acción
            </label>
            <select
              id="audit-action"
              name="action"
              defaultValue={actionFilters.length === 1 ? actionFilters[0] : ""}
              className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
            >
              <option value="">Todas las acciones</option>
              {actionOptions.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date-range filter — date-only bounds (to is inclusive). */}
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-from" className="text-[var(--text-sm)] font-medium text-ln-op-mute">
            Desde
          </label>
          <DateInputAr
            id="audit-from"
            name="from"
            defaultValue={fromValid}
            className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-to" className="text-[var(--text-sm)] font-medium text-ln-op-mute">
            Hasta
          </label>
          <DateInputAr
            id="audit-to"
            name="to"
            defaultValue={toValid}
            className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          />
        </div>

        {/* Actor filter — dropdown of names present in the current result page */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-actor"
            className="text-[var(--text-sm)] font-medium text-ln-op-mute"
          >
            Actor
          </label>
          <select
            id="audit-actor"
            name="actor"
            defaultValue={actorFilter ?? ""}
            className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
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
        <p className="text-[var(--text-md)] text-ln-op-mute">No hay entradas que coincidan.</p>
      ) : (
        <OpCard>
          <OpCardHead
            title="Registro de auditoría"
            actions={<span className="text-sm text-ln-op-mute">{entries.length} entradas</span>}
          />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line-2">
              {groups.map((group) =>
                group.kind === "single" ? (
                  <li
                    key={group.row.id}
                    className="flex items-start justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                  >
                    <EntryBody entry={group.row} />
                  </li>
                ) : (
                  <li key={group.key} className="px-4 py-2 odd:bg-ln-op-stripe">
                    <details className="group/run">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 select-none">
                        <div className="min-w-0 space-y-0.5">
                          <p className="flex items-center gap-2 text-[var(--text-md)] font-medium text-ln-op-ink">
                            {auditActionLabel(group.action)}
                            <OpPill tone="neutral">×{group.count}</OpPill>
                          </p>
                          <p className="text-sm text-ln-op-mute">
                            {actorName(group.actorUserId)} {"·"} {group.count} acciones consecutivas{" "}
                            <span className="group-open/run:hidden">{"·"} tocá para expandir</span>{" "}
                            {"·"}{" "}
                            <a
                              href={runFilterHref(group.action, group.actorUserId)}
                              className="underline underline-offset-2 hover:text-ln-op-ink"
                            >
                              ver filtradas
                            </a>
                          </p>
                        </div>
                        <time className="whitespace-nowrap text-sm text-ln-op-mute">
                          {fmtTime(group.earliestAt)} {"–"} {fmtTime(group.latestAt)}
                        </time>
                      </summary>
                      <ul className="mt-2 divide-y divide-ln-op-line-2 border-l-2 border-ln-op-line pl-3">
                        {group.rows.map((entry) => (
                          <li
                            key={entry.id}
                            className="flex items-start justify-between gap-3 py-2"
                          >
                            <EntryBody entry={entry} />
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ),
              )}
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
