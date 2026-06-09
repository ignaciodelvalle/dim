import { Suspense } from "react";

import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { Tabs, TabsContent } from "@/components/poncho";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { db, welfareReports } from "@/db";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { type ProvinceCode, provinceByCode } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  type MaltratoQueue,
  PROVINCE_ISO_MAP,
  buildMaltratoListConditions,
  fetchWelfareMetrics,
} from "@/lib/govt-dashboards";
import {
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  WELFARE_REPORT_STATUSES,
  type WelfareReportKind,
  type WelfareReportSeverity,
} from "@/src/modules/welfare/domain/types";
import { count, desc } from "drizzle-orm";

import { WelfareDenunciaRow } from "./_components/WelfareDenunciaRow";

// All Argentine provinces list for <JurisdictionSwitcher>.
const ALL_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AR-C", name: "CABA" },
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

const PAGE_SIZE = 50;
const VALID_QUEUES: MaltratoQueue[] = ["urgent", "mine", "all", "overdue"];

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

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  // Cap at 10_000 to prevent astronomical OFFSET values that would cause DB errors.
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 10_000) : 1;
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
    page?: string;
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
  const currentPage = parsePage(sp.page);

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // Resolve selected province ISO code → ProvinceCode + canonical name.
  const selectedProvinceIso = sp.province ?? null;
  const selectedLocalitySlug = sp.locality ?? null;
  const selectedProvinceObj = selectedProvinceIso ? provinceByCode(selectedProvinceIso) : null;

  // Fetch localities for the selected province to populate <JurisdictionSwitcher>.
  const localities =
    selectedProvinceObj != null
      ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
      : [];

  // Resolve locality slug → canonical locality name for the WHERE clause.
  const selectedLocalityRow =
    selectedProvinceObj && selectedLocalitySlug
      ? await localityByName(selectedProvinceObj.code as ProvinceCode, selectedLocalitySlug)
      : null;

  // Build allowedProvinces for <JurisdictionSwitcher>.
  const allowedProvinces =
    profile.role === "admin"
      ? ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // Narrow the jurisdictions scope when a province/locality filter is active.
  // Always intersects with the user's assignments — never widens beyond them.
  // Admin stays unscoped (empty jurisdictions by contract from requireAdminOrGovtOrRedirect).
  let filteredJurisdictions = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    if (selectedLocalityRow) {
      // Province + locality: intersect with assignments (NOT replacement).
      // govtAssignments.jurisdictionLocality is NOT NULL, so exact match is correct.
      filteredJurisdictions = jurisdictions.filter(
        (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
      );
    } else {
      // Province only: keep assignments for that province.
      filteredJurisdictions = jurisdictions.filter((j) => j.province === provinceName);
    }
  }

  // Build the SQL WHERE condition covering all filters (scope + queue + kind + severity).
  // For admin, pass the canonical province/locality so the SQL WHERE narrows
  // by the URL selection. Govt scope is already enforced by filteredJurisdictions
  // (intersection of assignments ∩ URL selection). Never pass these for govt.
  const adminSelectedProvince = actor.role === "admin" ? (selectedProvinceObj?.name ?? null) : null;
  const adminSelectedLocality =
    actor.role === "admin" ? (selectedLocalityRow?.localityName ?? null) : null;

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

  // Fetch metrics and paginated report list in parallel.
  const offset = (currentPage - 1) * PAGE_SIZE;

  const [metrics, rows, [totalRow]] = await Promise.all([
    fetchWelfareMetrics(actor, filteredJurisdictions, user.id),
    db
      .select()
      .from(welfareReports)
      .where(whereCondition)
      // Deterministic ORDER BY ensures stable pagination (no skip/repeat across pages).
      .orderBy(desc(welfareReports.createdAt), desc(welfareReports.id))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ n: count() }).from(welfareReports).where(whereCondition),
  ]);

  const totalCount = totalRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasMore = currentPage < totalPages;

  // Build a URL that preserves all current query params but overrides ?page=.
  function pageUrl(p: number): string {
    const params = new URLSearchParams();
    if (sp.queue) params.set("queue", sp.queue);
    if (sp.kind) params.set("kind", sp.kind);
    if (sp.severity) params.set("severity", sp.severity);
    if (sp.status) params.set("status", sp.status);
    if (sp.province) params.set("province", sp.province);
    if (sp.locality) params.set("locality", sp.locality);
    params.set("page", String(p));
    return `/gob/maltrato?${params.toString()}`;
  }

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
        <header className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight text-ln-op-ink">
            Denuncias de maltrato
          </h1>
          <p className="text-[12px] text-ln-op-mute">
            Cola de triage bajo Ley Nacional 14.346.{" "}
            {profile.role === "admin"
              ? "Vista universal — todas las jurisdicciones."
              : "Filtradas por tu jurisdicción."}
          </p>
        </header>

        {/* No-scope warning */}
        {noScope && (
          <div className="rounded-[6px] border border-ln-op-warn-bd border-l-[4px] border-l-ln-op-warn bg-ln-op-warn-bg px-4 py-3 text-[12px] text-ln-op-warn">
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
            href="/gob/maltrato?queue=urgent"
          />
          <OpKpi
            label="Mías"
            value={String(metrics.myCount)}
            tone="blue"
            href="/gob/maltrato?queue=mine"
          />
          <OpKpi label="En investigación" value={String(metrics.inProgressCount)} tone="neutral" />
          <OpKpi label="Cerradas (30d)" value={String(metrics.closedMonth)} tone="ok" />
        </div>

        {/* Queue tabs + list card */}
        <Suspense>
          <Tabs paramKey="queue" defaultValue="all" tabs={TABS} aria-label="Cola de denuncias">
            {TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                <OpCard className="mt-4">
                  <OpCardHead title={`Denuncias (${totalCount})`} />
                  <OpCardBody>
                    {rows.length === 0 ? (
                      <p className="text-[12px] text-ln-op-mute py-4 text-center">
                        No hay denuncias que coincidan con los filtros seleccionados.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {rows.map((r) => (
                          <WelfareDenunciaRow key={r.id} report={r} />
                        ))}
                      </ul>
                    )}
                    {totalPages > 1 && (
                      <nav
                        aria-label="Paginación de denuncias"
                        className="mt-4 flex items-center justify-between gap-2 text-[12px]"
                      >
                        <span className="text-ln-op-mute">
                          Página {currentPage} de {totalPages} ({totalCount} denuncias)
                        </span>
                        <div className="flex gap-2">
                          {currentPage > 1 ? (
                            <a
                              href={pageUrl(currentPage - 1)}
                              className="rounded border border-ln-op-line px-3 py-1 text-ln-op-ink hover:bg-ln-op-stripe"
                            >
                              Anterior
                            </a>
                          ) : (
                            <span
                              aria-disabled="true"
                              className="rounded border border-ln-op-line px-3 py-1 text-ln-op-mute opacity-50 cursor-not-allowed"
                            >
                              Anterior
                            </span>
                          )}
                          {hasMore ? (
                            <a
                              href={pageUrl(currentPage + 1)}
                              className="rounded border border-ln-op-line px-3 py-1 text-ln-op-ink hover:bg-ln-op-stripe"
                            >
                              Siguiente
                            </a>
                          ) : (
                            <span
                              aria-disabled="true"
                              className="rounded border border-ln-op-line px-3 py-1 text-ln-op-mute opacity-50 cursor-not-allowed"
                            >
                              Siguiente
                            </span>
                          )}
                        </div>
                      </nav>
                    )}
                  </OpCardBody>
                </OpCard>
              </TabsContent>
            ))}
          </Tabs>
        </Suspense>
      </div>
    </main>
  );
}
