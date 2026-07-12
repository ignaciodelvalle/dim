import { Suspense } from "react";

import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { UrlTabs, UrlTabsContent } from "@/components/ui/UrlTabs";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { db, welfareReports } from "@/db";
import {
  type MaltratoQueue,
  buildMaltratoListConditions,
  fetchWelfareMetrics,
} from "@/lib/analytics/govt-dashboards";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import {
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  WELFARE_REPORT_STATUSES,
  type WelfareReportKind,
  type WelfareReportSeverity,
} from "@/src/modules/welfare/domain/types";
import { and, count, desc } from "drizzle-orm";

import { WelfareDenunciaRow } from "./_components/WelfareDenunciaRow";
import { InspectorMounter } from "./_inspector/InspectorMounter";

const PAGE_SIZE = 50;
const VALID_QUEUES: MaltratoQueue[] = ["urgent", "unassigned", "mine", "all", "overdue"];

function parseQueue(raw: string | undefined): MaltratoQueue {
  if (!raw) return "all";
  return (VALID_QUEUES as string[]).includes(raw) ? (raw as MaltratoQueue) : "all";
}

function parseKind(raw: string | undefined): WelfareReportKind | null {
  if (!raw) return null;
  return (WELFARE_REPORT_KINDS as readonly string[]).includes(raw)
    ? (raw as WelfareReportKind)
    : null;
}

function parseSeverity(raw: string | undefined): WelfareReportSeverity | null {
  if (!raw) return null;
  return (WELFARE_REPORT_SEVERITIES as readonly string[]).includes(raw)
    ? (raw as WelfareReportSeverity)
    : null;
}

function parseStatus(raw: string | undefined): string | null {
  if (!raw) return null;
  return (WELFARE_REPORT_STATUSES as readonly string[]).includes(raw) ? raw : null;
}

