# 04 — Govt dashboards · design spec (handoff)

> Dashboards para los tres audiences gubernamentales identificados en AGENTS.md: **sanitary authority** (operacional, ciudad/comuna), **public-health analyst** (estratégico, provincia/nacional), **animal-welfare officer** (case-driven, jurisdicción asignada). Proyecciones sobre el event log + casos. No tablas nuevas.

## Audiencias y journeys

| Audiencia | `profiles.role` | Scope | Journey típico |
|---|---|---|---|
| **Sanitary authority** | `govt` + jurisdicción asignada | Localidad / comuna / provincia operativa | Mira el dashboard cada mañana → ve outbreak signals nuevos → drill-down a casos abiertos → asigna recursos |
| **Public-health analyst** | `govt` o `admin` con `analytics.read` | Provincia / nacional | Mira reportes mensuales/trimestrales → exporta dataset a CSV → compara series temporales |
| **Welfare officer** | `govt` con `welfare.investigate` | Jurisdicción asignada | Recibe asignación de `welfare_denuncia` → investiga → registra eventos → cierra el caso |
| **Admin universal** | `admin` (institutional) | Sin restricción | Usa los 3 dashboards en modo "universal" — para auditoría cross-jurisdicción |

## Sitemap

```
/gob                                — dashboard home (router por rol)
/gob/vigilancia                     — sanitary authority dashboard
/gob/vigilancia/brotes              — drill-down outbreak signals (NUEVO)
/gob/vigilancia/zoonosis            — surveillance reportable diseases (NUEVO)
/gob/perdidas                       — episodios lost en jurisdicción
/gob/maltrato                       — welfare officer queue
/gob/maltrato/[id]                  — case detail welfare
/gob/disputas                       — custody disputes
/gob/disputas/[disputeToken]        — case detail
/gob/casos                          — vista unificada de casos
/gob/organizaciones                 — refugios/clinics en jurisdicción
/gob/usuarios                       — owners + vets en jurisdicción
/gob/reglas                         — business rules locales
/gob/servicios                      — services ofrecidos (vacunación pública, etc.)
/gob/historial                      — audit log scope-bound
/gob/analytics                      — reportes mensuales/trimestrales (NUEVO)
/gob/analytics/export               — descarga CSV con dataset filtrado (NUEVO)

/admin/casos                        — equivalente universal scope (existe)
/admin/vigilancia                   — equivalente universal scope (NUEVO)
/admin/analytics                    — equivalente universal scope (NUEVO)
```

---

## A. Componentes nuevos

### A.1 `<MetricCard>` — número + delta + sparkline

#### Descripción

Card de métrica para dashboards. Muestra valor actual + delta vs período anterior + sparkline opcional.

#### Variants

| Variant | Use when |
|---|---|
| `default` | Métrica normal (gris) |
| `success` | Métrica positiva trending up (reportes resueltos, vacunaciones) |
| `warning` | Métrica que requiere atención (casos abiertos >X días) |
| `danger` | Métrica crítica (brotes activos, casos urgentes) |

#### Layout

```
[Card padding-6]
  [Label: 13px medium, text-muted]
  [Value: 32px bold, primary color]
  [Delta row:
    [Arrow up/down: text-success/danger]
    [+12 (+8.3%)] vs período anterior
  ]
  [Sparkline 100×24px, 7 puntos last 7 days/months]
```

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | required | "Casos abiertos esta semana" |
| `value` | `number \| string` | required | "127" o "127 / 300" para fractions |
| `delta` | `{ absolute: number; percentage?: number; direction: 'up' \| 'down' \| 'flat' }` | optional | |
| `deltaIntent` | `'positive' \| 'negative' \| 'neutral'` | `'neutral'` | "up" puede ser bueno o malo según contexto |
| `sparkline` | `number[]` | optional | 7-30 datapoints |
| `variant` | `'default' \| 'success' \| 'warning' \| 'danger'` | `'default'` | |
| `href` | `string` | optional | Click drilldown |

#### Estados

