// MaltratoQueueScreen — jurisdiction-scoped welfare (maltrato) triage queue,
// Ley 14.346.
//
// F1 fusion (2026-07-22): this is the byte-identical body of the former
// /gob/maltrato page.tsx, relocated so the Denuncias hub (app/gob/denuncias/
// page.tsx) can render it as its "Triage (Ley 14.346)" stage under
// ?etapa=triage. /gob/maltrato itself now only redirects here via the hub
// (see app/gob/maltrato/page.tsx) — this is a RELOCATION, not a redesign:
// same searchParams contract (queue/?panel=/?caso=/&mascota= all still work,
// read client-side via useSearchParams by InspectorMounter regardless of the
// parent route), same auth guard, same query logic, same C6c workqueue
// grammar (TomarButton/ActuarButton, tomar/actuar/cerrar).

import { Suspense } from "react";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { UrlTabs, UrlTabsContent } from "@/components/ui/UrlTabs";
import {
  OpCard,
  OpCardBody,
  OpCardHead,
  type OpFilterAxis,
  OpFilterBar,
  OpKpi,
  ViewScopeCaption,
} from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { db, profiles, welfareReports } from "@/db";
import {
  type MaltratoQueue,
  buildMaltratoListConditions,
  fetchWelfareMetrics,
} from "@/lib/analytics/govt-dashboards";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { describeNarrowedView } from "@/lib/ui/view-scope-caption";
import { newerHref } from "@/lib/utils/keyset-pagination";
import {
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  WELFARE_REPORT_STATUSES,
  type WelfareReportKind,
  type WelfareReportSeverity,
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
} from "@/src/modules/welfare/domain/types";
import { and, asc, count, inArray, sql } from "drizzle-orm";

import { formatCount } from "@/lib/utils/format";
import { WelfareDenunciaRow } from "./_components/WelfareDenunciaRow";
import { InspectorMounter } from "./_inspector/InspectorMounter";
import { decodeRiskCursor, encodeRiskCursor, severityRank } from "./_lib/welfare-sla";

const PAGE_SIZE = 50;
const VALID_QUEUES: MaltratoQueue[] = [
  "urgent",
  "unassigned",
  "mine",
  "all",
  "overdue",
  // D.11 audit lens — denuncias whose jurisdiction was recovered from the form
  // text after a geocoder failure. They stay in every other tab too; this only
  // isolates them.
  "unverified",
];

// Default queue (C2 language contract, 2026-07-22 — PO-locked: "sin asignar
// abiertas", not "Todas"). "Todas" as a landing view buries the actionable
// triage work under every terminal/closed/historical row ever filed — the
// exact "default 'Todas' in maltrato" symptom named by S6 in the plan-maestro
// audit. `unassigned` already means "no operator assigned AND not terminal"
// (buildMaltratoListConditions), i.e. exactly "sin asignar abiertas".
const DEFAULT_QUEUE: MaltratoQueue = "unassigned";

