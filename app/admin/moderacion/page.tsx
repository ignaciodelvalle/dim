import Link from "next/link";

import { OpButton, OpCallout, OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { db, welfareReports } from "@/db";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { type FlagReason, reasonLabel } from "@/lib/infra/welfare-moderation";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import {
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  welfareReportKindLabel,
  welfareReportSeverityLabel,
} from "@/src/modules/welfare/domain/types";
import type { WelfareReportKind, WelfareReportSeverity } from "@/src/modules/welfare/domain/types";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

type SeverityTone = "danger" | "open" | "neutral";

const SEVERITY_PILL: Record<string, SeverityTone> = {
  critical: "danger",
  high: "open",
  medium: "open",
  low: "neutral",
};

// Moderation queue status options.
const MOD_STATUS_OPTIONS = [
  { value: "pending", label: "Pendientes" },
  { value: "resolved", label: "Resueltas" },
  { value: "all", label: "Todas" },
] as const;

// Page size for keyset pagination. The queue was previously capped at a flat
// LIMIT 500 with no way to reach older rows — a real scale bug once a province
// accumulates >500 flagged denuncias. Keyset paging removes both the cap and
// the OFFSET re-scan cost.
const PAGE_SIZE = 50;

export default async function ModeracionListPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    kind?: string;
    severity?: string;
    cursor?: string;
  }>;
}) {
  await requireAdminOrRedirect();

  const sp = await searchParams;

  // Default to showing the actionable queue (pending = unresolved).
  const statusFilter = sp.status === "resolved" || sp.status === "all" ? sp.status : "pending";
  const kindFilter =
    sp.kind && (WELFARE_REPORT_KINDS as readonly string[]).includes(sp.kind)
      ? (sp.kind as WelfareReportKind)
      : null;
  const severityFilter =
    sp.severity && (WELFARE_REPORT_SEVERITIES as readonly string[]).includes(sp.severity)
      ? (sp.severity as WelfareReportSeverity)
      : null;

  const hasFilters = statusFilter !== "pending" || kindFilter !== null || severityFilter !== null;

  // Build WHERE clauses — all pushed into SQL, not JS-side filtering.
  const whereClauses = [isNotNull(welfareReports.flaggedAt)];
  if (statusFilter === "pending") {
    whereClauses.push(isNull(welfareReports.moderationResolvedAt));
  } else if (statusFilter === "resolved") {
    whereClauses.push(isNotNull(welfareReports.moderationResolvedAt));
  }
  // "all" = flagged rows regardless of resolution, no extra clause needed.
  if (kindFilter) whereClauses.push(eq(welfareReports.kind, kindFilter));
  if (severityFilter) whereClauses.push(eq(welfareReports.severity, severityFilter));

  const baseWhere = and(...whereClauses);

  // Keyset (seek) pagination — same contract as /gob/maltrato and the outbox
  // lists: DESC on (flaggedAt, id); the cursor encodes the last row of the
  // current page and "next" fetches strictly older rows via
  // (flaggedAt, id) < (cursorTs, cursorId). flaggedAt is guaranteed non-null
  // by the isNotNull clause above, so it is a safe keyset column.
  const cursorClause = keysetWhere(
    welfareReports.flaggedAt,
    welfareReports.id,
    decodeCursor(sp.cursor),
  );
  const rowsWhere = cursorClause ? and(baseWhere, cursorClause) : baseWhere;

  // limit+1 probe row detects hasMore without a second COUNT query.
  const rawRows = await db
    .select()
    .from(welfareReports)
    .where(rowsWhere)
    .orderBy(desc(welfareReports.flaggedAt), desc(welfareReports.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rawRows.length > PAGE_SIZE;
  const rows = hasMore ? rawRows.slice(0, PAGE_SIZE) : rawRows;

  // Filter params preserved across cursor links — never includes `cursor`
  // itself, which olderHref/newerHref set/strip.
  const filterParams: Record<string, string | undefined> = {
    ...(statusFilter !== "pending" ? { status: statusFilter } : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(severityFilter ? { severity: severityFilter } : {}),
  };
  const lastRow = rows.at(-1);
  const olderLink =
    hasMore && lastRow?.flaggedAt
      ? olderHref("/admin/moderacion", filterParams, { ts: lastRow.flaggedAt, id: lastRow.id })
      : null;
  const newerLink = sp.cursor ? newerHref("/admin/moderacion", filterParams) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {"Admin · Moderación"}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">{"Moderación de denuncias"}</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Denuncias anónimas que las heurísticas marcaron para revisión antes de entrar a la cola de
          triage. Solo admin las ve. Resolvé pasándolas a triage normal o cerrándolas como spam.
        </p>
      </header>

      {/* Filter form */}
      <form action="/admin/moderacion" method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="mod-status" className="text-[11px] font-medium text-ln-op-mute">
            Estado
          </label>
          <select
            id="mod-status"
            name="status"
            defaultValue={statusFilter}
            className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            {MOD_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mod-kind" className="text-[11px] font-medium text-ln-op-mute">
            Tipo de denuncia
          </label>
          <select
            id="mod-kind"
            name="kind"
            defaultValue={kindFilter ?? ""}
            className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">Todos los tipos</option>
            {WELFARE_REPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {welfareReportKindLabel(k)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mod-severity" className="text-[11px] font-medium text-ln-op-mute">
            Severidad
          </label>
          <select
            id="mod-severity"
            name="severity"
            defaultValue={severityFilter ?? ""}
            className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">Todas las severidades</option>
            {WELFARE_REPORT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {welfareReportSeverityLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <OpButton type="submit" variant="primary" size="sm">
          Filtrar
        </OpButton>
        {hasFilters && (
          <a
            href="/admin/moderacion"
            className="text-sm text-ln-op-mute underline underline-offset-4"
          >
            Limpiar filtros
          </a>
        )}
      </form>

      {rows.length === 0 ? (
        <OpCallout
          title={statusFilter === "pending" ? "Cola vacía" : "Sin resultados"}
          body={
            statusFilter === "pending"
              ? "No hay denuncias pendientes de moderación."
              : "No hay denuncias que coincidan con los filtros aplicados."
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const reasons = (r.flagReasons as string[]) ?? [];
            const severityTone: SeverityTone = SEVERITY_PILL[r.severity] ?? "neutral";
            return (
              <li key={r.id}>
                <OpCard accent="warn">
                  <Link
                    href={`/admin/moderacion/${r.id}`}
                    className="block no-underline transition-colors hover:bg-ln-op-stripe"
                  >
                    <OpCardBody>
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[13px] font-semibold text-ln-op-ink">
                              {welfareReportKindLabel(r.kind)}
                            </p>
                            <OpPill tone={severityTone}>
                              {welfareReportSeverityLabel(r.severity)}
                            </OpPill>
                          </div>
                          <ul className="space-y-0.5">
                            {reasons.map((reason) => (
                              <li key={reason} className="text-sm text-ln-op-warn">
                                {"• "}
                                {reasonLabel(reason as FlagReason)}
                              </li>
                            ))}
                          </ul>
                          <p className="font-mono text-xs text-ln-op-faint">
                            {r.referenceCode}
                            {" · "}
                            {r.flaggedAt &&
                              new Date(r.flaggedAt).toLocaleString("es-AR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            {r.moderationResolvedAt && (
                              <span className="ml-2 text-ln-op-verde">
                                ✓ resuelta{" "}
                                {new Date(r.moderationResolvedAt).toLocaleString("es-AR", {
                                  dateStyle: "short",
                                })}
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-ln-op-azul">{"→"}</span>
                      </div>
                    </OpCardBody>
                  </Link>
                </OpCard>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination footer — keyset (seek) links preserve active filters. */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de moderación"
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
                Ver más antiguas →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
