// /gob home — v2 layout (Chunk L swap).
//
// KPI tiles are live data queries scoped to the viewer's jurisdiction.
// Fetchers live in lib/govt-home-kpis.ts (L-followup sprint).
//
// Preserved from old /gob/page.tsx:
//   - fetchVisiblePendingRequests → cola count + preview cards
//   - auditLog query → "Actividad reciente" aside card
//   - requireAdminOrGovtOrRedirect → capability guard

import { and, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";

import { CaseBadge } from "@/components/CaseBadge";
import { JurisdictionFilterBar, readFilterParams } from "@/components/JurisdictionFilterBar";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { auditLog, db } from "@/db";
import { fetchVisiblePendingRequests } from "@/lib/approval-scope";
import { listLocalitiesByProvince } from "@/lib/ar-localidades";
import { PROVINCES, type ProvinceCode } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listOpenCasesForAdminPreview, listOpenCasesForGovtPreview } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";
import {
  fetchActiveZoonosis,
  fetchBitesPer10k,
  fetchOpenWelfareReportsCount,
  fetchRabiesCoverage,
  fetchSterilizationMetrics,
} from "@/lib/govt-home-kpis";

const ACTION_LABELS: Record<string, string> = {
  request_viewed: "Vio una solicitud",
  evidence_viewed: "Vio evidencia",
  request_approved: "Aprobó una solicitud",
  request_rejected: "Rechazó una solicitud",
  pii_queried: "Buscó por PII",
  admin_seeded: "Admin inicializado",
};