| State | UI |
|---|---|
| Default | Card normal con valor |
| Loading | Skeleton 60×24 + 100×40 + 100×16 |
| Empty (value 0) | "0" + helper "Nada que reportar — buen signo" |
| Clickable | Hover: border accent + cursor pointer |
| Error data | "—" + tooltip "No se pudo cargar" |

#### Accesibilidad

- Card es `<a>` o `<article>` según `href` exista.
- Label conectado al valor via `aria-describedby`.
- Sparkline tiene `role="img"` con `<title>` "Tendencia últimos 7 días: subió 12%".

---

### A.2 `<MapChoropleth>` — mapa con jurisdicciones coloreadas

#### Descripción

Mapa de Argentina (provincias) o de una provincia (localidades) con choropleth según métrica seleccionada. Usa `maplibre-gl` con tiles ARSAT + GeoJSON de INDEC.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `level` | `'province' \| 'locality'` | required | Granularidad |
| `parent` | `string` | optional | Si `level=locality`, requiere province |
| `metric` | `'cases_open' \| 'cases_per_capita' \| 'outbreak_signals' \| 'lost_episodes' \| 'welfare_denuncias'` | required | Qué colorear |
| `period` | `'7d' \| '30d' \| '90d' \| 'all'` | `'30d'` | |
| `onSelect` | `(jurisdictionId: string) => void` | optional | Click en una jurisdicción |

#### Estados

| State | UI |
|---|---|
| Loading tiles | Skeleton container con spinner |
| Loaded | Mapa con escala de color + legend |
| No data en jurisdicción | Color neutro (gris claro), tooltip "Sin datos" |
| Selected | Highlight border 3px celeste |

#### Color scale

| Métrica | Scale |
|---|---|
| `cases_open` | YlOrRd, 0 → cantidad |
| `cases_per_capita` | YlOrRd normalizado por populación |
| `outbreak_signals` | Purple, conteo de signals activos |
| `welfare_denuncias` | Red, abiertas |

#### Accesibilidad

- Mapa tiene `role="img"` con `<title>` y `<desc>` que resumen los hotspots.
- Alternativa textual: `<details><summary>Ver datos en tabla</summary></details>` con table escondida que screen readers pueden leer.

---

### A.3 `<CaseListItem>` — item en feeds de casos

#### Layout

```
[Row]
  [CaseBadge publicCode={code} caseKind={kind} status={status} size="sm"/]  ← existing component
  [Subject line:
    Subject pet name OR welfare report code OR transfer description
  ]
  [Meta line: jurisdicción · opened {relativeDate} · last activity {relativeDate}]
  [Severity pill if applicable]
  [Right: chevron-right + N events]
```

### A.4 `<TimeSeriesChart>` — line/area chart

#### Descripción

Chart de series temporales. Recharts-based. Maximum 4 series, leyenda inline, hover con tooltip.

#### Props

| Prop | Type | Description |
|---|---|---|
| `data` | `Array<{ date: Date; [series: string]: number }>` | datapoints |
| `series` | `Array<{ key: string; label: string; color: 'primary' \| 'celeste' \| 'danger' \| 'success' }>` | hasta 4 |
| `type` | `'line' \| 'area' \| 'bar'` | |
| `xAxisFormat` | `'day' \| 'week' \| 'month'` | |
| `yAxisLabel` | `string` | optional |
| `height` | `number` | 280 default |

#### Accesibilidad

Misma estrategia que MapChoropleth: `<details><summary>Ver datos</summary><table>` con la tabla numérica.

### A.5 `<JurisdictionSwitcher>` — selector de jurisdicción

Para govt con múltiples `govt_assignments`. Combobox que cambia el query param `?jurisdiction=`.

```
[Dropdown header]
  [Avatar: escudo localidad]
  [Locality, Province]
  [chevron-down]
[Items: lista de assignments del user + "Vista universal" si role=admin]
```

---

## B. Pantallas por audiencia

### B.1 `/gob` — dashboard home (router)

Server component que detecta el rol + capabilities del govt y redirige a la pestaña principal correspondiente:

