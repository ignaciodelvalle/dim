// /gob home — v2 layout (Chunk L swap).
//
// KPI tiles are HARDCODED placeholders per owner directive.
// Real per-jurisdiction queries for coverage, sterilizations, bite rate, and
// zoonosis counts do NOT exist yet.  All four are TODO(L-followup).
//
// Preserved from old /gob/page.tsx:
//   - fetchVisiblePendingRequests → cola count + preview cards
//   - auditLog query → "Actividad reciente" aside card
//   - requireAdminOrGovtOrRedirect → capability guard

import { and, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";

import { DashboardCard, GobDashboardShell } from "@/components/GobDashboardShell";
import { JurisdictionFilterBar, readFilterParams } from "@/components/JurisdictionFilterBar";
import { KpiTile, KpiTileGrid } from "@/components/KpiTile";
import { auditLog, db } from "@/db";
import { fetchVisiblePendingRequests } from "@/lib/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

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

  // --- KPI placeholders (HARDCODED) — TODO(L-followup) -------------------
  //
  // These values are static sample data.  Computing real numbers requires
  // per-jurisdiction queries that don't exist yet:
  //   - rabiesCoverage:   vaccination coverage view (not built)
  //   - sterilizations:   sterilization event aggregates (not built)
  //   - bitesPer10k:      bite-report rate per 10k population (not built)
  //   - activeZoonosis:   case count scoped to jurisdiction (not built)
  //
  // Replace each SAMPLE_KPIS field with a real query in the L-followup sprint.

  const SAMPLE_KPIS = {
    // TODO(L-followup): replace with vaccination coverage query
    rabiesCoverage: { current: 68, target: 80, partidos: 23 },
    // TODO(L-followup): replace with sterilization aggregate query
    sterilizations: { count: 1247, deltaPct: 12, orgs: 31 },
    // TODO(L-followup): replace with bite-rate query (reports / population)
    bitesPer10k: { rate: 4.2, delta: 0.3, reports: 182 },
    // TODO(L-followup): replace with active zoonosis case count query
    activeZoonosis: { count: 8, rabies: 2, lepto: 4, hidat: 1, deltaWeek: 1 },
  };

  return (
    <GobDashboardShell
      eyebrow={`MiMAR Gobierno · ${profile.role} · ${scopeLabel}`}
      title="Panel de jurisdicción"
      actions={
        <>
          <Link
            href="/gob/cola"
            className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
          >
            Cola de aprobaciones
          </Link>
          <Link
            href="/gob/organizaciones"
            className="rounded-md border border-blue-700 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
          >
            Habilitación
          </Link>
          <Link
            href="/gob/maltrato"
            className="rounded-md border border-red-700 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
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
          {/* TODO(L-followup): all four tiles use hardcoded SAMPLE_KPIS */}
          <KpiTile
            variant="target"
            label="Cobertura antirrábica"
            value={`${SAMPLE_KPIS.rabiesCoverage.current}%`}
            current={SAMPLE_KPIS.rabiesCoverage.current}
            target={SAMPLE_KPIS.rabiesCoverage.target}
            subline={`meta ${SAMPLE_KPIS.rabiesCoverage.target}% · ${SAMPLE_KPIS.rabiesCoverage.partidos} partidos`}
            href="/gob/indicadores?metric=rabies"
          />
          <KpiTile
            variant="delta"
            label="Esterilizaciones / mes"
            value={SAMPLE_KPIS.sterilizations.count.toLocaleString("es-AR")}
            deltaLabel={`↑ ${SAMPLE_KPIS.sterilizations.deltaPct}% vs abril`}
            direction="up"
            subline={`${SAMPLE_KPIS.sterilizations.orgs} organizaciones`}
            href="/gob/indicadores?metric=sterilizations"
          />
          <KpiTile
            variant="delta"
            label="Mordeduras / 10k hab."
            value={SAMPLE_KPIS.bitesPer10k.rate.toString().replace(".", ",")}
            deltaLabel={`↑ ${SAMPLE_KPIS.bitesPer10k.delta.toString().replace(".", ",")} vs abril`}
            direction="down"
            subline={`${SAMPLE_KPIS.bitesPer10k.reports} reportes`}
            href="/gob/indicadores?metric=bites"
          />
          <KpiTile
            tone="danger"
            label="Casos zoonosis activos"
            value={SAMPLE_KPIS.activeZoonosis.count}
            subline={`${SAMPLE_KPIS.activeZoonosis.rabies} rabia · ${SAMPLE_KPIS.activeZoonosis.lepto} lepto · ${SAMPLE_KPIS.activeZoonosis.hidat} hidat.`}
            href="/gob/vigilancia"
          />
        </KpiTileGrid>
      }
      main={
        <>
          <DashboardCard
            title="Cola de aprobaciones"
            action={
              <Link href="/gob/cola" className="text-blue-700 hover:underline dark:text-blue-400">
                Ver cola →
              </Link>
            }
          >
            {pending.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No hay solicitudes pendientes.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-3xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {pending.length}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  solicitudes esperando revisión
                </p>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Actividad reciente"
            action={
              recentDecisions.length > 0 ? (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  últimos 7 días
                </span>
              ) : null
            }
          >
            {recentDecisions.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No tenés acciones registradas en los últimos 7 días.
              </p>
            ) : (
              <ul className="space-y-1">
                {recentDecisions.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 odd:bg-neutral-50 dark:odd:bg-neutral-900/40"
                  >
                    <p className="text-sm text-neutral-900 dark:text-neutral-50">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <time className="text-xs text-neutral-500 dark:text-neutral-500 tabular-nums whitespace-nowrap">
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
              <Link href="/gob/casos" className="text-blue-700 hover:underline dark:text-blue-400">
                Ver todos →
              </Link>
            }
          >
            {/* TODO(L-followup): wire to listCasesForGovt() once cases table is in schema */}
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Kanban cross-org pendiente — conectar a{" "}
              <code className="text-xs">listCasesForGovt()</code> cuando la tabla{" "}
              <code className="text-xs">cases</code> esté en el schema.
            </p>
          </DashboardCard>
        </>
      }
      aside={
        <>
          <DashboardCard
            title="Vigilancia"
            action={
              <Link
                href="/gob/vigilancia"
                className="text-blue-700 hover:underline dark:text-blue-400"
              >
                Ver →
              </Link>
            }
          >
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Señales de zoonosis filtradas a tu cobertura.
            </p>
          </DashboardCard>

          <DashboardCard
            title="Denuncias ciudadanas"
            action={
              <Link
                href="/gob/maltrato"
                className="text-blue-700 hover:underline dark:text-blue-400"
              >
                Ver bandeja →
              </Link>
            }
          >
            {/* TODO(L-followup): connect to welfareReports count */}
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Conectar a <code className="text-xs">welfareReports</code>.
            </p>
          </DashboardCard>

          <DashboardCard
            title="Pérdidas"
            action={
              <Link
                href="/gob/perdidas"
                className="text-blue-700 hover:underline dark:text-blue-400"
              >
                Ver →
              </Link>
            }
          >
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
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
