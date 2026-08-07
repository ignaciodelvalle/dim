# Read-only audit — `/gob` + `/admin` screens

**Ground truth:** `integration/all-20260703` · `da5a0fcf`

## Route inventory (`rg --files app/gob app/admin -g 'page.tsx'`)

### `/gob` (42)

| Route | File |
|---|---|
| `/gob` | `app/gob/page.tsx` |
| `/gob/panorama` | `app/gob/panorama/page.tsx` |
| `/gob/vigilancia` | `app/gob/vigilancia/page.tsx` |
| `/gob/vigilancia/zoonosis` | `app/gob/vigilancia/zoonosis/page.tsx` |
| `/gob/vigilancia/brotes` | `app/gob/vigilancia/brotes/page.tsx` |
| `/gob/vigilancia/investigaciones` | `app/gob/vigilancia/investigaciones/page.tsx` |
| `/gob/vigilancia/investigaciones/nuevo` | `app/gob/vigilancia/investigaciones/nuevo/page.tsx` |
| `/gob/vigilancia/investigaciones/[caseCode]` | `app/gob/vigilancia/investigaciones/[caseCode]/page.tsx` |
| `/gob/outbox` | `app/gob/outbox/page.tsx` |
| `/gob/programa` | `app/gob/programa/page.tsx` |
| `/gob/censo` | `app/gob/censo/page.tsx` |
| `/gob/usuarios` | `app/gob/usuarios/page.tsx` |
| `/gob/moderacion` | `app/gob/moderacion/page.tsx` |
| `/gob/moderacion/[id]` | `app/gob/moderacion/[id]/page.tsx` |
| `/gob/servicios` | `app/gob/servicios/page.tsx` |
| `/gob/servicios/[offeringToken]` | `app/gob/servicios/[offeringToken]/page.tsx` |
| `/gob/disputas` | `app/gob/disputas/page.tsx` |
| `/gob/disputas/[disputeToken]` | `app/gob/disputas/[disputeToken]/page.tsx` |
| `/gob/maltrato` | `app/gob/maltrato/page.tsx` |
| `/gob/maltrato/[id]` | `app/gob/maltrato/[id]/page.tsx` |
| `/gob/perdidas` | `app/gob/perdidas/page.tsx` |
| `/gob/poblacion` | `app/gob/poblacion/page.tsx` |
| `/gob/mortalidad` | `app/gob/mortalidad/page.tsx` |
| `/gob/analytics` | `app/gob/analytics/page.tsx` |
| `/gob/analytics/export` | `app/gob/analytics/export/page.tsx` |
| `/gob/outreach` | `app/gob/outreach/page.tsx` |
| `/gob/organizaciones` | `app/gob/organizaciones/page.tsx` |
| `/gob/cola` | `app/gob/cola/page.tsx` |
| `/gob/cola/[publicToken]` | `app/gob/cola/[publicToken]/page.tsx` |
| `/gob/decomisos` | `app/gob/decomisos/page.tsx` |
| `/gob/decomisos/nuevo` | `app/gob/decomisos/nuevo/page.tsx` |
| `/gob/decomisos/[publicCode]` | `app/gob/decomisos/[publicCode]/page.tsx` |
| `/gob/casos` | `app/gob/casos/page.tsx` |
| `/gob/casos/[publicCode]` | `app/gob/casos/[publicCode]/page.tsx` |
| `/gob/campanas` | `app/gob/campanas/page.tsx` |
| `/gob/historial` | `app/gob/historial/page.tsx` |
| `/gob/adopciones` | `app/gob/adopciones/page.tsx` |
| `/gob/reglas` | `app/gob/reglas/page.tsx` |
| `/gob/reglas/[country]/[province]/[locality]` | `app/gob/reglas/[country]/[province]/[locality]/page.tsx` |
| `/gob/reglas/.../nueva` | `app/gob/reglas/[country]/[province]/[locality]/nueva/page.tsx` |
| `/gob/reglas/.../editar/[ruleId]` | `app/gob/reglas/[country]/[province]/[locality]/editar/[ruleId]/page.tsx` |
| `/gob/sistema` | `app/gob/sistema/page.tsx` |

### `/admin` (38)