```ts
if (user.role === 'admin') redirect('/admin');
if (hasCapability('welfare.investigate')) redirect('/gob/maltrato');
if (hasCapability('surveillance.read')) redirect('/gob/vigilancia');
if (hasCapability('analytics.read')) redirect('/gob/analytics');
return <DefaultGobHome />;
```

`<DefaultGobHome>` muestra cards link a cada sección con preview de un número.

### B.2 `/gob/vigilancia` — sanitary authority dashboard

```
<main>
  <header>
    <h1>Vigilancia sanitaria</h1>
    <JurisdictionSwitcher />
    <PeriodPicker /> {/* 7d / 30d / 90d */}
  </header>

  {/* Top metrics row */}
  <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <MetricCard
      label="Brotes activos"
      value={outbreaks.activeCount}
      delta={outbreaks.deltaVsPrev}
      deltaIntent="negative"
      variant={outbreaks.activeCount > 0 ? 'danger' : 'success'}
      href="/gob/vigilancia/brotes"
    />
    <MetricCard
      label="Observaciones rábicas en curso"
      value={rabies.activeCount}
      sparkline={rabies.last30days}
      variant="warning"
      href="/gob/vigilancia/rabia"
    />
    <MetricCard
      label="Pets registrados hoy"
      value={petsRegisteredToday}
      delta={...}
      deltaIntent="positive"
    />
    <MetricCard
      label="Vacunaciones esta semana"
      value={vaccinationsThisWeek}
      sparkline={vaccinations.last7}
      variant="success"
    />
  </section>

  {/* Map + outbreak signals */}
  <section className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
    <Panel>
      <PanelHeader><h2>Mapa de la jurisdicción</h2></PanelHeader>
      <PanelBody>
        <MapChoropleth level="locality" parent={province} metric="cases_open" period={period} />
      </PanelBody>
    </Panel>

    <Panel>
      <PanelHeader><h2>Outbreak signals recientes</h2></PanelHeader>
      <PanelBody>
        {outbreakSignals.length === 0 ? (
          <EmptyState icon="shield-check" title="Sin signals activos" description="Todo bajo control." />
        ) : (
          <ul role="list">{outbreakSignals.slice(0, 5).map(s => <OutbreakSignalRow signal={s} />)}</ul>
        )}
        <Link href="/gob/vigilancia/brotes">Ver todos →</Link>
      </PanelBody>
    </Panel>
  </section>

  {/* Reportable diseases */}
  <Panel>
    <PanelHeader>
      <h2>Enfermedades reportables — últimos 30 días</h2>
      <Button variant="secondary" size="sm" href="/gob/vigilancia/zoonosis">Ver detalle</Button>
    </PanelHeader>
    <PanelBody>
      <TimeSeriesChart
        data={zoonosisData}
        series={[
          { key: 'rabia', label: 'Rabia (sospechas)', color: 'danger' },
          { key: 'parvo', label: 'Parvovirus', color: 'primary' },
          { key: 'moquillo', label: 'Moquillo', color: 'celeste' },
          { key: 'leptospirosis', label: 'Leptospirosis', color: 'warning' },
        ]}
        type="line"
        xAxisFormat="day"
      />
    </PanelBody>
  </Panel>

  {/* Active rabies observations table */}
  <Panel>
    <PanelHeader>
      <h2>Observaciones rábicas en curso</h2>
    </PanelHeader>
    <PanelBody>
      <Table>
        {/* pet, mordedura date, day N of 10, refugio/owner, próximo vencimiento, actions */}
      </Table>
    </PanelBody>
  </Panel>
</main>
```

### B.3 `/gob/perdidas` — lost pet episodes

