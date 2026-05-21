// Preview-only page for the Phase 1 redesign of /gob.
//
// Intentionally isolated from the live /gob/page.tsx and uses hardcoded
// sample data so the new components can be reviewed visually without
// wiring real queries yet.
//
// To activate live, replace SAMPLE_KPIS / SAMPLE_RIGHT_COL with live
// queries from lib/govt-dashboards.ts and lib/case-queries.ts, then
// retire this file in favor of editing app/gob/page.tsx directly.
//
// Access: this preview is gated by the same auth guard as /gob.

import Link from "next/link";

import { DashboardCard, GobDashboardShell } from "@/components/GobDashboardShell";
import { JurisdictionFilterBar, readFilterParams } from "@/components/JurisdictionFilterBar";
import { KpiTile, KpiTileGrid } from "@/components/KpiTile";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

export default async function GobDashboardV2Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const sp = await searchParams;
  const params = readFilterParams(toURLSearchParams(sp));

  const scopeLabel =
    profile.role === "admin"
      ? "Universal"
      : jurisdictions.length === 0
        ? "Sin localidades asignadas"
        : jurisdictions.length === 1
          ? `${jurisdictions[0].locality}, ${jurisdictions[0].province}`
          : `${jurisdictions.length} localidades`;

  // ---------------------------------------------------------------------
  // Sample data — replace with real queries once the schema is restored.
  // ---------------------------------------------------------------------
  const SAMPLE_KPIS = {
    rabiesCoverage: { current: 68, target: 80, partidos: 23 },
    sterilizations: { count: 1247, deltaPct: 12, orgs: 31 },
    bitesPer10k: { rate: 4.2, delta: 0.3, reports: 182 },
    activeZoonosis: { count: 8, rabies: 2, lepto: 4, hidat: 1, deltaWeek: 1 },
  };

  return (
    <GobDashboardShell
      eyebrow={`MiMAR Gobierno · ${profile.role} · ${scopeLabel}`}
      title="Panel de jurisdicción"
      description="Vista preliminar — Fase 1 del rediseño del portal organismo."
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
            title="Mapa de incidencia"
            action={
              <Link href="/gob/mapa" className="text-blue-700 hover:underline dark:text-blue-400">
                Ampliar mapa →
              </Link>
            }
          >
            <div className="flex h-56 items-center justify-center rounded-lg bg-neutral-50 text-sm text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
              Mapa coroplético — pendiente Fase 2 (MapLibre)
            </div>
          </DashboardCard>

          <DashboardCard
            title="Casos regulatorios"
            action={
              <Link href="/gob/casos" className="text-blue-700 hover:underline dark:text-blue-400">
                Ver todos →
              </Link>
            }
          >
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Kanban cross-org pendiente — conectar a <code>listCasesForGovt()</code> cuando la
              tabla <code>cases</code> esté en el schema.
            </p>
          </DashboardCard>
        </>
      }
      aside={
        <>
          <DashboardCard title="Hoy">
            <ul className="space-y-3 text-sm">
              <li>
                <p className="font-medium text-neutral-900 dark:text-neutral-50">
                  Inspección rutina · Refugio Patitas
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  10:30 · La Plata · Insp. Vargas
                </p>
              </li>
              <li>
                <p className="font-medium text-neutral-900 dark:text-neutral-50">
                  Audiencia sanción · Refugio Norte
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  12:00 · Inc. RP-2024-091
                </p>
              </li>
              <li>
                <p className="font-medium text-neutral-900 dark:text-neutral-50">
                  Reunión zoonosis · Berisso
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  16:00 · 3 organismos
                </p>
              </li>
            </ul>
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
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              5 denuncias nuevas — conectar a <code>welfareReports</code>.
            </p>
          </DashboardCard>

          <DashboardCard
            title="Organizaciones"
            action={
              <Link
                href="/gob/organizaciones"
                className="text-blue-700 hover:underline dark:text-blue-400"
              >
                Ver todas →
              </Link>
            }
          >
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat tone="success" n={47} label="habilitadas" />
              <Stat tone="warning" n={3} label="en revisión" />
              <Stat tone="danger" n={1} label="sancionada" />
            </div>
          </DashboardCard>
        </>
      }
    />
  );
}

function Stat({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: "success" | "warning" | "danger";
}) {
  const frame =
    tone === "success"
      ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
      : tone === "warning"
        ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        : "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100";
  return (
    <div className={`rounded-lg p-3 ${frame}`}>
      <p className="text-2xl font-semibold tabular-nums">{n}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function toURLSearchParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") p.set(k, v);
    else if (Array.isArray(v) && v.length > 0) p.set(k, v[0]);
  }
  return p;
}