| Route | File |
|---|---|
| `/admin` | `app/admin/page.tsx` |
| `/admin/panorama` | `app/admin/panorama/page.tsx` |
| `/admin/alertas` | `app/admin/alertas/page.tsx` |
| `/admin/moderacion` | `app/admin/moderacion/page.tsx` |
| `/admin/moderacion/[id]` | `app/admin/moderacion/[id]/page.tsx` |
| `/admin/auditoria` | `app/admin/auditoria/page.tsx` |
| `/admin/observaciones` | `app/admin/observaciones/page.tsx` |
| `/admin/observaciones/[publicToken]` | `app/admin/observaciones/[publicToken]/page.tsx` |
| `/admin/observaciones/.../microchip/reemplazar` | `app/admin/observaciones/[publicToken]/microchip/reemplazar/page.tsx` |
| `/admin/poblacion` | `app/admin/poblacion/page.tsx` |
| `/admin/sistema` | `app/admin/sistema/page.tsx` |
| `/admin/sistema/crons` | `app/admin/sistema/crons/page.tsx` |
| `/admin/programa` | `app/admin/programa/page.tsx` |
| `/admin/censo` | `app/admin/censo/page.tsx` |
| `/admin/outbox` | `app/admin/outbox/page.tsx` |
| `/admin/outbox/[id]` | `app/admin/outbox/[id]/page.tsx` |
| `/admin/admins` | `app/admin/admins/page.tsx` |
| `/admin/admins/new` | `app/admin/admins/new/page.tsx` |
| `/admin/admins/[userId]` | `app/admin/admins/[userId]/page.tsx` |
| `/admin/govts` | `app/admin/govts/page.tsx` |
| `/admin/govts/new` | `app/admin/govts/new/page.tsx` |
| `/admin/govts/[userId]` | `app/admin/govts/[userId]/page.tsx` |
| `/admin/inteligencia` | `app/admin/inteligencia/page.tsx` |
| `/admin/acerca/integracion-miarg` | `app/admin/acerca/integracion-miarg/page.tsx` |
| `/admin/libro` | `app/admin/libro/page.tsx` |
| `/admin/casos` | `app/admin/casos/page.tsx` |
| `/admin/usuarios` | re-export → `app/gob/usuarios/page.tsx` |
| `/admin/organizaciones` | re-export → `app/gob/organizaciones/page.tsx` |
| `/admin/reglas` (+ nested) | re-export → `app/gob/reglas/*` |
| `/admin/servicios` (+ `[offeringToken]`) | mirrors gob servicios |
| `/admin/cola` (+ `[publicToken]`) | mirrors gob cola |
| `/admin/historial` | `app/admin/historial/page.tsx` (self-scoped audit) |
| `/admin/adopciones` | `app/admin/adopciones/page.tsx` |

---

## Per-screen analysis

### `/gob` — Panel de jurisdicción (`app/gob/page.tsx`)

**A. Content**
1. **Decision:** Where should I drill first — approvals backlog, zoonosis risk, compliance gaps, or lost pets?
2. **Missing:** No prioritized breach queue (rabies >10d links to `/admin/observaciones` at `app/gob/vigilancia/page.tsx:407`, not gob); no campaign performance; no outreach action lists; `fetchOpenWelfareReportsCount` count only — no severity/SLA (`app/gob/page.tsx:143`).
3. **Excess:** "Vigilancia" aside card is link-only copy (`app/gob/page.tsx:607-623`); duplicates zoonosis KPIs already in strip (`app/gob/page.tsx:328-346`); mortality mini-card duplicates `/gob/mortalidad` (`app/gob/page.tsx:352-385`).
4. **Spine:** Strong — `vaccination_administered`, `sterilization_performed`, `incident_reported`, `death_recorded`, `outbreak_signal`, `disease_reported`, `dangerous_breed_attested`, `pet_registered` via `lib/analytics/govt-home-kpis.ts`, `compliance-metrics.ts`, `mortality-metrics.ts` (`app/gob/page.tsx:20-50`).
5. **Format:** Rabies tile names double denominator (`app/gob/page.tsx:262-272`) — good; bites rate caveat admits 0 without census (`app/gob/page.tsx:325`); PPP uses microchip target for tone (`app/gob/page.tsx:416`) — wrong target.

**B. Visualization**
1. **Forms:** `OpKpi`×8 + sparklines (`app/gob/page.tsx:252-346`, `395-434`); `TimeSeriesChartDynamic` area (`app/gob/page.tsx:463-468`); `OpCard` lists (`app/gob/page.tsx:478-689`); `JurisdictionSwitcher` (`app/gob/page.tsx:245`).
2. **Fitness:** Bites trend = correct line/area; KPI strip = correct for triage; aside placeholders = decoration.
3. **Honesty:** Bites trend shows suppressed periods (`app/gob/page.tsx:448-454`); rabies KPI has registry+census denominators (`app/gob/page.tsx:262-272`).
4. **Panorama:** Same KPI fetchers via `loadCachedPanoramaKpis` on panorama — label collision on rabies is a known cross-surface issue (interacts with analytics tile).
5. **Improvement:** Replace empty "Vigilancia" card with top-3 live breaches (rabies overdue, ENO SLA, open outbreaks) — **mechanical**.