function parseQueue(raw: string | undefined): MaltratoQueue {
  if (!raw) return DEFAULT_QUEUE;
  return (VALID_QUEUES as string[]).includes(raw) ? (raw as MaltratoQueue) : DEFAULT_QUEUE;
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

// Domain-axis options for the filter bar. buildMaltratoListConditions already
// applies kind/severity/status; these surface the previously-invisible controls.
// Labels come from the SAME domain registry the rows/KPIs use (one vocabulary).
const KIND_OPTIONS = WELFARE_REPORT_KINDS.map((k) => ({
  value: k,
  label: welfareReportKindLabel(k),
}));
const SEVERITY_OPTIONS = WELFARE_REPORT_SEVERITIES.map((s) => ({
  value: s,
  label: welfareReportSeverityLabel(s),
}));
const STATUS_OPTIONS = WELFARE_REPORT_STATUSES.map((s) => ({
  value: s,
  label: welfareReportStatusLabel(s),
}));

export type MaltratoQueueScreenProps = {
  searchParams: {
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
  };
  /**
   * True when rendered as the Denuncias hub's "Triage" stage
   * (app/gob/denuncias/page.tsx) — see components/ui/dashboard/ScreenHeader.tsx.
   */
  underHub?: boolean;
};

export async function MaltratoQueueScreen({
  searchParams: sp,
  underHub = false,
}: MaltratoQueueScreenProps) {
  const { profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

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

  // C3 disclosure: caption when this page's filters narrow below the mandate.
  const narrowedView = describeNarrowedView({
    role: profile.role,
    mandateJurisdictions: jurisdictions,
    effectiveJurisdictions: filteredJurisdictions,
    adminProvince: adminSelectedProvince ?? undefined,
    adminLocality: adminSelectedLocality ?? undefined,
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

  // Default order = RISK + SLA, not date (UI/UX audit 2026-07): severity DESC
  // first (critical → low), then AGE DESC within a tier (oldest first — age is
  // the SLA pressure), id ASC as the deterministic tiebreak. The rank values
  // and the SLA tiers live in ./_lib/welfare-sla.ts so the ORDER BY, the row
  // badge and the cursor can never disagree.
  const severityRankSql = sql<number>`(CASE ${welfareReports.severity}
    WHEN 'critical' THEN 3
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 1
    WHEN 'low' THEN 0
    ELSE -1 END)`;

  // Keyset (seek) pagination — perf/scale review 2026-07-04 P1 posture kept
  // (no OFFSET), but on the risk ordering's 3-part key: (rank DESC,
  // createdAt ASC, id ASC). The shared (ts,id) cursor of
  // lib/utils/keyset-pagination.ts encodes a plain createdAt-DESC contract, so
  // this page carries its own rank|ts|id cursor (./_lib/welfare-sla.ts); a
  // legacy 2-part cursor decodes to null → page 1.
  const riskCursor = decodeRiskCursor(sp.cursor);
  const cursorClause = riskCursor
    ? sql`(${severityRankSql} < ${riskCursor.rank}
        OR (${severityRankSql} = ${riskCursor.rank}
          AND (${welfareReports.createdAt} > ${riskCursor.ts}::timestamptz
            OR (${welfareReports.createdAt} = ${riskCursor.ts}::timestamptz
              AND ${welfareReports.id} > ${riskCursor.id}::uuid))))`
    : undefined;
  const rowsWhereCondition = cursorClause ? and(whereCondition, cursorClause) : whereCondition;

  // Fetch metrics and paginated report list in parallel. The KPI tiles mirror
  // the SAME domain filters (kind/severity/status + scope) the list applies
  // via buildMaltratoListConditions — never the `queue` workflow lens — so a
  // filtered list and its "totals" tiles always agree (filter-honesty fix
  // 2026-07).
  const [metrics, rawRows, [totalRow]] = await Promise.all([
    fetchWelfareMetrics(actor, filteredJurisdictions, user.id, {
      kind: activeKind,
      severity: activeSeverity,
      status: activeStatus,
      selectedProvince: adminSelectedProvince,
      selectedLocality: adminSelectedLocality,
    }),
    db
      .select()
      .from(welfareReports)
      .where(rowsWhereCondition)
      // Deterministic ORDER BY matches the 3-part risk keyset above.
      .orderBy(sql`${severityRankSql} DESC`, asc(welfareReports.createdAt), asc(welfareReports.id))
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

  // C6c workqueue grammar — batch-resolve assignee display names for THIS
  // page's rows only (never per-row queries). Mirrors the detail page's
  // actorNames pattern (app/gob/maltrato/[id]/page.tsx) at list scale: one
  // extra query, bounded by PAGE_SIZE distinct assignees.
  const assigneeIds = [
    ...new Set(rows.map((r) => r.assignedToUserId).filter((id): id is string => id !== null)),
  ];
  const assigneeNames = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const assigneeRows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, assigneeIds));
    for (const a of assigneeRows) assigneeNames.set(a.id, a.displayName);
  }

  // Filter params preserved across cursor links — never includes `cursor`
  // itself, which olderHref/newerHref set/strip. Points at the HUB route
  // (etapa=triage), not the old standalone /gob/maltrato path — this screen
  // is rendered under /gob/denuncias now; hardcoding the old path would just
  // cost every click a needless redirect bounce.
  const filterParams: Record<string, string | undefined> = {
    etapa: "triage",
    queue: sp.queue,
    kind: sp.kind,
    severity: sp.severity,
    status: sp.status,
    province: sp.province,
    locality: sp.locality,
  };
  const lastRow = rows.at(-1);
  let olderLink: string | null = null;
  if (hasMore && lastRow) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filterParams)) {
      if (v !== undefined) params.set(k, v);
    }
    params.set(
      "cursor",
      encodeRiskCursor(severityRank(lastRow.severity), lastRow.createdAt, lastRow.id),
    );
    olderLink = `/gob/denuncias?${params.toString()}`;
  }
  const newerLink = sp.cursor ? newerHref("/gob/denuncias", filterParams) : null;

  const TABS = [
    { value: "urgent" as const, label: "Urgentes" },
    { value: "unassigned" as const, label: "Sin asignar" },
    { value: "mine" as const, label: "Mías" },
    { value: "all" as const, label: "Todas" },
    { value: "overdue" as const, label: "Atrasadas" },
    // D.11 — the guesses, isolated. Last on purpose: it is an audit lens, not a
    // daily stage, and every row it holds is already visible (and pill-marked)
    // in the tabs to its left.
    { value: "unverified" as const, label: "Sin verificar" },
  ];

  return (
    <div className="flex flex-col gap-6 lg:h-full lg:min-h-0">
      {/* Top section — pinned above the master/detail split (full width) */}
      <div className="space-y-6 lg:flex-shrink-0">
        {/* Page header */}
        <ScreenHeader
          underHub={underHub}
          title="Denuncias de maltrato"
          subtitle={
            <>
              <p className="text-md text-ln-op-mute">
                Cola de triage bajo Ley Nacional 14.346.{" "}
                {/* The universal claim yields to the narrowed-view caption (never both). */}
                {profile.role === "admin"
                  ? narrowedView
                    ? null
                    : "Vista universal — todas las jurisdicciones."
                  : "Filtradas por tu jurisdicción."}
              </p>
              <ViewScopeCaption scope={narrowedView} />
            </>
          }
        />

        {/* No-scope warning */}
        {noScope && (
          <div className="rounded-[var(--radius-md)] border border-ln-op-warn-bd border-l-[4px] border-l-ln-op-warn bg-ln-op-warn-bg px-4 py-3 text-sm text-ln-op-warn">
            Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
            una.
          </div>
        )}

        {/* Unified filter bar — jurisdiction + kind/severity/status axes +
            active-filter chips. Period is OMITTED: /gob/maltrato is a
            period-agnostic live triage queue (PO decision 2026-07) — the
            period param drove nothing downstream, so the control is dropped
            rather than left as a dead affordance. The kind/severity/status
            axes were always wired (buildMaltratoListConditions applies them)
            but had no visible control. A filter change drops the keyset
            `cursor` (page 1). The queue TABS are a separate concept (workflow
            lens) and keep their own control below. */}
        <OpFilterBar
          showPeriod={false}
          jurisdiction={{ allowedProvinces, localities }}
          resetParamsOnChange={["cursor"]}
          savedViewsKey="op-saved-views:maltrato:v1"
          axes={
            [
              {
                id: "kind",
                label: "Tipo",
                paramKey: "kind",
                options: KIND_OPTIONS,
                current: activeKind,
                allLabel: "Todos",
              },
              {
                id: "severity",
                label: "Severidad",
                paramKey: "severity",
                options: SEVERITY_OPTIONS,
                current: activeSeverity,
                allLabel: "Todas",
              },
              {
                id: "status",
                label: "Estado",
                paramKey: "status",
                options: STATUS_OPTIONS,
                current: activeStatus,
                allLabel: "Todos",
              },
            ] satisfies OpFilterAxis[]
          }
        />

        {/* 4 metric KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <OpKpi
            label="Sin asignar"
            value={formatCount(metrics.unassignedCount)}
            tone={metrics.unassignedCount > 0 ? "warn" : "neutral"}
            href="/gob/denuncias?etapa=triage&queue=unassigned"
            info={{
              definition:
                "Denuncias de maltrato sin ningún operador asignado (assignedToId IS NULL). Requieren triage inmediato.",
              formula: "COUNT(welfare_reports WHERE assigned_to_id IS NULL AND status != 'closed')",
            }}
            descriptorId="maltrato_unassigned_count"
          />
          <OpKpi
            label="Mías"
            value={formatCount(metrics.myCount)}
            tone="blue"
            href="/gob/denuncias?etapa=triage&queue=mine"
            info={{
              definition: "Denuncias de maltrato asignadas al usuario actual que están en curso.",
              formula:
                "COUNT(welfare_reports WHERE assigned_to_id = current_user AND status = 'in_progress')",
            }}
            descriptorId="maltrato_assigned_to_me_count"
          />
          <OpKpi
            // ONE status vocabulary (UI/UX audit 2026-07): the tile label comes
            // from the SAME domain label registry the rows render with
            // (welfareReportStatusLabel), so the stat can never say
            // "En investigación" while the row pill says "En curso" for the
            // same status='in_progress'. Never an inline synonym here.
            label={welfareReportStatusLabel("in_progress")}
            value={formatCount(metrics.inProgressCount)}
            tone="neutral"
            info={{
              definition:
                "Total de denuncias con estado 'in_progress' en la jurisdicción del operador (asignadas a alguien).",
              formula: "COUNT(welfare_reports WHERE status = 'in_progress') scoped",
            }}
            descriptorId="maltrato_in_progress_count"
          />
          <OpKpi
            label="Cerradas (30d)"
            value={formatCount(metrics.closedMonth)}
            tone="ok"
            info={{
              definition:
                "Denuncias cerradas (status='closed') en los últimos 30 días en la jurisdicción.",
              formula:
                "COUNT(welfare_reports WHERE status='closed' AND closed_at >= 30d ago) scoped",
            }}
            descriptorId="maltrato_closed_30d_count"
          />
        </div>
      </div>

      {/* Master / detail split — list (~40%) + inspector (~60%). On lg each
          column owns its scroll; below lg they stack and the inspector flips to
          an overlay drawer (InspectorMounter container classes). */}
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* Master — queue tabs + list (own scroll on lg) */}
        <div className="flex min-w-0 flex-col lg:w-2/5 lg:min-h-0 lg:overflow-y-auto">
          {/* Queue ≠ status: the tabs are a workflow lens (urgentes / sin asignar /
              mías…), NOT the "Estado" filter (that lives in the bar above). */}
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ln-op-mute">
            Cola de trabajo
          </p>
          <Suspense>
            <UrlTabs
              paramKey="queue"
              defaultValue={DEFAULT_QUEUE}
              tabs={TABS}
              aria-label="Cola de denuncias"
            >
              {TABS.map((tab) => (
                <UrlTabsContent key={tab.value} value={tab.value}>
                  <OpCard className="mt-4">
                    {/* "(N en total)" — not a bare "(N)" (UI/UX audit 2026-07,
                        number coherence): under "Todas" this count includes
                        TERMINAL rows (cerrada/duplicada/sin sustento), so a bare
                        number read as if it were the dashboard's "denuncias
                        activas" figure (which counts non-terminal only) and the
                        two "disagreed". The count must keep matching the list it
                        heads (which legitimately shows closed rows), so we label
                        it with the SAME "en total" vocabulary the pagination
                        footer inside this card already uses, instead of
                        narrowing it to active-only and desyncing it from the
                        rows below. */}
                    <OpCardHead title={`Denuncias (${totalCount} en total)`} />
                    <OpCardBody>
                      {rows.length === 0 ? (
                        <LnEmptyState
                          icon="denuncia"
                          title="Sin denuncias"
                          description="No hay denuncias que coincidan con los filtros seleccionados."
                        />
                      ) : (
                        <ul className="space-y-2">
                          {rows.map((r) => (
                            <WelfareDenunciaRow
                              key={r.id}
                              report={r}
                              assignedToName={
                                r.assignedToUserId
                                  ? (assigneeNames.get(r.assignedToUserId) ?? null)
                                  : null
                              }
                              currentUserId={user.id}
                            />
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
                                Ver más →
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
