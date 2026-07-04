// /gob/historial — jurisdiction-scoped audit trail (Wave C, gob-audit-inventory).
//
// BEFORE: self-scoped only ("Mi actividad" — actorUserId = viewer). Could not
// answer "who did what in MY jurisdiction", even though audit_log already
// carries ~90 action types across the whole platform.
//
// AFTER: govt operators see every audit row whose actor shares an ACTIVE
// govt_assignment with them (peer accountability within the same territory —
// audit_log has no jurisdiction column of its own, see
// lib/infra/govt-audit-scope.ts for why the scope is actor-derived, not
// stored). Admins keep universal scope (parity with /admin/auditoria).
// "Mi actividad" survives as an actor-filter preset, not a separate mode.
//
// Filters (all via URL params so links/bookmarks are shareable):
//   action  — exact AuditLogAction code (dropdown of known labels)
//   actor   — exact user id, constrained to the jurisdiction scope by the
//             SQL AND (a stale/foreign id in the URL just yields zero rows —
//             never a scope bypass)
//   from/to — YYYY-MM-DD inclusive date range on performed_at
//   cursor  — keyset pagination (performed_at, id), same helper as /admin/*
//
// PII note: pii_queried rows carry a free-text `query` field (whatever the
// operator searched — may itself be a citizen's name/DNI). Now that the view
// spans multiple operators in the same jurisdiction, that free-text detail is
// shown ONLY for the viewer's own rows; peer rows show action + result count
// but not the raw query string (accountability without leaking what a
// colleague searched for).

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import Link from "next/link";