---

### `/gob/panorama` & `/admin/panorama` (`app/gob/panorama/page.tsx`, `app/admin/panorama/page.tsx`)

**A. Content**
1. **Decision:** Where is the territorial situation worsening, and which layer (pérdidas, denuncias, etc.) drives it?
2. **Missing:** Preset vistas don't surface campaign or outreach layers; degraded state hides KPIs silently (`app/gob/panorama/page.tsx:166`, `degradedPanoramaKpis()`).
3. **Excess:** Default layer `perdidas` may not match operator's urgent question (`app/gob/panorama/page.tsx:121-122`).
4. **Spine:** Layer features from `getLayerFeatures` over `pet_events` / welfare projections (`src/modules/panorama/`); KPIs reuse dashboard fetchers (`app/gob/panorama/page.tsx:157-164`).
5. **Format:** Scope label differs admin vs govt (`app/admin/panorama/page.tsx:171` vs `app/gob/panorama/page.tsx:173`).

**B. Visualization**
1. **Forms:** `PanoramaShell` — map, layer console, KPI strip, time scrubber (`app/gob/panorama/page.tsx:172-186`).
2. **Fitness:** Map + scrubber = correct for situational awareness; k-anon hatch on layers = correct.
3. **Honesty:** `suppressedCount`, `truncated` passed through (`app/gob/panorama/page.tsx:176-177`); 9s budget degrades honestly (`app/gob/panorama/page.tsx:35-36`, `149-151`).
4. **Panorama:** Reference surface; admin suppresses duplicate demo banner (`app/admin/panorama/page.tsx:183`).
5. **Improvement:** Default preset should follow role (govt jurisdiction → local outbreaks, not national perdidas) — **product-decision**.

---

### `/gob/vigilancia` (`app/gob/vigilancia/page.tsx`)

**A. Content**
1. **Decision:** Which zoonosis signals need investigation or legal follow-up now?
2. **Missing:** No direct link from map cell to case list; `petsRegisteredToday` is `pets.created_at` not events (`lib/analytics/govt-dashboards.ts:801`) — misleading on a vigilancia screen; reportable incidence by disease lacks lab denominator per row (`app/gob/vigilancia/page.tsx:504-506`).
3. **Excess:** Four compliance cards duplicate KPI row (`app/gob/vigilancia/page.tsx:331-399` vs `415-543`); "Mascotas hoy" (`app/gob/vigilancia/page.tsx:309-317`) is registry ops, not epidemiology.
4. **Spine:** `outbreak_signal`, `rabies_observation_*`, `incident_reported`, `disease_reported`, `vaccination_administered`, `symptom_observed`; cases table for open counts; `event_notification_outbox` for ENO (`fetchSurveillanceCompliance`).
5. **Format:** Map title switches province/subregion (`app/gob/vigilancia/page.tsx:177-194`); trend card says "12 meses" but uses period picker default 30d (`app/gob/vigilancia/page.tsx:53-54`, `595`).

**B. Visualization**
1. **Forms:** `OpKpi`×7 (`app/gob/vigilancia/page.tsx:285-328`, `336-398`); `MapChoroplethDynamic` (`app/gob/vigilancia/page.tsx:550-556`); `TimeSeriesChartDynamic` (`app/gob/vigilancia/page.tsx:598`); `DiseaseSummaryTable`; signal list (`app/gob/vigilancia/page.tsx:582-586`).
2. **Fitness:** Choropleth for open cases = reasonable; absolute counts on national map without per-capita = weak for comparison.
3. **Honesty:** Reportable diseases show k-anon suppression (`app/gob/vigilancia/page.tsx:511-515`); **known interaction:** subregion drill exposes counts &lt;5 without hatch (`fetchCasesPerSubregion` emits raw counts `lib/analytics/govt-dashboards.ts:944-950`, filter only hides 0 on map `app/gob/vigilancia/page.tsx:181-187`).
4. **Panorama:** Same subregion fetcher as panorama locality layer — shared k-anon gap.
5. **Improvement:** Apply `suppressSmallCells` before subregion choropleth data — **mechanical**.

---

### `/gob/vigilancia/zoonosis`, `/brotes`, `/investigaciones` (+ forms)