```
<main>
  <header>
    <h1>Mascotas perdidas</h1>
    <JurisdictionSwitcher />
  </header>

  <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <MetricCard label="Activos" value={activeCount} variant="warning" />
    <MetricCard label="Recuperados este mes" value={recoveredMonth} variant="success" />
    <MetricCard label="Antigüedad promedio" value={`${avgDays} días`} />
  </section>

  <Panel>
    <PanelHeader>
      <h2>Episodios activos en mapa</h2>
    </PanelHeader>
    <PanelBody>
      <MapChoropleth level="locality" metric="lost_episodes" period="30d" />
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader>
      <h2>Listado</h2>
      <TableFilters>
        <Field><Select name="status">activos / recuperados / cerrados</Select></Field>
        <Field><Select name="species">cualquier / dog / cat</Select></Field>
        <Field><Input name="search" placeholder="Buscar por chip o token..." /></Field>
      </TableFilters>
    </PanelHeader>
    <PanelBody>
      <Table responsive>
        {/* foto, name, species, locality, días perdida, jurisdicción del refugio matched, actions ("Ver caso") */}
      </Table>
    </PanelBody>
  </Panel>
</main>
```

### B.4 `/gob/maltrato` — welfare officer queue

```
<main>
  <header>
    <h1>Denuncias de maltrato</h1>
    <JurisdictionSwitcher />
  </header>

  <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
    <MetricCard label="Sin asignar" value={unassigned} variant="warning" href="?filter=unassigned" />
    <MetricCard label="Asignadas a mí" value={mine} href="?filter=mine" />
    <MetricCard label="En investigación" value={investigating} />
    <MetricCard label="Cerradas este mes" value={closedMonth} variant="success" />
  </section>

  <Tabs>
    <Tab href="?queue=urgent">Urgentes ({urgentCount})</Tab>
    <Tab href="?queue=mine">Mis casos ({mine})</Tab>
    <Tab href="?queue=all">Todos</Tab>
    <Tab href="?queue=overdue">Vencidos &gt;90d ({overdue})</Tab>
  </Tabs>

  <Panel>
    <PanelBody>
      <ul role="list">
        {denuncias.map(d => (
          <WelfareDenunciaRow
            key={d.id}
            denuncia={d}
            assignedTo={d.assignedTo}
            severity={d.severity}
            isAnonymous={!d.reporterId}
          />
        ))}
      </ul>
      <Pagination />
    </PanelBody>
  </Panel>
</main>
```

`<WelfareDenunciaRow>`:

```
[Row]
  [CaseBadge code={d.publicCode} kind="welfare_denuncia" status={d.status} size="sm"/]
  [Severity pill: low / medium / high / urgent]
  [Subject: kind + brief description from payload]
  [Locality + date]
  [Right: assignedTo avatar + chevron]
```

### B.5 `/gob/maltrato/[id]` — case detail

```
<main>
  <Breadcrumb items={[{ label: "Denuncias", href: "/gob/maltrato" }, { label: d.publicCode }]} />

  <header>
    <h1>{caseKindLabel(d.caseKind)}</h1>
    <CaseBadge .../>
  </header>

  <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
    <div>
      <Panel>
        <PanelHeader><h2>Resumen de la denuncia</h2></PanelHeader>
        <PanelBody>
          <dl>
            <dt>Tipo</dt><dd>{d.kind}</dd>
            <dt>Severidad</dt><dd>{d.severity}</dd>
            <dt>Reportada</dt><dd>{formatDate(d.reportedAt)}</dd>
            <dt>Reporter</dt><dd>{d.reporterId ? `{userName}` : 'Anónimo'}</dd>
            <dt>Ubicación</dt><dd>{d.locality}, {d.province}</dd>
          </dl>
          <p>{d.description}</p>
          {d.attachments.length > 0 && <AttachmentGallery items={d.attachments} />}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader><h2>Eventos del caso</h2></PanelHeader>
        <PanelBody>
          <Timeline events={d.events} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader><h2>Acciones</h2></PanelHeader>
        <PanelBody>
          <Button variant="primary">Registrar visita</Button>
          <Button variant="secondary">Pedir info al reporter</Button>
          <Button variant="danger">Marcar como falsa denuncia</Button>
          <Button variant="success">Cerrar caso</Button>
        </PanelBody>
      </Panel>
    </div>

    <aside>
      <Panel>
        <PanelHeader><h2>Asignación</h2></PanelHeader>
        <PanelBody>
          {d.assignedTo ? (
            <UserCard user={d.assignedTo} />
          ) : (
            <Button variant="primary">Asignármela</Button>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader><h2>Mascota asociada</h2></PanelHeader>
        <PanelBody>
          {d.petId ? <PetIdentityRow pet={d.pet} /> : <p>Sin mascota registrada vinculada</p>}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader><h2>Normativa aplicable</h2></PanelHeader>
        <PanelBody>
          [Lista de leyes aplicables computadas via lib/case-normatives.ts]
          <Link href="/gob/normativa/14346">Ley 14.346 →</Link>
        </PanelBody>
      </Panel>
    </aside>
  </div>
</main>
```

