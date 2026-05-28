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
import { DashboardCard, GobDashboardShell } from "@/components/GobDashboardShell";
import { JurisdictionFilterBar, readFilterParams } from "@/components/JurisdictionFilterBar";
import { KpiTile, KpiTileGrid } from "@/components/KpiTile";
import { auditLog, db } from "@/db";
import { fetchVisiblePendingRequests } from "@/lib/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listCasesForAdmin, listCasesForGovt } from "@/lib/case-queries";
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
      fetchRabiesCoverage(actor, jurisdictions),
      fetchSterilizationMetrics(actor, jurisdictions),
      fetchBitesPer10k(actor, jurisdictions),
      fetchActiveZoonosis(actor, jurisdictions),
      fetchOpenWelfareReportsCount(actor, jurisdictions),
    ]);

  // --- Casos regulatorios (open/escalated, top 5) -------------------------
  // Admin sees universal scope via listCasesForAdmin; govt is jurisdiction-scoped.

  const allCases =
    profile.role === "admin"
      ? await listCasesForAdmin()
      : jurisdictions.length === 0
        ? []
        : await listCasesForGovt(jurisdictions);
  const openCasesAll = allCases.filter((c) => c.status === "open" || c.status === "escalated");
  const openCases = openCasesAll.slice(0, 5);
  const openCasesTotal = openCasesAll.length;

  return (
    <GobDashboardShell
      eyebrow={`MiMAR Gobierno · ${profile.role} · ${scopeLabel}`}
      title="Panel de jurisdicción"
      actions={
        <>
          <Link
            href="/gob/cola"
            className="rounded-md bg-gob-info px-3 py-1.5 text-sm font-medium text-white hover:bg-gob-info"
          >
            Cola de aprobaciones
          </Link>
          <Link
            href="/gob/organizaciones"
            className="rounded-md border border-gob-info px-3 py-1.5 text-sm font-medium text-gob-azul-link hover:bg-gob-info/10 "
          >
            Habilitación
          </Link>
          <Link
            href="/gob/maltrato"
            className="rounded-md border border-gob-danger px-3 py-1.5 text-sm font-medium text-gob-danger hover:bg-gob-danger/10 "
          >
            Acta de infracción
          </Link>
        </>
      }
      filters={
        <JurisdictionFilterBar
          range={params.range}
          province={params.province}
          locality={params.locality}
          orgType={params.orgType}
          provinces={[
            { value: "buenos-aires", label: "Pcia. Buenos Aires" },
            { value: "caba", label: "CABA" },
          ]}
          localities={[
            { value: "la-plata", label: "La Plata" },
            { value: "berisso", label: "Berisso" },
            { value: "ensenada", label: "Ensenada" },
          ]}
          orgTypes={[
            { value: "shelter", label: "Refugio" },
            { value: "clinic", label: "Clínica" },
            { value: "rescue", label: "Rescate" },
          ]}
        />
      }
      kpiStrip={
        <KpiTileGrid>
          <KpiTile
            variant="target"
            label="Cobertura antirrábica"
            value={`${rabiesCoverage.current}%`}
            current={rabiesCoverage.current}
            target={rabiesCoverage.target}
            subline={`meta ${rabiesCoverage.target}% · ${rabiesCoverage.partidos} partidos`}
            href="/gob/indicadores?metric=rabies"
          />
          <KpiTile
            variant="delta"
            label="Esterilizaciones / mes"
            value={sterilizations.count.toLocaleString("es-AR")}
            deltaLabel={
              sterilizations.deltaPct >= 0
                ? `↑ ${sterilizations.deltaPct}% vs mes ant.`
                : `↓ ${Math.abs(sterilizations.deltaPct)}% vs mes ant.`
            }
            direction={sterilizations.deltaPct >= 0 ? "up" : "down"}
            subline={`${sterilizations.orgs} organizaciones`}
            href="/gob/indicadores?metric=sterilizations"
          />
          <KpiTile
            variant="delta"
            label="Mordeduras / 10k hab."
            value={bitesPer10k.rate.toString().replace(".", ",")}
            deltaLabel={
              bitesPer10k.delta >= 0
                ? `↑ ${bitesPer10k.delta.toString().replace(".", ",")} vs año ant.`
                : `↓ ${Math.abs(bitesPer10k.delta).toString().replace(".", ",")} vs año ant.`
            }
            direction="down"
            subline={`${bitesPer10k.reports} reportes`}
            href="/gob/indicadores?metric=bites"
          />
          <KpiTile
            tone="danger"
            label="Casos zoonosis activos"
            value={activeZoonosis.count}
            subline={`${activeZoonosis.rabies} rabia · ${activeZoonosis.lepto} lepto · ${activeZoonosis.hidat} hidat.`}
            href="/gob/vigilancia"
          />
        </KpiTileGrid>
      }
      main={
        <>
          <DashboardCard
            title="Cola de aprobaciones"
            action={
              <Link href="/gob/cola" className="text-gob-azul-link hover:underline ">
                Ver cola →
              </Link>
            }
          >
            {pending.length === 0 ? (
              <p className="text-sm text-gob-text-muted ">No hay solicitudes pendientes.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-3xl font-semibold tabular-nums text-gob-text ">
                  {pending.length}
                </p>
                <p className="text-xs text-gob-text-muted ">solicitudes esperando revisión</p>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Actividad reciente"
            action={
              recentDecisions.length > 0 ? (
                <span className="text-xs text-gob-text-muted ">últimos 7 días</span>
              ) : null
            }
          >
            {recentDecisions.length === 0 ? (
              <p className="text-sm text-gob-text-muted ">
                No tenés acciones registradas en los últimos 7 días.
              </p>
            ) : (
              <ul className="space-y-1">
                {recentDecisions.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 odd:bg-gob-surface-alt "
                  >
                    <p className="text-sm text-gob-text ">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <time className="text-xs text-gob-text-muted  tabular-nums whitespace-nowrap">
                      {new Date(entry.performedAt).toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title="Casos regulatorios"
            action={
              <Link href="/gob/casos" className="text-gob-azul-link hover:underline ">
                {openCasesTotal > openCases.length
                  ? `Ver todos (${openCasesTotal}) →`
                  : "Ver todos →"}
              </Link>
            }
          >
            {profile.role !== "admin" && jurisdictions.length === 0 ? (
              <p className="text-sm text-gob-text-muted ">Sin jurisdicciones asignadas todavía.</p>
            ) : openCases.length === 0 ? (
              <p className="text-sm text-gob-text-muted ">
                Sin casos abiertos{" "}
                {profile.role === "admin" ? "en el sistema" : "en tu jurisdicción"}.
              </p>
            ) : (
              <ul className="space-y-2">
                {openCases.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-col gap-1 rounded-md px-2 py-1.5 odd:bg-gob-surface-alt "
                  >
                    <div className="flex items-center justify-between gap-2">
                      <CaseBadge
                        publicCode={c.publicCode}
                        caseKind={c.caseKind}
                        status={c.status}
                        size="sm"
                      />
                      <time className="text-xs text-gob-text-muted  tabular-nums whitespace-nowrap">
                        {formatDate(c.openedAt)}
                      </time>
                    </div>
                    {c.primaryPetPublicToken && c.primaryPetName ? (
                      <Link
                        href={`/mis-mascotas/${c.primaryPetPublicToken}`}
                        className="text-xs text-gob-text-gray hover:underline "
                      >
                        🐾 {c.primaryPetName}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>
        </>
      }
      aside={
        <>
          <DashboardCard
            title="Vigilancia"
            action={
              <Link href="/gob/vigilancia" className="text-gob-azul-link hover:underline ">
                Ver →
              </Link>
            }
          >
            <p className="text-sm text-gob-text-muted ">
              Señales de zoonosis filtradas a tu cobertura.
            </p>
          </DashboardCard>

          <DashboardCard
            title="Denuncias ciudadanas"
            action={
              <Link href="/gob/maltrato" className="text-gob-azul-link hover:underline ">
                Ver bandeja →
              </Link>
            }
          >
            {openWelfareReports.count === 0 ? (
              <p className="text-sm text-gob-text-muted ">
                No hay denuncias activas en tu jurisdicción.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-3xl font-semibold tabular-nums text-gob-text ">
                  {openWelfareReports.count}
                </p>
                <p className="text-xs text-gob-text-muted ">
                  {openWelfareReports.count === 1 ? "denuncia activa" : "denuncias activas"}
                </p>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Pérdidas"
            action={
              <Link href="/gob/perdidas" className="text-gob-azul-link hover:underline ">
                Ver →
              </Link>
            }
          >
            <p className="text-sm text-gob-text-muted ">
              Mascotas en status <code className="text-xs">lost</code> en tu cobertura.
            </p>
          </DashboardCard>
        </>
      }
    />
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