import { OpButton, OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { type AuditLogAction, approvalRequests, auditLog, db, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { fetchJurisdictionActorIds } from "@/lib/infra/govt-audit-scope";
import { AUDIT_ACTION_LABELS, auditActionLabel } from "@/lib/ui/audit-action-labels";
import { groupConsecutiveAuditRows } from "@/lib/ui/audit-row-grouping";
import { buildTargetLinkInfo, businessRuleTargetSummary } from "@/lib/ui/audit-target-link";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";

export const dynamic = "force-dynamic";

const GOB_HISTORIAL_PAGE_LIMIT = 100;

/** Accepts only YYYY-MM-DD; anything else (absent, malformed) → no bound. */
function parseDateParam(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function GobHistorialPage({
  searchParams,
}: {
  searchParams: Promise<{
    actor?: string;
    action?: string;
    from?: string;
    to?: string;
    cursor?: string;
  }>;
}) {
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const isAdmin = profile.role === "admin";

  const sp = await searchParams;
  const rawAction = sp.action?.trim() || null;
  const actionFilter: AuditLogAction | null =
    rawAction && rawAction in AUDIT_ACTION_LABELS ? (rawAction as AuditLogAction) : null;
  const actorFilter = sp.actor?.trim() || null;
  const fromDate = parseDateParam(sp.from);
  // `to` is inclusive of the whole day — bump to the start of the next day.
  const toDateRaw = parseDateParam(sp.to);
  const toDate = toDateRaw ? new Date(toDateRaw.getTime() + 86_400_000 - 1) : null;
  const rawCursor = sp.cursor;
  const cursor = decodeCursor(rawCursor);

  // Jurisdiction scope (govt only — admin keeps universal scope, same as
  // /admin/auditoria). `null` means "no actor restriction" (admin branch);
  // an array (possibly empty) means "restrict to these actor ids".
  const scopedActorIds = isAdmin ? null : await fetchJurisdictionActorIds(jurisdictions);

  const filterClauses = [];
  if (scopedActorIds !== null) {
    filterClauses.push(
      scopedActorIds.length > 0 ? inArray(auditLog.actorUserId, scopedActorIds) : sql`false`,
    );
  }
  if (actionFilter) filterClauses.push(eq(auditLog.action, actionFilter));
  if (actorFilter) filterClauses.push(eq(auditLog.actorUserId, actorFilter));
  if (fromDate) filterClauses.push(gte(auditLog.performedAt, fromDate));
  if (toDate) filterClauses.push(lte(auditLog.performedAt, toDate));
  const cursorClause = keysetWhere(auditLog.performedAt, auditLog.id, cursor);
  if (cursorClause) filterClauses.push(cursorClause);
  const whereClause = filterClauses.length > 0 ? and(...filterClauses) : undefined;

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
    .limit(GOB_HISTORIAL_PAGE_LIMIT + 1);

  const hasMore = rawEntries.length > GOB_HISTORIAL_PAGE_LIMIT;
  const entries = hasMore ? rawEntries.slice(0, GOB_HISTORIAL_PAGE_LIMIT) : rawEntries;

  // Pagination links — changing a filter resets cursor to page 1.
  const filterParams: Record<string, string | undefined> = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(actorFilter ? { actor: actorFilter } : {}),
    ...(sp.from ? { from: sp.from } : {}),
    ...(sp.to ? { to: sp.to } : {}),
  };
  const lastEntry = entries.at(-1);
  const olderLink =
    hasMore && lastEntry
      ? olderHref("/gob/historial", filterParams, { ts: lastEntry.performedAt, id: lastEntry.id })
      : null;
  const newerLink = rawCursor ? newerHref("/gob/historial", filterParams) : null;

  // Batch-resolve approval request tokens (P2 audit action labels).
  const reqIds = entries.map((e) => e.approvalRequestId).filter((id): id is string => id !== null);
  const tokenByReqId = new Map<string, string>();
  if (reqIds.length > 0) {
    const reqRows = await db
      .select({ id: approvalRequests.id, publicToken: approvalRequests.publicToken })
      .from(approvalRequests)
      .where(inArray(approvalRequests.id, reqIds));
    for (const r of reqRows) tokenByReqId.set(r.id, r.publicToken);
  }

  // Batch-resolve actor display names.
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

  // Batch-resolve target display names + link hrefs (C12 pattern).
  const targetIds = Array.from(
    new Set(entries.map((e) => e.targetUserId).filter((id): id is string => id !== null)),
  );
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

  // Actor dropdown options.
  // - govt: every actor in scope (bounded — govt users assigned to the same
  //   jurisdiction), not just the ones on the current page.
  // - admin: derived from the current page + selected extra (universal scope
  //   is unbounded — mirrors /admin/auditoria's approach).
  let actorOptions: { id: string; name: string }[];
  if (scopedActorIds !== null && scopedActorIds.length > 0) {
    const scopedProfiles = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, scopedActorIds));
    actorOptions = scopedProfiles.map((p) => ({ id: p.id, name: p.displayName }));
  } else {
    actorOptions = actorIds.map((id) => ({ id, name: namesById.get(id) ?? "Desconocido" }));
  }
  if (actorFilter && !actorOptions.find((o) => o.id === actorFilter)) {
    const [extra] = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, actorFilter))
      .limit(1);
    if (extra) actorOptions.push({ id: extra.id, name: extra.displayName });
  }
  actorOptions.sort((a, b) => a.name.localeCompare(b.name, "es-AR"));

  const actionOptions = Object.entries(AUDIT_ACTION_LABELS).sort((a, b) =>
    a[1].localeCompare(b[1], "es-AR"),
  );

  const hasFilters =
    actionFilter !== null || actorFilter !== null || fromDate !== null || toDate !== null;
  const isMineFilter = actorFilter === user.id;

  const groups = groupConsecutiveAuditRows(entries);

  const actorName = (uid: string | null) =>
    uid ? (namesById.get(uid) ?? "Desconocido") : "Usuario eliminado";

  const fmtTime = (d: Date) =>
    new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

  const runFilterHref = (action: string, uid: string | null) => {
    const params = new URLSearchParams({ action });
    if (uid) params.set("actor", uid);
    return `/gob/historial?${params.toString()}`;
  };

  const mineHref = `/gob/historial?actor=${user.id}`;

  const scopeCopy = isAdmin
    ? "Vista universal — todas las jurisdicciones."
    : "Acciones de los operadores de gobierno asignados a tu jurisdicción.";

  // Shared row body — reused for standalone rows and expanded run children.
  const EntryBody = ({ entry }: { entry: (typeof entries)[number] }) => {
    const isOwnRow = entry.actorUserId === user.id;
    return (
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
            {entry.approvalRequestId &&
              (() => {
                const token = tokenByReqId.get(entry.approvalRequestId);
                return token ? (
                  <>
                    {" "}
                    {"·"}{" "}
                    <Link
                      href={`/gob/cola/${token}`}
                      className="underline underline-offset-2 hover:text-ln-op-ink"
                    >
                      Ver solicitud →
                    </Link>
                  </>
                ) : (
                  <>
                    {" "}
                    {"·"} req:{" "}
                    <span className="font-ln-mono">{entry.approvalRequestId.slice(0, 8)}…</span>
                  </>
                );
              })()}
            {(() => {
              const target = businessRuleTargetSummary(entry.action, entry.payload);
              return target ? (
                <>
                  {" "}
                  {"·"} sobre: <span className="font-ln-mono">{target}</span>
                </>
              ) : null;
            })()}
            {/* PII guard: the free-text search query is only shown for the
                viewer's OWN pii_queried rows — never for peer operators'
                rows, even within the same jurisdiction (see file header). */}
            {entry.action === "pii_queried" &&
              entry.payload != null &&
              typeof entry.payload === "object" &&
              (() => {
                const p = entry.payload as Record<string, unknown>;
                const surface = typeof p.surface === "string" ? p.surface : null;
                const count = typeof p.result_count === "number" ? p.result_count : null;
                const query = isOwnRow && typeof p.query === "string" ? p.query : null;
                const parts: string[] = [];
                if (query) parts.push(`"${query}"`);
                if (surface) parts.push(surface);
                if (count !== null) parts.push(`${count} resultado${count !== 1 ? "s" : ""}`);
                return parts.length > 0 ? (
                  <>
                    {" "}
                    {"·"} {parts.join(" · ")}
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
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Historial</p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Historial de auditoría</h1>
        <p className="text-[13px] text-ln-op-mute">{scopeCopy}</p>
      </header>

      <form action="/gob/historial" method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="historial-action" className="text-[var(--text-sm)] font-medium text-ln-op-mute">
            Acción
          </label>
          <select
            id="historial-action"
            name="action"
            defaultValue={actionFilter ?? ""}
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

        <div className="flex flex-col gap-1">
          <label htmlFor="historial-actor" className="text-[var(--text-sm)] font-medium text-ln-op-mute">
            Actor
          </label>
          <select
            id="historial-actor"
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

        <div className="flex flex-col gap-1">
          <label htmlFor="historial-from" className="text-[var(--text-sm)] font-medium text-ln-op-mute">
            Desde
          </label>
          <input
            id="historial-from"
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="historial-to" className="text-[var(--text-sm)] font-medium text-ln-op-mute">
            Hasta
          </label>
          <input
            id="historial-to"
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[var(--text-md)] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          />
        </div>

        <OpButton type="submit" variant="primary" size="sm">
          Filtrar
        </OpButton>
        {!isMineFilter && (
          <a href={mineHref} className="text-sm text-ln-op-azul underline underline-offset-4">
            Ver solo mi actividad
          </a>
        )}
        {hasFilters && (
          <a href="/gob/historial" className="text-sm text-ln-op-mute underline underline-offset-4">
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