### B.6 `/gob/analytics` — analyst dashboard (NUEVO)

```
<main>
  <header>
    <h1>Reportes y analytics</h1>
    <PeriodPicker options={['7d','30d','90d','12m','custom']} />
  </header>

  <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard label="Pets totales registrados" value={total} delta={...} sparkline={...} />
    <MetricCard label="Tasa de adopción mensual" value={`${rate}%`} delta={...} />
    <MetricCard label="Vacunación antirrábica" value={`${ratePct}%`} variant={ratePct < 70 ? 'warning' : 'success'} />
    <MetricCard label="Custody disputes activas" value={disputes} variant="warning" />
  </section>

  <Panel>
    <PanelHeader>
      <h2>Acquisition method (Ley 25.326 trend)</h2>
      <Button variant="secondary" size="sm" iconLeft="download">Exportar CSV</Button>
    </PanelHeader>
    <PanelBody>
      <TimeSeriesChart
        data={acquisitionData}
        series={[
          { key: 'adopted', label: 'Adoptado', color: 'success' },
          { key: 'purchased', label: 'Comprado', color: 'primary' },
          { key: 'found_stray', label: 'Rescatado', color: 'celeste' },
          { key: 'born_in_litter', label: 'Nacido en hogar', color: 'warning' },
        ]}
        type="area"
        xAxisFormat="month"
      />
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader><h2>Mapa de población estimada</h2></PanelHeader>
    <PanelBody>
      <MapChoropleth level="locality" metric="pets_per_capita" />
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader><h2>Top causas de muerte (death_recorded)</h2></PanelHeader>
    <PanelBody>
      <BarChart data={deathCauses} />
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader><h2>Brotes históricos</h2></PanelHeader>
    <PanelBody>
      <Table>
        {/* Disease, locality, peak signal date, signals count, duration, status */}
      </Table>
    </PanelBody>
  </Panel>
</main>
```

### B.7 `/gob/analytics/export` — descarga CSV

Form para configurar export. Filtros: período, jurisdicción, tipos de evento, formato (CSV / JSON / Parquet).

```
<FormPage title="Exportar dataset">
  <FormSection title="Período">
    <DateRangePicker name="period" />
  </FormSection>
  <FormSection title="Jurisdicción">
    <JurisdictionSelect name="jurisdiction" multi />
  </FormSection>
  <FormSection title="Datos">
    <CheckboxGroup name="includes">
      <Checkbox value="pets">Mascotas (anonimizado)</Checkbox>
      <Checkbox value="events">Eventos (libreta sanitaria)</Checkbox>
      <Checkbox value="cases">Casos (welfare, disputas, brotes)</Checkbox>
      <Checkbox value="organizations">Refugios/clínicas</Checkbox>
    </CheckboxGroup>
  </FormSection>
  <FormSection title="Formato">
    <RadioGroup name="format">
      <Radio value="csv">CSV (Excel-compatible)</Radio>
      <Radio value="json">JSON (NDJSON)</Radio>
      <Radio value="parquet">Parquet (analytics-ready)</Radio>
    </RadioGroup>
  </FormSection>
  <Alert variant="info">
    El dataset queda anonimizado según Ley 25.326. No incluye nombres, DNI, emails ni teléfonos.
  </Alert>
  <FormPage.Actions>
    <Button variant="primary" type="submit" iconLeft="download">Generar export</Button>
  </FormPage.Actions>
</FormPage>
```

