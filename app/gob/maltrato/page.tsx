import { Suspense } from "react";

import {
  EmptyState,
  JurisdictionSwitcher,
  MetricCard,
  Panel,
  PanelBody,
  PanelHeader,
  PeriodPicker,
  Tabs,
  TabsContent,
} from "@/components/poncho";
import { db, welfareReports } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { PROVINCE_ISO_MAP, fetchWelfareMetrics } from "@/lib/govt-dashboards";
import {
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  WELFARE_REPORT_STATUSES,
  type WelfareReportKind,
  type WelfareReportSeverity,
  type WelfareReportStatus,
} from "@/lib/welfare";
import { and, desc, isNotNull, isNull, or } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { WelfareDenunciaRow } from "./_components/WelfareDenunciaRow";

// All Argentine provinces list for <JurisdictionSwitcher>.
const ALL_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AR-C", name: "Ciudad Autónoma de Buenos Aires" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Córdoba" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-T", name: "Tucumán" },
  { code: "AR-E", name: "Entre Ríos" },
  { code: "AR-A", name: "Salta" },
  { code: "AR-N", name: "Misiones" },
  { code: "AR-H", name: "Chaco" },
  { code: "AR-W", name: "Corrientes" },
];

type WelfareQueue = "urgent" | "mine" | "all" | "overdue";
const VALID_QUEUES: WelfareQueue[] = ["urgent", "mine", "all", "overdue"];

function parseQueue(raw: string | undefined): WelfareQueue {
  if (!raw) return "all";
  return (VALID_QUEUES as string[]).includes(raw) ? (raw as WelfareQueue) : "all";
}

function parseStatus(raw: string | undefined): WelfareReportStatus | null {
  if (!raw) return null;
  return (WELFARE_REPORT_STATUSES as readonly string[]).includes(raw)
    ? (raw as WelfareReportStatus)
    : null;
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

// Queue filter applied in JS post-fetch (v1 simplicity — bounded result set).
// TODO(E4-followup): move queue filtering to the SQL query for scale.
function filterByQueue(
  reports: Array<typeof welfareReports.$inferSelect>,
  queue: WelfareQueue,
  currentUserId: string,
): Array<typeof welfareReports.$inferSelect> {
  switch (queue) {
    case "urgent":
      return reports.filter(
        (r) =>
          (r.severity === "critical" || r.severity === "high") &&
          r.status !== "closed" &&
          r.status !== "invalid" &&
          r.status !== "duplicate",
      );
    case "mine":
      return reports.filter((r) => r.assignedToUserId === currentUserId);
    case "overdue":
      // Overdue: open for more than 7 days without triage.
      return reports.filter((r) => {
        if (r.status !== "open") return false;
        const ageMs = Date.now() - new Date(r.createdAt).getTime();
        return ageMs > 7 * 24 * 60 * 60 * 1000;
      });
    default:
      return reports;
  }
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
    status?: string;
  }>;
}) {
  const { profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };
  const sp = await searchParams;

  const activeQueue = parseQueue(sp.queue);
  const activeStatus = parseStatus(sp.status);
  const activeKind = parseKind(sp.kind);
  const activeSeverity = parseSeverity(sp.severity);

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // Build allowedProvinces for <JurisdictionSwitcher>.
  const allowedProvinces =
    profile.role === "admin"
      ? ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // Exclude rows under active moderation (flagged but not resolved by moderator).
  const notUnderModeration = or(
    isNull(welfareReports.flaggedAt),
    isNotNull(welfareReports.moderationResolvedAt),
  );

  // Fetch metrics and report list in parallel.
  let [metrics, rows] = await Promise.all([
    fetchWelfareMetrics(actor, jurisdictions, user.id),
    db
      .select()
      .from(welfareReports)
      .where(
        activeStatus
          ? and(eq(welfareReports.status, activeStatus), notUnderModeration)
          : notUnderModeration,
      )
      .orderBy(desc(welfareReports.createdAt))
      .limit(500),
  ]);

  // Scope filtering for govt role (can't do tuple match in SQL with Drizzle).
  if (profile.role === "govt") {
    rows = rows.filter((r) =>
      jurisdictions.some(
        (j) => j.province === r.jurisdictionProvince && j.locality === r.jurisdictionLocality,
      ),
    );
  }
  if (activeKind) rows = rows.filter((r) => r.kind === activeKind);
  if (activeSeverity) rows = rows.filter((r) => r.severity === activeSeverity);

  // Apply queue tab filter.
  const visibleRows = filterByQueue(rows, activeQueue, user.id);

  const panelListId = "panel-maltrato-lista-titulo";

  const TABS = [
    { value: "urgent" as const, label: "Urgentes" },
    { value: "mine" as const, label: "Mías" },
    { value: "all" as const, label: "Todas" },
    { value: "overdue" as const, label: "Atrasadas" },
  ];

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Page header */}
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            Denuncias de maltrato
          </h1>
          <p className="text-sm text-gob-text-gray">
            Cola de triage bajo Ley Nacional 14.346.{" "}
            {profile.role === "admin"
              ? "Vista universal — todas las jurisdicciones."
              : "Filtradas por tu jurisdicción."}
          </p>
        </header>

        {/* No-scope warning */}
        {noScope && (
          <div className="rounded-lg border border-gob-warning  bg-gob-warning/10  px-4 py-3 text-sm text-gob-warning-text ">
            Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
            una.
          </div>
        )}

        {/* Filters row */}
        <div className="grid md:grid-cols-2 gap-3">
          <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={[]} />
          <PeriodPicker defaultPreset="30d" />
        </div>

        {/* 4 metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Sin asignar"
            value={String(metrics.unassignedCount)}
            tone={metrics.unassignedCount > 0 ? "warning" : "neutral"}
            href="/gob/maltrato?queue=urgent"
          />
          <MetricCard
            label="Mías"
            value={String(metrics.myCount)}
            tone="info"
            href="/gob/maltrato?queue=mine"
          />
          <MetricCard
            label="En investigación"
            value={String(metrics.inProgressCount)}
            tone="neutral"
          />
          <MetricCard label="Cerradas (30d)" value={String(metrics.closedMonth)} tone="success" />
        </div>

        {/* Queue tabs + list panel */}
        <Suspense>
          <Tabs paramKey="queue" defaultValue="all" tabs={TABS} aria-label="Cola de denuncias">
            {TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                <Panel aria-labelledby={panelListId} className="mt-4">
                  <PanelHeader
                    title={<span id={panelListId}>Denuncias ({visibleRows.length})</span>}
                  />
                  <PanelBody>
                    {visibleRows.length === 0 ? (
                      <EmptyState
                        icon="file-text"
                        title="Sin denuncias en esta cola"
                        description="No hay denuncias que coincidan con los filtros seleccionados."
                      />
                    ) : (
                      <ul className="space-y-2">
                        {visibleRows.map((r) => (
                          <WelfareDenunciaRow key={r.id} report={r} />
                        ))}
                      </ul>
                    )}
                  </PanelBody>
                </Panel>
              </TabsContent>
            ))}
          </Tabs>
        </Suspense>
      </div>
    </main>
  );
}
