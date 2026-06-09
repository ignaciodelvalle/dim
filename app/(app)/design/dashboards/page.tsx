// Showcase de primitivas de dashboards — Chunk E1.
// Ruta de QA visual para devs y diseño. Requiere autenticación; sin restricción de rol.
// No ejecuta queries reales — los datos son sintéticos para ilustrar cada componente.

import { Suspense } from "react";

import {
  JurisdictionSwitcher,
  MapChoropleth,
  MetricCard,
  Panel,
  PanelBody,
  PanelHeader,
  PeriodPicker,
  TimeSeriesChart,
} from "@/components/poncho";
import { requireUserOrRedirect } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Datos sintéticos
// ---------------------------------------------------------------------------

const SAMPLE_MAP_DATA = [
  { code: "AR-C", value: 420, label: "Ciudad Autónoma de Buenos Aires" },
  { code: "AR-B", value: 1240, label: "Buenos Aires" },
  { code: "AR-X", value: 680, label: "Córdoba" },
];

const SAMPLE_TIMESERIES = [
  { x: "Ene", y: 85 },
  { x: "Feb", y: 102 },
  { x: "Mar", y: 98 },
  { x: "Abr", y: 130 },
  { x: "May", y: 118 },
  { x: "Jun", y: 145 },
  { x: "Jul", y: 160 },
  { x: "Ago", y: 137 },
  { x: "Sep", y: 155 },
  { x: "Oct", y: 172 },
  { x: "Nov", y: 190 },
  { x: "Dic", y: 210 },
];

const SAMPLE_PROVINCES = [
  { code: "AR-C", name: "CABA" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Córdoba" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPrimitivasPage() {
  await requireUserOrRedirect();

  return (
    <main className="min-h-screen bg-[var(--color-ln-stripe)] p-6">
      <div className="max-w-5xl mx-auto space-y-8 pt-4 pb-12">
        {/* Título */}
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-ln-ink)]">
            Primitivas de dashboards (E1)
          </h1>
          <p className="text-sm text-[var(--color-ln-mute)]">
            Showcase de QA visual para las 5 primitivas del Chunk E1. Datos sintéticos — reemplazar
            con datos reales en las rutas de dashboard (E2–E5).
          </p>
        </header>

        {/* ------------------------------------------------------------------ */}
        {/* 1. MetricCard */}
        {/* ------------------------------------------------------------------ */}
        <Panel aria-labelledby="metric-card-heading">
          <PanelHeader title={<span id="metric-card-heading">MetricCard — KPI tile</span>} />
          <PanelBody>
            <p className="text-xs text-[var(--color-ln-mute)] mb-4">
              Tres tonos: neutral / warning / danger. Con delta y subline opcionales.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricCard
                label="Mascotas registradas"
                value="12,480"
                unit="mascotas"
                subline="Actualizado hoy"
                tone="neutral"
              />
              <MetricCard
                label="Vacunas vencidas"
                value="348"
                unit="vencidas"
                delta="+12% vs mes anterior"
                tone="warning"
                icon="alert-circle"
              />
              <MetricCard
                label="Denuncias abiertas"
                value="27"
                unit="denuncias"
                delta="+5 esta semana"
                subline="3 requieren intervención"
                tone="danger"
                icon="alert-triangle"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* ------------------------------------------------------------------ */}
        {/* 2. MapChoropleth */}
        {/* ------------------------------------------------------------------ */}
        <Panel aria-labelledby="map-choropleth-heading">
          <PanelHeader
            title={
              <span id="map-choropleth-heading">
                MapChoropleth — Mapa coroplético OSM / MapLibre
              </span>
            }
          />
          <PanelBody>
            <p className="text-xs text-[var(--color-ln-mute)] mb-4">
              3 provincias de muestra (CABA, Buenos Aires, Córdoba). Tiles vía demotiles MapLibre
              (v1 placeholder — E-D1). GeoJSON en{" "}
              <code className="font-mono text-xs bg-[var(--color-ln-stripe)] px-1 rounded">
                /geo/ar-provinces.geojson
              </code>
              .
            </p>
            {/* MapChoropleth es client component — Suspense necesario en el server component padre. */}
            <Suspense fallback={null}>
              <MapChoropleth
                data={SAMPLE_MAP_DATA}
                colorScale={["#bfdbfe", "#1e40af"]}
                height={400}
                fallbackTableLabel="Mascotas registradas por provincia"
              />
            </Suspense>
          </PanelBody>
        </Panel>

        {/* ------------------------------------------------------------------ */}
        {/* 3. TimeSeriesChart */}
        {/* ------------------------------------------------------------------ */}
        <Panel aria-labelledby="timeseries-heading">
          <PanelHeader
            title={<span id="timeseries-heading">TimeSeriesChart — Serie temporal recharts</span>}
          />
          <PanelBody>
            <p className="text-xs text-[var(--color-ln-mute)] mb-4">
              12 puntos mensuales sintéticos. Variante &ldquo;area&rdquo;. Animaciones respetan
              prefers-reduced-motion.
            </p>
            <Suspense fallback={null}>
              <TimeSeriesChart
                data={SAMPLE_TIMESERIES}
                seriesLabel="Denuncias registradas"
                yLabel="Denuncias"
                variant="area"
                strokeColor="#1e40af"
                height={300}
                fallbackTableLabel="Denuncias registradas por mes"
              />
            </Suspense>
          </PanelBody>
        </Panel>

        {/* ------------------------------------------------------------------ */}
        {/* 4. JurisdictionSwitcher */}
        {/* ------------------------------------------------------------------ */}
        <Panel aria-labelledby="jurisdiction-heading">
          <PanelHeader
            title={
              <span id="jurisdiction-heading">
                JurisdictionSwitcher — Selector provincia → localidad
              </span>
            }
          />
          <PanelBody>
            <p className="text-xs text-[var(--color-ln-mute)] mb-4">
              3 provincias de muestra. Seleccionar una provincia limpia la localidad. Cambios via
              router.replace preservando otros searchParams.
            </p>
            <Suspense fallback={null}>
              <JurisdictionSwitcher allowedProvinces={SAMPLE_PROVINCES} localities={[]} />
            </Suspense>
          </PanelBody>
        </Panel>

        {/* ------------------------------------------------------------------ */}
        {/* 5. PeriodPicker */}
        {/* ------------------------------------------------------------------ */}
        <Panel aria-labelledby="period-picker-heading">
          <PanelHeader
            title={<span id="period-picker-heading">PeriodPicker — Selector de período</span>}
          />
          <PanelBody>
            <p className="text-xs text-[var(--color-ln-mute)] mb-4">
              Chips de presets (7d / 30d / 90d / Año en curso) + rango personalizado vía
              DateRangePicker. Activo por defecto: 30d.
            </p>
            <Suspense fallback={null}>
              <PeriodPicker defaultPreset="30d" />
            </Suspense>
          </PanelBody>
        </Panel>
      </div>
    </main>
  );
}