export default async function GobiernoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const sp = await searchParams;
  const params = readFilterParams(toURLSearchParams(sp));

  // --- Jurisdiction filter resolution -------------------------------------
  // Resolve selected province slug (from the filter bar) to a Province object
  // so we can load its localities and narrow the KPI queries.

  const selectedProvinceObj = params.province
    ? (PROVINCES.find((p) => p.slug === params.province) ?? null)
    : null;

  const selectedLocalitySlug = params.locality || null;

  // Load localities for the selected province (for the filter bar dropdown).
  const rawLocalities = selectedProvinceObj
    ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
    : [];

  // localitiesByProvince returns { slug, name }; JurisdictionFilterBar expects { value, label }.
  const localityOptions = rawLocalities.map((l) => ({ value: l.slug, label: l.name }));

  // Narrow jurisdictions for KPI queries when a province/locality filter is active.
  // Intersect with the user's real assignments so a govt user can't widen scope.
  let filteredJurisdictions = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    if (selectedLocalitySlug) {
      // Match the locality by slug → canonical name via rawLocalities.
      const localityRow = rawLocalities.find((l) => l.slug === selectedLocalitySlug);
      if (localityRow) {
        filteredJurisdictions = jurisdictions.filter(
          (j) => j.province === provinceName && j.locality === localityRow.name,
        );
      } else {
        filteredJurisdictions = jurisdictions.filter((j) => j.province === provinceName);
      }
    } else {
      filteredJurisdictions = jurisdictions.filter((j) => j.province === provinceName);
    }
  }

  // Build province options for the filter bar.
  // Admin: all 24 provinces. Govt: provinces the user has assignments in.
  const provinceOptions: Array<{ value: string; label: string }> =
    profile.role === "admin"
      ? PROVINCES.map((p) => ({ value: p.slug as string, label: p.name as string }))
      : Array.from(new Set(jurisdictions.map((j) => j.province))).flatMap((name) => {
          const p = PROVINCES.find((pr) => pr.name === name);
          return p ? [{ value: p.slug as string, label: p.name as string }] : [];
        });

  // --- Live queries (preserved from old /gob/page.tsx) -------------------

  const pending = await fetchVisiblePendingRequests(profile, jurisdictions);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentDecisions = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      performedAt: auditLog.performedAt,
    })
    .from(auditLog)
    .where(and(eq(auditLog.actorUserId, user.id), gte(auditLog.performedAt, sevenDaysAgo)))
    .orderBy(desc(auditLog.performedAt))
    .limit(10);

  // --- Scope label --------------------------------------------------------

  const scopeLabel =
    profile.role === "admin"
      ? "Universal"
      : jurisdictions.length === 0
        ? "Sin localidades asignadas"
        : jurisdictions.length === 1
          ? `${jurisdictions[0].locality}, ${jurisdictions[0].province}`
          : `${jurisdictions.length} localidades`;

  // --- KPI live queries (L-followup) -------------------------------------

  const actor = { role: profile.role } as const;
  const [rabiesCoverage, sterilizations, bitesPer10k, activeZoonosis, openWelfareReports] =
    await Promise.all([
      fetchRabiesCoverage(actor, filteredJurisdictions),
      fetchSterilizationMetrics(actor, filteredJurisdictions),
      fetchBitesPer10k(actor, filteredJurisdictions),
      fetchActiveZoonosis(actor, filteredJurisdictions),
      fetchOpenWelfareReportsCount(actor, filteredJurisdictions),
    ]);

  // --- Casos regulatorios (open/escalated, top 5) -------------------------
  // Status filter + LIMIT 5 are pushed into SQL: admin sees universal scope,
  // govt is jurisdiction-scoped. Previously this loaded up to 500/300 rows and
  // sliced 5 in JS — a full table scan on every dashboard render.

  const openCasesPreview =
    profile.role === "admin"
      ? await listOpenCasesForAdminPreview(5)
      : await listOpenCasesForGovtPreview(filteredJurisdictions, 5);
  const openCases = openCasesPreview.items;
  const openCasesTotal = openCasesPreview.total;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          MiMAR Gobierno · {profile.role} · {scopeLabel}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Panel de jurisdicción</h1>

        {/* Header actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href="/gob/cola"
            className="rounded-[6px] bg-ln-op-azul px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ln-op-azul-700 transition-colors no-underline"
          >
            Cola de aprobaciones
          </Link>
          <Link
            href="/gob/organizaciones"
            className="rounded-[6px] border border-ln-op-line px-3 py-1.5 text-[13px] font-medium text-ln-op-azul hover:bg-ln-op-stripe transition-colors no-underline"
          >
            Habilitación
          </Link>
          <Link
            href="/gob/maltrato"
            className="rounded-[6px] border border-ln-op-danger px-3 py-1.5 text-[13px] font-medium text-ln-op-danger hover:bg-ln-op-danger-bg transition-colors no-underline"
          >
            Acta de infracción
          </Link>
        </div>
      </header>

      {/* Jurisdiction filter bar */}
      <JurisdictionFilterBar
        range={params.range}
        province={params.province}
        locality={params.locality}
        orgType={params.orgType}
        provinces={provinceOptions}
        localities={localityOptions}
        orgTypes={[]}
      />

      {/* KPI strip */}
      <section
        aria-label="Indicadores de jurisdicción"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <OpKpi
          label="Cobertura antirrábica"
          value={`${rabiesCoverage.current}%`}
          tone={rabiesCoverage.current >= rabiesCoverage.target ? "ok" : "warn"}
          bar={rabiesCoverage.current}
          sub={`meta ${rabiesCoverage.target}% · ${rabiesCoverage.partidos} partidos`}
          href="/gob/analytics"
        />
        <OpKpi
          label="Esterilizaciones / mes"
          value={sterilizations.count.toLocaleString("es-AR")}
          delta={
            sterilizations.deltaPct !== 0
              ? {
                  text: `${Math.abs(sterilizations.deltaPct)}% vs mes ant.`,
                  up: sterilizations.deltaPct >= 0,
                }
              : undefined
          }
          sub={`${sterilizations.orgs} organizaciones`}
          href="/gob/analytics"
        />
        <OpKpi
          label="Mordeduras / 10k hab."
          value={bitesPer10k.rate.toString().replace(".", ",")}
          tone="warn"
          delta={
            bitesPer10k.delta !== 0
              ? {
                  text: `${Math.abs(bitesPer10k.delta).toString().replace(".", ",")} vs año ant.`,
                  up: false,
                }
              : undefined
          }
          sub={`${bitesPer10k.reports} reportes`}
          href="/gob/vigilancia"
        />
        <OpKpi
          label="Casos zoonosis activos"
          value={activeZoonosis.count}
          tone="danger"
          sub={`${activeZoonosis.rabies} rabia · ${activeZoonosis.lepto} lepto · ${activeZoonosis.hidat} hidat.`}
          href="/gob/vigilancia"
        />
      </section>

      {/* Main 2-col grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Cola de aprobaciones */}
          <OpCard>
            <OpCardHead
              title="Cola de aprobaciones"
              actions={
                <Link
                  href="/gob/cola"
                  className="text-[12px] text-ln-op-azul hover:underline no-underline"
                >
                  Ver cola →
                </Link>
              }
            />
            <OpCardBody>
              {pending.length === 0 ? (
                <p className="text-[13px] text-ln-op-mute">No hay solicitudes pendientes.</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-ln-serif text-[30px] font-semibold leading-none tracking-[-0.02em] text-ln-op-ink">
                    {pending.length}
                  </p>
                  <p className="text-[12px] text-ln-op-mute">solicitudes esperando revisión</p>
                </div>
              )}
            </OpCardBody>
          </OpCard>

          {/* Actividad reciente */}
          <OpCard>
            <OpCardHead
              title="Actividad reciente"
              actions={
                recentDecisions.length > 0 ? (
                  <span className="text-[12px] text-ln-op-mute">últimos 7 días</span>
                ) : null
              }
            />
            <OpCardBody className="p-0">
              {recentDecisions.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-ln-op-mute">
                  No tenés acciones registradas en los últimos 7 días.
                </p>
              ) : (
                <ul className="divide-y divide-ln-op-line-2">
                  {recentDecisions.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                    >
                      <p className="text-[13px] text-ln-op-ink">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </p>
                      <time className="text-[12px] text-ln-op-mute tabular-nums whitespace-nowrap">
                        {new Date(entry.performedAt).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </OpCardBody>
          </OpCard>

          {/* Casos regulatorios */}
          <OpCard>
            <OpCardHead
              title="Casos regulatorios"
              actions={
                <Link
                  href="/gob/casos"
                  className="text-[12px] text-ln-op-azul hover:underline no-underline"
                >
                  {openCasesTotal > openCases.length
                    ? `Ver todos (${openCasesTotal}) →`
                    : "Ver todos →"}
                </Link>
              }
            />
            <OpCardBody className="p-0">
              {profile.role !== "admin" && jurisdictions.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-ln-op-mute">
                  Sin jurisdicciones asignadas todavía.
                </p>
              ) : openCases.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-ln-op-mute">
                  Sin casos abiertos{" "}
                  {profile.role === "admin" ? "en el sistema" : "en tu jurisdicción"}.
                </p>
              ) : (
                <ul className="divide-y divide-ln-op-line-2">
                  {openCases.map((c) => (
                    <li key={c.id} className="flex flex-col gap-1 px-4 py-2.5 odd:bg-ln-op-stripe">
                      <div className="flex items-center justify-between gap-2">
                        <CaseBadge
                          publicCode={c.publicCode}
                          caseKind={c.caseKind}
                          status={c.status}
                          size="sm"
                        />
                        <time className="text-[12px] text-ln-op-mute tabular-nums whitespace-nowrap">
                          {formatDate(c.openedAt)}
                        </time>
                      </div>
                      {c.primaryPetPublicToken && c.primaryPetName ? (
                        <Link
                          href={`/mis-mascotas/${c.primaryPetPublicToken}`}
                          className="text-[12px] text-ln-op-mute hover:underline no-underline"
                        >
                          🐾 {c.primaryPetName}
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </OpCardBody>
          </OpCard>
        </div>

        {/* Right aside column */}
        <div className="space-y-4">
          {/* Vigilancia */}
          <OpCard>
            <OpCardHead
              title="Vigilancia"
              actions={
                <Link
                  href="/gob/vigilancia"
                  className="text-[12px] text-ln-op-azul hover:underline no-underline"
                >
                  Ver →
                </Link>
              }
            />
            <OpCardBody>
              <p className="text-[13px] text-ln-op-mute">
                Señales de zoonosis filtradas a tu cobertura.
              </p>
            </OpCardBody>
          </OpCard>

          {/* Denuncias ciudadanas */}
          <OpCard>
            <OpCardHead
              title="Denuncias ciudadanas"
              actions={
                <Link
                  href="/gob/maltrato"
                  className="text-[12px] text-ln-op-azul hover:underline no-underline"
                >
                  Ver bandeja →
                </Link>
              }
            />
            <OpCardBody>
              {openWelfareReports.count === 0 ? (
                <p className="text-[13px] text-ln-op-mute">
                  No hay denuncias activas en tu jurisdicción.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="font-ln-serif text-[30px] font-semibold leading-none tracking-[-0.02em] text-ln-op-ink">
                    {openWelfareReports.count}
                  </p>
                  <p className="text-[12px] text-ln-op-mute">
                    {openWelfareReports.count === 1 ? "denuncia activa" : "denuncias activas"}
                  </p>
                </div>
              )}
            </OpCardBody>
          </OpCard>

          {/* Pérdidas */}
          <OpCard>
            <OpCardHead
              title="Pérdidas"
              actions={
                <Link
                  href="/gob/perdidas"
                  className="text-[12px] text-ln-op-azul hover:underline no-underline"
                >
                  Ver →
                </Link>
              }
            />
            <OpCardBody>
              <p className="text-[13px] text-ln-op-mute">
                Mascotas en status <code className="text-[12px] font-mono">lost</code> en tu
                cobertura.
              </p>
            </OpCardBody>
          </OpCard>
        </div>
      </div>
    </div>
  );
}

// Converts Next.js searchParams (Record) to URLSearchParams so readFilterParams
// (which expects URLSearchParams) can parse it on the server.
function toURLSearchParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") p.set(k, v);
    else if (Array.isArray(v) && v.length > 0) p.set(k, v[0]);
  }
  return p;
}

export const dynamic = "force-dynamic";