**Zoonosis** (`app/gob/vigilancia/zoonosis/page.tsx`): Decision = disease mix trend. `DiseaseSummaryTable` + `TimeSeriesChartDynamic`. Duplicates parent vigilancia trend/summary. **Excess** as standalone route.

**Brotes** (`app/gob/vigilancia/brotes/page.tsx`): Decision = triage `outbreak_signal` rows with verified filter. List + `OutbreakSignalRow`; `computeConfidence` gating (`app/gob/vigilancia/brotes/page.tsx:10-11`). Correct drill-down from parent.

**Investigaciones** (`app/gob/vigilancia/investigaciones/page.tsx`): Decision = open/escalate outbreak investigations. Case list from `listOutbreakInvestigationsForGovt` (`app/gob/vigilancia/investigaciones/page.tsx:26`). Permanent `OpBreach` for external notification gap (`app/gob/vigilancia/investigaciones/page.tsx:48-52`) — honest, not actionable in-app.

**Forms** (`nuevo/`, `[caseCode]/`): Workflow CRUD over `cases` — shallow on analytics; earn place as action surfaces.

---

### `/gob/analytics` (`app/gob/analytics/page.tsx`)

**A. Content**
1. **Decision:** How does my jurisdiction compare on registration, adoption mix, rabies history, and regional hotspots?
2. **Missing:** Microchip/sterilization compliance (live in home/programa); no transaction-time toggle; ranking is rabies-only (`app/gob/analytics/page.tsx:340-341`).
3. **Excess:** `RABIES_VACCINATION_RATE_LABEL_ES` tile (`app/gob/analytics/page.tsx:224-237`) duplicates home KPI with **different definition** — known label collision; death causes lack denominator (`app/gob/analytics/page.tsx:362-380`).
4. **Spine:** `pet_registered`, acquisitions, `death_recorded`, `outbreak_signal`, open cases for choropleth; disputes from `custody_disputes` table (`app/gob/analytics/page.tsx:239-249`).
5. **Format:** Choropleth subtitle states per-10k (`app/gob/analytics/page.tsx:319-320`); acquisition rate states meta (`app/gob/analytics/page.tsx:217`).

**B. Visualization**
1. **Forms:** `OpKpi`×4; `AcquisitionChartDynamic`; `TimeSeriesChartDynamic`; `MapChoroplethDynamic`; `RegionRankingTable`; HTML bar list deaths; `OutbreakHistoryTable` (`app/gob/analytics/page.tsx:196-393`).
2. **Fitness:** Ranking table = correct; death bars normalized to max not population — ranking OK, rate misleading.
3. **Honesty:** Omits provinces without census from map (`app/gob/analytics/page.tsx:150-152`); signals trend suppression (`app/gob/analytics/page.tsx:286-291`).
4. **Panorama:** Divergent death viz (HTML bars vs Panorama stacked) — inconsistent.
5. **Improvement:** Rename/disambiguate rabies tile + cross-link to Panel KPI definition — **mechanical** (known collision).

---

### `/gob/mortalidad` (`app/gob/mortalidad/page.tsx`)

**A. Content**
1. **Decision:** Is disposition traceable per Ley CABA 5470, and where are reportable deaths?
2. **Missing:** Facility-level breakdown exists in fetcher but only bucket bars shown; no link to outreach for reportable deaths.
3. **Excess:** Context splits (`app/gob/mortalidad/page.tsx:302-323`) could be one drill-down.
4. **Spine:** Pure `death_recorded` projection (`app/gob/mortalidad/page.tsx:5-6`, `fetchMortalityDisposition`).
5. **Format:** Strong — traceable/unknown/reportable with targets (`app/gob/mortalidad/page.tsx:200-239`); locality k-anon noted (`app/gob/mortalidad/page.tsx:421-422`).

**B. Visualization**
1. **Forms:** `OpKpi`×4; horizontal bars disposition; `StackedTimeSeriesChartDynamic` causes (`app/gob/mortalidad/page.tsx:347-355`); locality bars.
2. **Fitness:** Stacked time series for causes = correct; bars vs max = OK for composition.
3. **Honesty:** `OpBreach` when unknown &gt;25% (`app/gob/mortalidad/page.tsx:176-180`); suppressed locality count (`app/gob/mortalidad/page.tsx:365-371`).
4. **Panorama:** Mortality layer exists; this page is the analytical depth — good pairing.
5. **Improvement:** Add reportable-death drill to case/outbox queue — **product-decision**.

---

### `/gob/perdidas` (`app/gob/perdidas/page.tsx`)