export default async function GobMaltratoPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    queue?: string;
    kind?: string;
    severity?: string;
    province?: string;
    locality?: string;
    cursor?: string;
    status?: string;
  }>;
}) {
  const { profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };
  const sp = await searchParams;

  const activeQueue = parseQueue(sp.queue);
  const activeKind = parseKind(sp.kind);
  const activeSeverity = parseSeverity(sp.severity);
  const activeStatus = parseStatus(sp.status);

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // THE FENCE + switcher inputs, resolved once. filteredJurisdictions carries the
  // govt scope (assignments ∩ URL selection); adminSelectedProvince/Locality are
  // the admin-only SQL-drill names (null for govt — govt scope is already enforced
  // by filteredJurisdictions, so passing them for govt would be a widening vector).
  const {
    filteredJurisdictions,
    localities,
    allowedProvinces,
    adminSelectedProvince,
    adminSelectedLocality,
  } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: sp.province, locality: sp.locality },
  });

  const whereCondition = buildMaltratoListConditions({
    actor,
    filteredJurisdictions,
    queue: activeQueue,
    kind: activeKind,
    severity: activeSeverity,
    status: activeStatus,
    selectedProvince: adminSelectedProvince,
    selectedLocality: adminSelectedLocality,
    currentUserId: user.id,
  });

  // Build a ctx for the freshness footer (jurisdiction-scoped, trailing 30d window).
  const freshnessCtx = buildProjectionContext(actor, filteredJurisdictions, windows.trailing30d());

  // Keyset (seek) pagination — perf/scale review 2026-07-04 P1 "Operator lists
  // without real pagination": OFFSET-based paging (`.limit(PAGE_SIZE).offset(offset)`)
  // costs O(offset) per page — a province-scale denuncia queue with a growing
  // page number re-scans and discards everything before it on every request.
  // Reuses the shared ts+id cursor pattern (lib/utils/keyset-pagination.ts,
  // same contract as /gob/casos, /admin/auditoria, /gob/cola): DESC order on
  // (createdAt, id), cursor encodes the last row of the current page, "next"
  // fetches strictly older rows via (createdAt, id) < (cursorTs, cursorId).
  const cursorClause = keysetWhere(
    welfareReports.createdAt,
    welfareReports.id,
    decodeCursor(sp.cursor),
  );
  const rowsWhereCondition = cursorClause ? and(whereCondition, cursorClause) : whereCondition;

  // Fetch metrics and paginated report list in parallel.
  const [metrics, rawRows, [totalRow]] = await Promise.all([
    fetchWelfareMetrics(actor, filteredJurisdictions, user.id),
    db
      .select()
      .from(welfareReports)
      .where(rowsWhereCondition)
      // Deterministic ORDER BY matches the keyset column pair above.
      .orderBy(desc(welfareReports.createdAt), desc(welfareReports.id))
      // limit+1 probe row detects hasMore without a second query.
      .limit(PAGE_SIZE + 1),
    // Total count still reflects ALL filtered rows (not just this page) —
    // unrelated to the OFFSET cost this migration removes, kept for the
    // "(N denuncias)" header.
    db
      .select({ n: count() })
      .from(welfareReports)
      .where(whereCondition),
  ]);

  const totalCount = totalRow?.n ?? 0;
  const hasMore = rawRows.length > PAGE_SIZE;
  const rows = hasMore ? rawRows.slice(0, PAGE_SIZE) : rawRows;

  // Filter params preserved across cursor links — never includes `cursor`
  // itself, which olderHref/newerHref set/strip.
  const filterParams: Record<string, string | undefined> = {
    queue: sp.queue,
    kind: sp.kind,
    severity: sp.severity,
    status: sp.status,
    province: sp.province,
    locality: sp.locality,
  };
  const lastRow = rows.at(-1);
  const olderLink =
    hasMore && lastRow
      ? olderHref("/gob/maltrato", filterParams, { ts: lastRow.createdAt, id: lastRow.id })
      : null;
  const newerLink = sp.cursor ? newerHref("/gob/maltrato", filterParams) : null;

  const TABS = [
    { value: "urgent" as const, label: "Urgentes" },
    { value: "unassigned" as const, label: "Sin asignar" },
    { value: "mine" as const, label: "Mías" },
    { value: "all" as const, label: "Todas" },
    { value: "overdue" as const, label: "Atrasadas" },
  ];

  return (
    <div className="flex flex-col gap-6 lg:h-full lg:min-h-0">
      {/* Top section — pinned above the master/detail split (full width) */}
      <div className="space-y-6 lg:flex-shrink-0">
        {/* Page header */}
        <header className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight text-ln-op-ink">
            Denuncias de maltrato
          </h1>
          <p className="text-sm text-ln-op-mute">
            Cola de triage bajo Ley Nacional 14.346.{" "}
            {profile.role === "admin"
              ? "Vista universal — todas las jurisdicciones."
              : "Filtradas por tu jurisdicción."}
          </p>
        </header>

        {/* No-scope warning */}
        {noScope && (
          <div className="rounded-[var(--radius-md)] border border-ln-op-warn-bd border-l-[4px] border-l-ln-op-warn bg-ln-op-warn-bg px-4 py-3 text-sm text-ln-op-warn">
            Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
            una.
          </div>
        )}

        {/* Filters row */}
        <div className="grid md:grid-cols-2 gap-3">
          <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
          <PeriodPicker defaultPreset="30d" />
        </div>

        {/* 4 metric KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <OpKpi
            label="Sin asignar"
            value={String(metrics.unassignedCount)}
            tone={metrics.unassignedCount > 0 ? "warn" : "neutral"}
            href="/gob/maltrato?queue=unassigned"
            info={{
              definition:
                "Denuncias de maltrato sin ningún operador asignado (assignedToId IS NULL). Requieren triage inmediato.",
              formula: "COUNT(welfare_reports WHERE assigned_to_id IS NULL AND status != 'closed')",
            }}
          />
          <OpKpi
            label="Mías"
            value={String(metrics.myCount)}
            tone="blue"
            href="/gob/maltrato?queue=mine"
            info={{
              definition: "Denuncias de maltrato asignadas al usuario actual que están en curso.",
              formula:
                "COUNT(welfare_reports WHERE assigned_to_id = current_user AND status = 'in_progress')",
            }}
          />
          <OpKpi
            label="En investigación"
            value={String(metrics.inProgressCount)}
            tone="neutral"
            info={{
              definition:
                "Total de denuncias con estado 'in_progress' en la jurisdicción del operador (asignadas a alguien).",
              formula: "COUNT(welfare_reports WHERE status = 'in_progress') scoped",
            }}
          />
          <OpKpi
            label="Cerradas (30d)"
            value={String(metrics.closedMonth)}
            tone="ok"
            info={{
              definition:
                "Denuncias cerradas (status='closed') en los últimos 30 días en la jurisdicción.",
              formula:
                "COUNT(welfare_reports WHERE status='closed' AND closed_at >= 30d ago) scoped",
            }}
          />
        </div>
      </div>

      {/* Master / detail split — list (~40%) + inspector (~60%). On lg each
          column owns its scroll; below lg they stack and the inspector flips to
          an overlay drawer (InspectorMounter container classes). */}
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* Master — queue tabs + list (own scroll on lg) */}
        <div className="flex min-w-0 flex-col lg:w-2/5 lg:min-h-0 lg:overflow-y-auto">
          <Suspense>
            <UrlTabs paramKey="queue" defaultValue="all" tabs={TABS} aria-label="Cola de denuncias">
              {TABS.map((tab) => (
                <UrlTabsContent key={tab.value} value={tab.value}>
                  <OpCard className="mt-4">
                    <OpCardHead title={`Denuncias (${totalCount})`} />
                    <OpCardBody>
                      {rows.length === 0 ? (
                        <p className="text-sm text-ln-op-mute py-4 text-center">
                          No hay denuncias que coincidan con los filtros seleccionados.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {rows.map((r) => (
                            <WelfareDenunciaRow key={r.id} report={r} />
                          ))}
                        </ul>
                      )}
                      {(newerLink || olderLink) && (
                        <nav
                          aria-label="Paginación de denuncias"
                          className="mt-4 flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-ln-op-mute">{totalCount} denuncias en total</span>
                          <div className="flex gap-2">
                            {newerLink && (
                              <a
                                href={newerLink}
                                className="rounded border border-ln-op-line px-3 py-1 text-ln-op-ink hover:bg-ln-op-stripe"
                              >
                                ← Volver al inicio
                              </a>
                            )}
                            {olderLink && (
                              <a
                                href={olderLink}
                                className="rounded border border-ln-op-line px-3 py-1 text-ln-op-ink hover:bg-ln-op-stripe"
                              >
                                Ver más antiguas →
                              </a>
                            )}
                          </div>
                        </nav>
                      )}
                    </OpCardBody>
                  </OpCard>
                </UrlTabsContent>
              ))}
            </UrlTabs>
          </Suspense>

          <div className="mt-4">
            <DashboardFreshnessFooter ctx={freshnessCtx} />
          </div>
        </div>

        {/* Detail — the inspector reacts to ?caso= / &mascota= (shallow history) */}
        <div className="lg:w-3/5 lg:min-h-0 lg:overflow-y-auto">
          <Suspense>
            <InspectorMounter />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