Post-submit: generación async via server action que escribe el archivo a Supabase Storage privado y dispara email con signed URL.

---

## C. Patrones cross-dashboard

### C.1 Empty states

| Surface | EmptyState |
|---|---|
| `/gob/vigilancia` sin signals | "Sin signals activos. Todo bajo control en tu jurisdicción." |
| `/gob/perdidas` sin episodios | "No hay episodios activos. Cuando alguien marque una mascota perdida en tu zona, aparece acá." |
| `/gob/maltrato` queue vacía | "Sin denuncias pendientes. Buen momento para repasar las cerradas." |
| `/gob/disputas` sin disputas | "Sin disputas de custodia en tu jurisdicción." |
| `/gob/analytics` sin permisos | "Tu rol no tiene acceso a analytics. Pedile al admin que te asigne la capability." |

### C.2 Period picker

Componente compartido. Default 30d. Opciones: 7d, 30d, 90d, 12m, custom (range picker). Persiste en searchParams.

### C.3 Drill-down patterns

Cada métrica en el dashboard tiene `href` a la lista filtrada correspondiente:

| MetricCard | Drill-down |
|---|---|
| "Brotes activos" | `/gob/vigilancia/brotes?status=active` |
| "Observaciones rábicas" | `/admin/observaciones?status=active` |
| "Sin asignar" (welfare) | `/gob/maltrato?queue=unassigned` |
| "Custody disputes" | `/gob/disputas?status=active` |

---

## D. Permisos y scope

| Capability | Quién la tiene | Qué desbloquea |
|---|---|---|
| `surveillance.read` | govt + admin | `/gob/vigilancia`, `/gob/vigilancia/brotes`, `/gob/vigilancia/zoonosis` |
| `welfare.investigate` | govt asignado + admin | `/gob/maltrato`, `/gob/maltrato/[id]`, registrar eventos |
| `disputes.manage` | govt asignado + admin | `/gob/disputas`, raise/resolve |
| `analytics.read` | govt analyst + admin | `/gob/analytics`, `/gob/analytics/export` |
| `rules.manage` | govt admin + admin | `/gob/reglas` |
| `audit.read` | admin only | `/gob/historial` |

Scope siempre filtrado por `govt_assignments` del user (province + locality). Admin ve universal.

---

## E. Accesibilidad

- Mapas con alternativa textual (tabla escondida via `<details>`).
- Charts idem.
- Periodpicker tiene `aria-label` por opción.
- Tablas son `<table>` semántico con `<thead><th scope="col">`.
- Empty states con CTA específico (DP9).
- Color en métricas siempre acompañado de ícono o label (no solo color).

---

## F. Resumen archivos a crear

| Archivo | Propósito |
|---|---|
| `components/poncho/MetricCard.tsx` | A.1 |
| `components/poncho/MapChoropleth.tsx` | A.2 |
| `components/poncho/CaseListItem.tsx` | A.3 |
| `components/poncho/TimeSeriesChart.tsx` | A.4 |
| `components/poncho/JurisdictionSwitcher.tsx` | A.5 |
| `components/poncho/PeriodPicker.tsx` | C.2 |
| `app/gob/vigilancia/page.tsx` | B.2 (existe — extender) |
| `app/gob/vigilancia/brotes/page.tsx` | B.2 sub |
| `app/gob/vigilancia/zoonosis/page.tsx` | B.2 sub |
| `app/gob/perdidas/page.tsx` | B.3 (existe — extender) |
| `app/gob/maltrato/WelfareDenunciaRow.tsx` | B.4 |
| `app/gob/maltrato/[id]/Timeline.tsx` | B.5 |
| `app/gob/analytics/page.tsx` | B.6 |
| `app/gob/analytics/export/page.tsx` | B.7 |
| `app/admin/vigilancia/page.tsx` | universal scope |
| `app/admin/analytics/page.tsx` | universal scope |