**A. Content**
1. **Decision:** Which lost pets need intervention, and is reunification improving?
2. **Missing:** Scan density / broadcast reach; no link to outreach; map uses filtered list not active-only (`app/gob/perdidas/page.tsx:150`).
3. **Excess:** Five KPIs overlap Panorama perdidas layer.
4. **Spine:** `status_changed`/`pets.status`, `fetchReunificationRate` on lost episodes, `fetchLostPets` projection.
5. **Format:** Reunification states denominator (`app/gob/perdidas/page.tsx:227`); "Recuperados (30d)" fixed label while period picker changes list (`app/gob/perdidas/page.tsx:204-210` vs `81-82`).

**B. Visualization**
1. **Forms:** `OpKpi`×5; `MapChoroplethDynamic`; `UrlTabs` + searchable list (`app/gob/perdidas/page.tsx:246-340`).
2. **Fitness:** List + map = correct; choropleth on absolute counts = weak nationally.
3. **Honesty:** No k-anon on map (pet counts by province — usually OK).
4. **Panorama:** Same metric `fetchPerdidasMetrics` as Panel (`app/gob/page.tsx:186-190`) — good parity.
5. **Improvement:** Align "Recuperados" KPI window with `PeriodPicker` — **mechanical**.

---

### `/gob/poblacion` & `/admin/poblacion`

**Gob** (`app/gob/poblacion/page.tsx`): Decision = is population controlled? Spine: `sterilization_performed`, `clinical_info_logged` pregnancy, `death_recorded`, `pet_registered`. Honest natalidad caveats (`app/gob/poblacion/page.tsx:202-204`, `277-284`). Choropleth with divergent scale + target (`app/gob/poblacion/page.tsx:376-384`). **Missing:** street-born invisible by design — stated.

**Admin** (`app/admin/poblacion/page.tsx`): Universal scope + ranked province table (per file header). Same viz family.

**Improvement:** Add "sterilizations per 1k active" rate tile alongside count — **mechanical**.

---

### `/gob/censo` & `/admin/censo`

**Gob** (`app/gob/censo/page.tsx`): Decision = is registry growing and healthy? Spine: `pets` + `pet_events` for dormant (`app/gob/censo/page.tsx:236-237`), identification funnel. Funnel + choropleth (`app/gob/censo/page.tsx:294-457`). **Excess:** "Activas" vs "Total" redundant (`app/gob/censo/page.tsx:206-227`).

**Admin:** Adds cross-jurisdiction ranking (header comment).

---

### `/gob/programa` & `/admin/programa`

**Gob** (`app/gob/programa/page.tsx`): Executive triage for jurisdiction. North-star KPIs + outliers table + PII oversight + alerts (`app/gob/programa/page.tsx:236-700`). **Decision-dense** — best govt summary screen.

**Admin** (`app/admin/programa/page.tsx`): Adds `fetchCronRuns`, `ForecastChartDynamic` (`app/admin/programa/page.tsx:23`, `44`). National scope.

**Excess on gob:** PII table shows truncated UUIDs (`app/gob/programa/page.tsx:449-450`) — low actionability without name resolution.

---

### `/gob/campanas` (`app/gob/campanas/page.tsx`)

**A. Content**
1. **Decision:** Which campaigns underperform on attendance vs enrollment?
2. **Missing:** Event spine — `fetchCampaignDashboard` reads `appointments` only (`app/gob/campanas/page.tsx:9-10`, `lib/analytics/campaign-metrics.ts` per known finding); no link to `vaccination_administered` outcomes.
3. **Excess:** Enrollment + Asistencias + Completitud overlap (`app/gob/campanas/page.tsx:221-274`).
4. **Spine:** **Shallow** — operational `service_offerings` + `appointments`, not `pet_events`.
5. **Format:** **Known interaction:** map `scaleLabel="Inscripciones"` but values are `attendedCount` (`app/gob/campanas/page.tsx:163-167`, `416-417`); table header correctly says "Asistencias" (`app/gob/campanas/page.tsx:438-439`).

**B. Visualization**
1. **Forms:** `OpKpi`×4 + sparklines; offering cards; `MapChoroplethDynamic` (`app/gob/campanas/page.tsx:412-418`).
2. **Fitness:** Per-offering card grid = good for ops; province aggregation of locality attendance = lossy.
3. **Honesty:** No k-anon (operational counts).
4. **Panorama:** No campaign layer — disconnected.
5. **Improvement:** Fix map legend label ↔ datum (`attended` vs `inscripciones`) — **mechanical** (known).

---

### `/gob/adopciones` & `/admin/adopciones`

