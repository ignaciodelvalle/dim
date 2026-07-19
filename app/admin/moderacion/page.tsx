import { Suspense } from "react";

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { type UrlTabItem, UrlTabs, UrlTabsContent } from "@/components/ui/UrlTabs";
import {
  OpCallout,
  OpCard,
  OpCardBody,
  type OpFilterAxis,
  OpFilterBar,
  OpPill,
} from "@/components/ui/dashboard";
import { db, welfareReports } from "@/db";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { type FlagReason, reasonLabel } from "@/lib/infra/welfare-moderation";
import { formatDate, formatDateTime } from "@/lib/utils/format";
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

// Filter controls (consistency pass, 2026-07-19): same UrlTabs(status) +
// OpFilterBar(kind/severity) split as /gob/moderacion — see that page's
// header comment for the "workflow lens vs axis" reasoning.
//
// NOT unified to call the shared buildModerationQueueConditions (govt-
// dashboards.ts) here, on purpose: that builder's "pending" branch excludes
// moderationEscalatedAt IS NOT NULL rows ("not handed off to admin" — correct
// for the GOVT actionable queue, which is what it was written for). This page
// is the RECEIVING end of that hand-off — escalate-moderation-to-admin.ts's
// own doc comment states the report "remains in the admin queue" once
// escalated (only moderationResolvedAt gates it here). Calling the shared
// builder as-is would hide every escalated-but-unresolved report from the
// one queue meant to catch them — a real regression, not a refactor. Flagged
// for the PO as a follow-up: either add an explicit
// includeEscalated/forAdminQueue param to the shared builder, or accept the
// two queues have genuinely different "pending" semantics and leave this
// hand-rolled predicate as the documented admin-side contract.
const STATUS_TABS: UrlTabItem[] = [
  { value: "pending", label: "Pendientes" },
  { value: "resolved", label: "Resueltas" },
  { value: "all", label: "Todas" },
];

const KIND_OPTIONS = WELFARE_REPORT_KINDS.map((k) => ({
  value: k,
  label: welfareReportKindLabel(k),
}));
const SEVERITY_OPTIONS = WELFARE_REPORT_SEVERITIES.map((s) => ({
  value: s,
  label: welfareReportSeverityLabel(s),
}));

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
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          {"Moderación de denuncias"}
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Denuncias anónimas que las heurísticas marcaron para revisión antes de entrar a la cola de
          triage. Solo admin las ve. Resolvé pasándolas a triage normal o cerrándolas como spam.
        </p>
      </header>

      {/* Domain filters — kind + severity (genuine "no filter" defaults). */}
      <OpFilterBar
        showPeriod={false}
        resetParamsOnChange={["cursor"]}
        axes={
          [
            {
              id: "kind",
              label: "Tipo de denuncia",
              paramKey: "kind",
              options: KIND_OPTIONS,
              current: kindFilter,
              allLabel: "Todos los tipos",
            },
            {
              id: "severity",
              label: "Severidad",
              paramKey: "severity",
              options: SEVERITY_OPTIONS,
              current: severityFilter,
              allLabel: "Todas las severidades",
            },
          ] satisfies OpFilterAxis[]
        }
      />

      {/* Status — a workflow lens with a real ("pending") default, so it stays
          a tab control (same idiom as /gob/moderacion) rather than an axis. */}
      <Suspense>
        <UrlTabs
          paramKey="status"
          defaultValue="pending"
          tabs={STATUS_TABS}
          aria-label="Filtrar por estado de moderación"
        >
          <UrlTabsContent value={statusFilter}>
            <div className="mt-4 space-y-6">
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
                                    {r.flaggedAt && formatDateTime(r.flaggedAt)}
                                    {r.moderationResolvedAt && (
                                      <span className="ml-2 inline-flex items-center gap-1 text-ln-op-ok">
                                        <Icon name="check" size={13} decorative /> resuelta{" "}
                                        {formatDate(r.moderationResolvedAt)}
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
          </UrlTabsContent>
        </UrlTabs>
      </Suspense>
    </div>
  );
}