**Gob** (`app/gob/adopciones/page.tsx`): Decision = is placement pipeline healthy? Spine: `shelter_intake_recorded`, `foster_*`, `adoption_*`, `custody_transferred`, ownership projections (`app/gob/adopciones/page.tsx:29-38`). Funnel, time-in-state, occupancy, trend chart — high decision density.

**Admin:** Universal scope variant.

---

### `/gob/outreach` (`app/gob/outreach/page.tsx`)

**A. Content**
1. **Decision:** Who do I contact for overdue rabies, stray hotspots, or vet recognition?
2. **Missing:** No in-app contact action — export only (`app/gob/outreach/page.tsx:15`).
3. **Excess:** None — appropriately actionable.
4. **Spine:** Mixed — overdue from vaccine events; stray from scans; sterilization ranking from `sterilization_performed`.
5. **Format:** PII audit per pipeline (`app/gob/outreach/page.tsx:77-79`).

**B. Visualization:** Three pipeline tables + `OpKpi` headers — list-first, correct for action.

**Improvement:** Wire KPI tiles on Panel to pipeline deep-links — **mechanical**.

---

### Operational queues (grouped)

| Screen | Decision | Spine vs CRUD | Key viz |
|---|---|---|---|
| `/gob/cola` (`app/gob/cola/page.tsx`) | Approve/reject pending requests | CRUD `approval_requests` | Filter chips + `BulkApprovalQueueList` |
| `/gob/cola/[publicToken]` (`app/gob/cola/[publicToken]/page.tsx`) | Decide this request | CRUD + audit | Detail card + `ReviewActions` |
| `/gob/maltrato` (`app/gob/maltrato/page.tsx`) | Triage welfare denuncias | `welfare_reports` + bridge events | `OpKpi` + `UrlTabs` queue + `JurisdictionSwitcher` |
| `/gob/maltrato/[id]` | Resolve denuncia | CRUD | Detail + map |
| `/gob/moderacion` (`app/gob/moderacion/page.tsx`) | Moderate flagged anon denuncias | CRUD | Scoped copy of admin moderacion |
| `/gob/casos` (`app/gob/casos/page.tsx`) | Regulatory case triage | `cases` projection | `CaseQueue` |
| `/gob/disputas` (`app/gob/disputas/page.tsx`) | Resolve custody disputes | `custody_disputes` | `CaseQueue` |
| `/gob/decomisos` (`app/gob/decomisos/page.tsx`) | Manage seizures | `cases` + `fetchSeizures` on `shelter_intake_recorded` | Table + D5 KPI |
| `/gob/outbox` (`app/gob/outbox/page.tsx`) | Clear ENO notification backlog | `event_notification_outbox` | `OutboxTable` + breach cue |
| `/gob/servicios` (`app/gob/servicios/page.tsx`) | Approve pending offerings | CRUD | Pending list |
| `/gob/organizaciones` (`app/gob/organizaciones/page.tsx`) | Find/revoke orgs | CRUD search | Search + bulk revoke |
| `/gob/usuarios` (`app/gob/usuarios/page.tsx`) | Find/revoke users | CRUD + C2/C5 metrics | `OpKpi` ISO/fraud + search |

**Shared gap:** Queue screens don't show "why urgent" aggregates on list rows (age alone on casos via `CaseQueue`).

**Admin mirrors:** `/admin/cola`, `/admin/usuarios`, `/admin/organizaciones`, `/admin/servicios`, `/admin/outbox` — same components, universal scope.

---

### `/gob/reglas` (+ admin re-export) (`app/gob/reglas/page.tsx`)

**A. Content**
1. **Decision:** What rules apply here (govt read-only) / configure overrides (admin)?
2. **Govt:** Resolved cascade list (`app/gob/reglas/page.tsx:50-64`) — earns place as reference.
3. **Admin:** `AdminReglasLens` — CRUD on `govt_business_rules`.
4. **Spine:** Rules table, not events — correct for config surface.
5. **Missing on govt:** No link to compliance metrics those rules drive.

**B. Visualization:** Card lists + `OpCodeBadge` — correct for config, not charts.

---

### `/gob/historial` (`app/gob/historial/page.tsx`)

**Decision:** Who did what in my jurisdiction? Audit log with PII guard on peer queries (`app/gob/historial/page.tsx:286-307`). **Earns place** — accountability. Viz: filter form + grouped list (`app/gob/historial/page.tsx:325-505`). No charts needed.

---

### `/gob/sistema` & `/admin/sistema`

**Gob** (`app/gob/sistema/page.tsx`): ENO SLA + scoped queue aging — duplicates `/gob/programa` queue slice (`app/gob/sistema/page.tsx:155-266`).

**Admin** (`app/admin/sistema/page.tsx`): Full ops — users, queue, decisions, govt activity, crons, ENO, pet status drift (`app/admin/sistema/page.tsx:45-53`). `AdminKpiStrip` + tables. **Decision-dense** for platform ops.

---

### `/admin` — Panel (`app/admin/page.tsx`)

**A. Content**
1. **Decision:** Is platform healthy, and where do I manage institutional accounts?
2. **Missing:** No panorama/analytics KPIs on landing — only `AdminKpiStrip` (`app/admin/page.tsx:52-64`).
3. **Excess:** Account cards duplicate nav (`app/admin/page.tsx:68-79`).
4. **Spine:** Operational tables only.
5. **Format:** Clear universal-scope copy (`app/admin/page.tsx:43-47`).

**B. Visualization:** `AdminKpiStrip` + static cards — minimal charts by design.

**Improvement:** Embed 3 national outlier KPIs from `/admin/programa` — **mechanical**.

---

### `/admin/auditoria` (`app/admin/auditoria/page.tsx`)

Universal audit trail with filters + keyset pagination (`app/admin/auditoria/page.tsx:43-71`). Table + grouped rows. **Earns place.** Contrasts with `/admin/historial` (self-scoped only per `app/admin/historial/page.tsx` header).

---

### `/admin/observaciones` (+ detail/microchip) (`app/admin/observaciones/page.tsx`)

**Decision:** Close rabies observations within 10 days. Queries `pets.rabiesObservationStatus` + `rabies_observation_*` events (`app/admin/observaciones/page.tsx:50-59`). List + pills. **High decision density** — legal compliance.

---

### `/admin/moderacion` (+ `/gob/moderacion`)

Flagged anonymous denuncia queue (`app/admin/moderacion/page.tsx:68-76`). Keyset pagination. **Earns place.**

---

### `/admin/alertas` (`app/admin/alertas/page.tsx`)

Alert firing triage state machine (`app/admin/alertas/page.tsx:3-8`). `AlertInboxTable` + filters. Admin-only. **Earns place** — closes loop from `/admin/programa` subscriptions.

---

### `/admin/inteligencia` (`app/admin/inteligencia/page.tsx`)

Territorial index, policy→outcome, data quality (`app/admin/inteligencia/page.tsx:6-12`). `ScoreBar` + tables; k=5 on data quality (`app/admin/inteligencia/page.tsx:31-34`). **Strong** admin-only analytics; no govt counterpart.

---

### `/admin/libro` (`app/admin/libro/page.tsx`)

Event ledger over `pet_events` (`app/admin/libro/page.tsx:10-11`, `fetchEventLedger`). `EventLedgerTable` + replay links to panorama. **Best spine-transparency surface** — earns place.

---

### `/admin/govts`, `/admin/admins` (+ new/detail)

Institutional account roster CRUD (`app/admin/govts/page.tsx:28-37`, `app/admin/admins/page.tsx:10-24`). Tables + status chips. **Earn place** as admin core workflows.

---

### `/admin/casos` (`app/admin/casos/page.tsx`)

Universal `CaseQueue` — govt redirected to `/gob/casos` (`app/gob/casos/page.tsx:36`). Earns place.

---

### `/admin/acerca/integracion-miarg` (`app/admin/acerca/integracion-miarg/page.tsx`)

Illustrative stub with permanent disclaimer (`app/admin/acerca/integracion-miarg/page.tsx:21-28`). **Does not earn analytical place** — demo/marketing only.

---

### `/gob/analytics/export` (`app/gob/analytics/export/page.tsx`)

Deferred export form (`app/gob/analytics/export/page.tsx:1-13`). Linked from analytics (`app/gob/analytics/page.tsx:258-263`) but header says unreachable from nav — inconsistent. **Low value until wired.**

---

### Detail / form routes (brief)

| Routes | Role |
|---|---|
| `casos/[publicCode]`, `disputas/[token]`, `decomisos/[code]`, `maltrato/[id]`, `moderacion/[id]`, `outbox/[id]`, `servicios/[token]` | Action detail — CRUD; visualization = metadata + timelines |
| `decomisos/nuevo`, `investigaciones/nuevo`, `govts/new`, `admins/new` | Wizards — earn place as write paths |
| `reglas/.../nueva`, `.../editar/[ruleId]` | Rule editor forms |
| `observaciones/[token]/microchip/reemplazar` | Fraud-review workflow |

---

## Cross-cutting synthesis

### Top 10 improvements (operator value × low risk)

| # | Improvement | Tag |
|---|---|---|
| 1 | Fix campañas map legend: `scaleLabel`/tooltip = asistencias, not inscripciones (`app/gob/campanas/page.tsx:416-417`) | **mechanical** (known) |
| 2 | Apply k-anon to vigilancia/panorama subregion choropleth (`lib/analytics/govt-dashboards.ts:944-950`) | **mechanical** (known) |
| 3 | Disambiguate "Cobertura antirrábica" Panel/Panorama vs analytics historical tile (`app/gob/page.tsx:253`, `app/gob/analytics/page.tsx:224-236`) | **mechanical** (known) |
| 4 | Remove/replace "Mascotas hoy" on vigilancia with event-based signal or drop (`app/gob/vigilancia/page.tsx:309-317`) | **mechanical** |
| 5 | Align perdidas "Recuperados (30d)" KPI with period picker (`app/gob/perdidas/page.tsx:204-210`) | **mechanical** |
| 6 | Panel: replace empty Vigilancia card with live breach strip (`app/gob/page.tsx:607-623`) | **mechanical** |
| 7 | Wire campaign dashboard to `vaccination_administered` / attendance events, not appointments only | **product-decision** (known spine gap) |
| 8 | Default Panorama layer/preset by role urgency (outbreaks vs perdidas) | **product-decision** |
| 9 | Consolidate `/gob/sistema` into `/gob/programa` or deep-link-only | **product-decision** |
| 10 | Expand event-type coverage in dashboards (22/48 gap) starting with `movement_recorded`, `credential_scanned` aggregates | **product-decision** (known) |

---

### Screens that don't earn their place

| Screen | Why |
|---|---|
| `/admin/acerca/integracion-miarg` | Illustrative stub, zero operational decision (`app/admin/acerca/integracion-miarg/page.tsx:21-28`) |
| `/gob/vigilancia/zoonosis` | Near-duplicate of parent vigilancia panels |
| `/gob` Vigilancia aside card | Link-only placeholder (`app/gob/page.tsx:607-623`) |
| `/gob/sistema` (for govt) | Mostly duplicates programa + outbox + cola KPIs |
| `/gob/analytics/export` | Deferred, half-wired (`app/gob/analytics/export/page.tsx:1-13`) |

---

### Format / label defects (mechanical)

| Defect | Location |
|---|---|
| Cabañas map: legend "Inscripciones" vs `attendedCount` data | `app/gob/campanas/page.tsx:163-167`, `416-417` |
| Rabies label collision (12m compliance vs lifetime all-species) | `app/gob/page.tsx:253`, `app/gob/analytics/page.tsx:224-236` |
| PPP KPI uses `TARGETS.MICROCHIP_PENETRATION_PCT` for tone | `app/gob/page.tsx:416` |
| Vigilancia trend title "12 meses" vs 30d default period | `app/gob/vigilancia/page.tsx:53-54`, `595` |
| Perdidas "Recuperados (30d)" vs movable period filter | `app/gob/perdidas/page.tsx:81-82`, `204-210` |
| Death cause bars: counts without % of total deaths | `app/gob/analytics/page.tsx:362-380` |
| Vigilancia rabies breach links to `/admin/observaciones` from gob context | `app/gob/vigilancia/page.tsx:407` |
| `fetchVigilanciaMetrics.petsRegisteredToday` label implies vigilancia but counts `pets.created_at` | `app/gob/vigilancia/page.tsx:310-315`, `lib/analytics/govt-dashboards.ts:801` |
| Analytics export page comment says unreachable but analytics links to it | `app/gob/analytics/export/page.tsx:4-8` vs `app/gob/analytics/page.tsx:258-263` |

---

### Spine leverage summary

| Tier | Screens |
|---|---|
| **Strong event projections** | Panel, Panorama, mortalidad, poblacion, censo, adopciones, analytics (partial), vigilancia (partial), outreach (partial), libro |
| **Mixed** | campanas (appointments only), decomisos (cases + intake events), maltrato (welfare_reports + events) |
| **Operational CRUD** | cola, servicios, organizaciones, usuarios, reglas, govts/admins, moderacion, outbox, casos, disputas |
| **Known dead zone** | ~26/48 event types never surface in any dashboard (per your prior finding) — includes most custody/adoption intermediates, `movement_recorded`, share telemetry, etc. |

---

**Note on known findings:** Subregion k-anon leak, campañas legend mismatch, rabies label collision, appointments-only campaigns, and 22/48 event coverage were treated as interaction points only — not re-reported as new discoveries except where file:line evidence anchors the defect list above.
