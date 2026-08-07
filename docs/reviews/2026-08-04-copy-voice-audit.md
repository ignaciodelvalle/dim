# Copy & Voice Audit — DIM / MiMAR

**Date:** 2026-08-04
**Scope:** user-facing es-AR copy across `app/**`, `components/**`, `lib/**`, `src/**` (`.ts` / `.tsx`)
**Mode:** read-only. No source file was modified.

---

## Method and limits

**What was searched.** Every finding below was produced by pattern search (`rg` via Grep) followed by reading the matched file to confirm the string is user-visible Spanish copy — JSX text, a label / placeholder / title / `aria-label` / toast / error message / notification body — and not an identifier, code comment, enum key, DB column, CSS class, route segment, or test fixture. Nothing is reported from memory or inference. Where a finding required knowing what the system actually *does* (the honesty section), the evidence is cited as a second file:line.

**Explicitly excluded from the finding set:** `docs/`, `e2e/`, `scripts/`, `__tests__/`, `*.test.*`, `node_modules/`, `.claude/worktrees/`. `docs/`, `supabase/`, `vercel.json` and `scripts/` were *read as evidence* for the honesty and fence sections but no defect in them is reported.

**Limits — what this audit does not establish.**

1. **Counts are floors, not ceilings.** The orthography and voice sweeps are wordlist-driven. A misspelling whose unaccented form was not in the list was not found. Treat every count as "at least N".
2. **Dynamic strings are invisible to grep.** Copy assembled at runtime from variables, or held in the database (notification bodies written by operators, seeded content), was not audited.
3. **No screenshots.** This is a source audit. A string that is correct in code but truncated, wrapped, or overlapped on screen is out of scope — that is the visual-QA pass's job.
4. **"Can the count be 1?" is a judgement call.** For the plural-agreement findings, each site was classified by reading the value's provenance. Sites where a literal constant structurally forbids `n === 1` were excluded and are listed as such; a few remaining ones are theoretically-but-rarely 1 and are marked 🟢.
5. **Register (vos / usted) was judged per surface, not per legal requirement.** Whether a government surface *should* be formal is a product decision, not a defect. What is reported is the *inconsistency*, which is a defect under any answer.

**Severity key:** 🔴 wrong information / breaks trust · 🟠 inconsistent, user notices · 🟡 polish · 🟢 nit.

---

## Verification of the six reported instances

All six were confirmed as still present.

| # | Claim | Status | Evidence |
|---|---|---|---|
| 1 | `"proximamente"` unaccented on a government surface | ✅ confirmed | `app/gob/analytics/export/ExportFormClient.tsx:132` — `{"Parquet — proximamente"}` |
| 2 | `"1 celdas … ocultas"` no plural agreement | ✅ confirmed | `components/panorama/PanoramaSuppressionNotice.tsx:55`; sibling defect on `:60` |
| 3 | `"capá al máximo"` broken Spanish | ✅ confirmed | `components/panorama/LayerPanel.tsx:177` |
| 4 | hybrid clock `"05:39 p. m."` | ✅ confirmed, and worse than reported | `components/panorama/PanoramaConsole.tsx:4623-4629` and `components/panorama/PanoramaKpiFooter.tsx:82-88`. **The canonical helper itself is affected** — see S1. |
| 5 | `CaseStatus.open` rendered five different ways | ✅ confirmed — exactly five distinct strings | see S3 |
| 6 | 22 hand-written status dictionaries | ✅ confirmed — 23 found | see S3 |

---

# Part 1 — Systemic findings

These are patterns, not incidents. Each one names the fix that closes the whole class.

---

## S1 🟠 The 12-hour clock leak — 24 render sites, including the canonical helper

**The defect.** `es-AR`'s `Intl` default hour cycle is 12-hour with a `"p. m."` suffix. Any `Intl.DateTimeFormat` / `toLocaleString` call that requests `hour` without setting `hourCycle: "h23"` or `hour12: false` renders `"05:39 p. m."` — a hybrid that es-AR does not use (a real 12-hour clock has no leading zero; a real 24-hour clock has no suffix).

**Scale: 24 call sites.** The critical one is not on a screen — it is the shared helper:

- `lib/utils/format.ts:32-39` — `SPANISH_DATETIME_FORMAT`, which backs the exported **`formatDateTime()`**, sets `hour: "2-digit"` with no `hourCycle`. Every consumer of the app's canonical date-time helper renders 12-hour.

The fix was applied to two *neighbouring* formatters in the same file and never to this one:

- `lib/utils/format.ts:81-92` — `SPANISH_DATETIME_LEGAL_FORMAT` sets `hourCycle: "h23"`, with a comment at `:88` naming the exact bug: *"es-AR's Intl default is 12-hour (`05:47:41 p. m.`), which reintroduces exactly the am/pm ambiguity this formatter exists to remove."*
- `lib/utils/format.ts:182-190` — `AR_ISO_DATETIME_PARTS_FORMAT` also sets `hourCycle: "h23"`.

So the knowledge exists in the file. It landed on two of three formatters.

The other 22 sites hand-roll the same `{day, month, hour, minute, timeZone}` options object inline rather than importing a helper, and each independently missed the fix. Representative sites across every audience:

| Surface | file:line |
|---|---|
| gob flagship (Panorama masthead) | `components/panorama/PanoramaConsole.tsx:4623-4629` |
| gob flagship (Panorama footer) | `components/panorama/PanoramaKpiFooter.tsx:82-88` |
| gob (Panorama scrubber) | `components/panorama/TimeScrubber.tsx:340-349` |
| gob (Panorama report export) | `components/panorama/panorama-informe.ts:219-228` |
| owner (booking a turno) | `app/(app)/turnos/buscar/[offeringToken]/reservar/[slotId]/page.tsx:78-82` |
| owner (turno detail) | `app/(app)/mis-turnos/[appointmentToken]/page.tsx:74-78` |
| public credential | `app/(public)/p/[publicToken]/page.tsx:751`, `app/(public)/p/[publicToken]/Tier2MedicalView.tsx:70-77` |
| org agenda | `app/org/[orgToken]/agenda/page.tsx:240-244, 245-249, 290-294` |
| org messages | `app/org/[orgToken]/mensajes/page.tsx:31-38` |
| admin ledger | `app/admin/libro/EventLedgerRow.tsx:157-164`, `app/admin/libro/view.ts:42-49` |
| admin system / crons | `app/admin/sistema/_components/sistema-sections.tsx:486-492`, `app/admin/sistema/crons/page.tsx:192-198` |
| lost-pet card | `components/pet-profile/LostLastSeenCard.tsx:118-126` |
| appointments card | `components/AppointmentCard.tsx:61-65` |

**Fix that closes all 24 (smallest first):**

1. Add `hourCycle: "h23"` to `SPANISH_DATETIME_FORMAT` (`lib/utils/format.ts:32-39`) — **one line**, fixes every `formatDateTime()` consumer at once.
2. Add the same line to `PanoramaConsole.tsx:4623-4629` and `PanoramaKpiFooter.tsx:82-88` — two lines, fixes the confirmed `"05:39 p. m."` on the flagship government surface.
3. Extend the existing fence family (see "The catalogue fence" below) with a rule that fails any `hour:` in an `Intl` options object without a sibling `hourCycle` / `hour12`. This is what stops site 25.

---

## S2 🟠 ~35 files hand-roll date formatters instead of importing the shared ones

**The defect.** `lib/utils/format.ts` exports nine date/time shapes and documents at length (`:6-22`) *why* every formatter must be centralised — the AR-timezone pin exists to prevent React #418 hydration mismatches. Despite that, roughly 35 files construct their own `Intl.DateTimeFormat` / `toLocaleDateString` / `toLocaleString`.

This is the **root cause of S1**: the 12-hour fix could not propagate because the call sites never converged on the helper.

**The product currently renders at least 9 distinct date/time shapes**, each traceable to a producer:

| Shape | Producer |
|---|---|
| `"8 de julio de 2026"` | `formatDate` — `lib/utils/format.ts:41-46` |
| `"8 de julio de 2026, 5:51 p. m."` | `formatDateTime` — `lib/utils/format.ts:48-53` (12h, see S1) |
| `"7 de jul de 2026"` | `formatDateShort` — `lib/utils/format.ts:69-74` |
| `"07/07/2026, 17:47:41 (hora de Argentina)"` | `formatDateTimeLegal` — `lib/utils/format.ts:99-104` |
| `"17/07/2026 04:30"` | `formatDateTimeNumericAr` — `lib/utils/format.ts:222-229` |
| `"18/07"` / `"18/07/2027"` | `formatDateArOmitCurrentYear` — `lib/utils/format.ts:240-253` |
| `"hoy"` / `"ayer"` / `"26/7"` | `relativeDayLabel` — `lib/utils/format.ts:838-844` |
| `"hace 3 días"` / `"hace 2 sem"` | `relativeTime` — `lib/utils/format.ts:846-866` |
| `"8 jul 2026, 17:51"` | inline `dateStyle`/`timeStyle` — e.g. `components/ui/dashboard/OutboxTable.tsx:119-123` |
| `"26 / JUL / 2026"` (split tile) | hand-split — `app/(app)/mis-mascotas/[publicToken]/libreta/LibretaSanitariaView.tsx:246-257` |

Nine shapes is not automatically wrong — a legal PDF and a feed chip legitimately differ. What is wrong is that shapes 9 and 10 exist *outside* the catalogue, so nobody can say how many there are without this audit.

**Consequence already realised — one site lost its timezone entirely:**

- 🟠 `components/panorama/panorama-informe.ts:219-228` — `formatGeneratedAt()` calls `toLocaleString("es-AR", {...})` with **no `timeZone`**. It is the only in-scope date formatter missing the AR pin. This stamps the generation time on the exported Panorama *informe* — a document a government operator may file — in whatever zone the runtime happens to be (UTC on Vercel). Fix: add `timeZone: AR_TIME_ZONE`.

**Fix that closes the class:** a fence rule that fails any `Intl.DateTimeFormat` / `toLocale*` construction outside `lib/utils/format.ts`, plus a burn-down baseline for the existing ~35 (the same ratchet shape `scripts/check-metric-labels.ts` already uses).

**Also worth a decision, not counted as a defect:** `lib/analytics/dashboards/surveillance.ts:764`, `lib/analytics/dashboards/analytics.ts:388` and `lib/metrics/timeseries.ts:334` pin `timeZone: "UTC"` for monthly chart-axis labels. Plausible if the bucketing is also UTC, but it diverges from the AR-pinning convention everywhere else and deserves a comment saying why.

---

## S3 🟠 23 hand-written status dictionaries; `CaseStatus.open` said five ways

**Confirmed: five distinct strings for one enum value.**

| Rendered string | file:line | Surface |
|---|---|---|
| `"Abierto"` | `components/ui/dashboard/CaseStatusBadge.tsx:28` (`CASE_STATUS_CONFIG`) | canonical |
| `"Abierta"` | `app/gob/vigilancia/investigaciones/page.tsx:23`, `app/gob/vigilancia/investigaciones/[caseCode]/page.tsx:18`, `app/gob/disputas/[disputeToken]/page.tsx:27`, `app/org/[orgToken]/maltrato/recibidos/page.tsx:27` | gob, org |
| `"Esperando respuesta"` | `app/org/[orgToken]/transferencias/page.tsx:24` | org |
| `"Pendiente de respuesta"` | `app/org/[orgToken]/transferencias/recibidas/page.tsx:55` | org |
| `"Abiertas (todas)"` | `app/admin/alertas/page.tsx:58` | admin |

Note that `"Abierto"` vs `"Abierta"` is not only a synonym problem — it is a **gender disagreement inside one vocabulary**. The canonical map says masculine (`caso`); five screens say feminine (`denuncia`, `disputa`, `investigación`, `transferencia`). Both are locally correct; the vocabulary is not.

**23 local status dictionaries** bypass the canonical maps entirely:

```
app/(app)/cuenta/solicitudes/page.tsx:33          app/gob/cola/[publicToken]/page.tsx:26
app/(app)/cuenta/transitos/historial/page.tsx:12  app/gob/disputas/[disputeToken]/page.tsx:26
app/(app)/mis-mascotas/[publicToken]/asistencia/page.tsx:47
app/(app)/transferencias/page.tsx:12              app/gob/maltrato/_inspector/PetSubView.tsx:19
app/(app)/transferencias/[transferToken]/page.tsx:13
app/admin/alertas/page.tsx:57                     app/gob/perdidas/_components/LostPetRow.tsx:27
app/admin/observaciones/page.tsx:47               app/gob/servicios/ServiciosScreen.tsx:70
app/admin/sistema/_components/sistema-sections.tsx:329
app/admin/sistema/crons/page.tsx:37               app/gob/servicios/[offeringToken]/page.tsx:20
components/admin/AlertInboxTable.tsx:31           app/gob/vigilancia/investigaciones/page.tsx:22
app/org/[orgToken]/SoloVetAgendaLanding.tsx:19    app/gob/vigilancia/investigaciones/[caseCode]/page.tsx:17
app/org/[orgToken]/maltrato/recibidos/page.tsx:26
app/org/[orgToken]/transferencias/page.tsx:23
app/org/[orgToken]/transferencias/recibidas/page.tsx:54
app/org/[orgToken]/voluntarios/propuestas/page.tsx:10
```

**Where it has already drifted, with a written policy being violated:**

🟠 `app/gob/maltrato/MaltratoQueueScreen.tsx:455-460` carries an explicit in-code rule: *"ONE status vocabulary … the stat can never say 'En investigación' while the row pill says 'En curso' … Never an inline synonym here."* The gob screen obeys it by calling `welfareReportStatusLabel()` (`src/modules/welfare/domain/types.ts:107-124`, canonical: `open → "Abierta"`, `triaged → "Revisada"`, `in_progress → "En curso"`).

The **org screen for the same `welfare_reports` rows does not**: `app/org/[orgToken]/maltrato/recibidos/page.tsx:26-33` hardcodes its own map, giving `triaged → "Triagueada"` and `in_progress → "En seguimiento"`. Two operators looking at the same denuncia read two different statuses.

🟠 `app/gob/maltrato/_inspector/PetSubView.tsx:19-23` — local `STATUS_LABEL` hardcodes `deceased: "Fallecida"`, `lost: "Perdida"` (feminine only). `pet.sex` is rendered on the line immediately above (`:34`), so a male pet's welfare-inspector card literally reads **"Fallecida"**. `situationLabelForSex()` (`lib/utils/format.ts:734-741`) exists for exactly this and is already wired into three other pet views (`app/(public)/p/[publicToken]/page.tsx:646`, `app/(app)/mis-mascotas/[publicToken]/page.tsx:784`, `app/org/[orgToken]/mascotas/[publicToken]/page.tsx:287`) — just not this one.

**Fix that closes the class.** Three canonical sources already exist: `CASE_STATUS_CONFIG` (`components/ui/dashboard/CaseStatusBadge.tsx:27`), `welfareReportStatusLabel` (`src/modules/welfare/domain/types.ts:107`), and `requestOutcomeLabel` (`lib/utils/format.ts:428`). The last one's doc comment already names this exact audit trail: *"That is the same `CaseStatus.open`-said-five-ways family the 2026-08-01 review counted."* The work is to delete the 23 local maps in favour of these, then extend the fence (below) so status labels are governed the way KPI labels are.

**Highest-value single edit in the whole audit:** swap the local map in `app/org/[orgToken]/maltrato/recibidos/page.tsx:26-33` for an import of `welfareReportStatusLabel`. Two drifts closed in one import.

---

## S4 🟠 Count/plural agreement — 29 unguarded sites, `pluralizeEs` already exists

**The defect.** `${n} <noun>` templates that render `"1 celdas"`, `"1 días"`, `"1 pendientes"`. The shared helper `pluralizeEs(n, singular, plural?)` lives at `lib/utils/format.ts:1347-1353` and its own comment names the problem. `scripts/check-pluralize-es.ts` bans *new ad-hoc ternaries* — but it does not catch the far more common shape, which is a plural noun with no ternary at all.

**29 confirmed sites where the count can be 1 at runtime.** Highest-visibility first:

| Severity | file:line | String | Note |
|---|---|---|---|
| 🟠 | `components/panorama/PanoramaSuppressionNotice.tsx:55` | `"{n} celdas con menos de 5 casos ocultas…"` | noun *and* adjective both wrong at n=1; k-anon privacy disclosure on the gob flagship |
| 🟠 | `components/panorama/PanoramaSuppressionNotice.tsx:60` | `"{n} registros sin localidad asignada…"` | same component |
| 🟠 | `components/ui/dashboard/OpRailNav.tsx:128` | `"{label} — {badge} pendientes"` | guarded only by `badge > 0` — every operator nav rail |
| 🟠 | `components/layout/AppShellDrawer.tsx:144` | same | mobile twin of the above |
| 🟠 | `components/admin/QueueHealthCockpit.tsx:107` | `"Aprobaciones · {n} pendientes"` | |
| 🟠 | `app/gob/programa/ProgramaResumenScreen.tsx:464` | `"{n} pendientes en tu jurisdicción"` | |
| 🟠 | `components/panorama/CalendarHeatmap.tsx:247` | `"…{total} en total sobre {dayCount} días"` | |
| 🟠 | `components/panorama/DetailDrawer.tsx:774` | `"Tendencia de {layer}: {n} días"` | |
| 🟠 | `app/admin/inteligencia/inteligencia-panels.tsx:257`, `:717` | `"{n} registros sin provincia asignada"` | duplicated |
| 🟠 | `app/admin/inteligencia/inteligencia-panels.tsx:585` | `"ventana parcial ({n} días)"` | `afterDaysCovered` documented as 0/20/60 |
| 🟠 | `app/admin/poblacion/AdminPoblacionScreen.tsx:540` | `"{n} mascotas sin provincia asignada"` | |
| 🟠 | `app/org/[orgToken]/mascotas/OrgMascotasPipelineBoard.tsx:161` | `"{n} animales"` | kanban column `aria-label` + `title` |
| 🟠 | `app/org/[orgToken]/mascotas/OrgMascotasBulkList.tsx:113` | `"{n} meses"` | same file already has a correct chooser at `:910` |
| 🟡 | `app/org/[orgToken]/servicios/[offeringToken]/page.tsx:177` | `"{n} minutos"` | `pluralizeEs` is used correctly 15 lines below at `:192` |
| 🟡 | `app/org/[orgToken]/servicios/[offeringToken]/page.tsx:210, :213` | `"desde/hasta {n} meses"` | |
| 🟡 | `app/gob/servicios/[offeringToken]/page.tsx:167, :174` | same | gob mirror of the same screen |
| 🟡 | `components/ui/dashboard/OpKpi.tsx:526` | `"…últimos {n} meses…"` | `trendMonths` = array length, 1 on sparse data |
| 🟡 | `lib/domain/rule-types-registry.ts:284, :288` | `"{n} días"`, `"{n} días de anticipación"` | |
| 🟡 | `src/modules/foster/domain/matching-rules.ts:139` | `"…({n} semanas) excede el máximo … ({n} semanas)"` | |
| 🟡 | `src/modules/cases/domain/opened-reason-render.ts:63` | `"duración estimada: {n} semanas"` | |
| 🟡 | `src/modules/cases/domain/opened-reason-legacy.ts:104` | same, legacy parser | |
| 🟡 | `src/modules/panorama/domain/caption.ts:44` | `"últimos {n} días"` | |
| 🟡 | `app/(app)/cuenta/transitos/propuestas/[proposalToken]/page.tsx:74` | `"{n} semanas"` | |
| 🟢 | `app/admin/censo/AdminCensoScreen.tsx:333,342,373,402,431` + `app/gob/censo/CensoScreen.tsx:412,422,454,484,514` | `"{n} mascotas…"` (`aria-label`s) | structurally unguarded but 1 is very unlikely in production |

**Correctly guarded and deliberately excluded** (for the record, so the count is honest): `components/admin/AlertInboxTable.tsx:95`, `components/AdoptionQueueList.tsx:96`, `components/pet-profile/asiento-fields.ts:120,124`, `components/pet-profile/VacunasStatusBadges.tsx:158,224,232`, `components/pet-profile/AsientoCard.tsx:59,64`, `components/panorama/panorama-export.ts:98`, `lib/infra/notifications.ts:310,398`, `components/ui/dashboard/CaseQueue.tsx:307`, `app/(public)/perdidas/page.tsx:172`, `app/org/page.tsx:130`, `app/(app)/mis-mascotas/page.tsx:280`, plus every site whose count is a literal constant > 1.

**Grandfathered ad-hoc ternaries** (lint debt, grammatically correct today): `app/(app)/mis-mascotas/[publicToken]/libreta/LibretaSanitariaView.tsx:88`, `app/(app)/mis-mascotas/[publicToken]/libreta/SharesManager.tsx:269`.

**Fix that closes all 29:** extend `scripts/check-pluralize-es.ts` from "ban new ternaries" to "flag `${expr}` followed by a known plural Spanish noun without a `pluralizeEs` call on the same line", with a burn-down baseline. That converts a 29-site manual sweep into a ratchet.

---

## S5 🟠 Register drift — three registers on one government screen

The product is voseo. Citizen-facing surfaces (`app/(app)/**`, `app/(public)/**`) are **clean — zero tuteo hits**. The drift is entirely in gob and org surfaces.

**16 tuteo leaks**, 13 of them in one file:

🟠 `app/gob/decomisos/nuevo/_components/DecomisoForm.tsx` — the entire `validate()` block plus several placeholders are tuteo while the same file's own copy at `:650` says *"iniciá el decomiso"* (voseo):

| line | string | should be |
|---|---|---|
| `:226` | `"Busca y confirma la mascota antes de continuar."` | `"Buscá y confirmá…"` |
| `:228` | `"Indica la especie del animal sin registrar."` | `"Indicá…"` |
| `:230` | `"Selecciona el motivo del decomiso."` | `"Seleccioná…"` |
| `:232` | `"Especifica el detalle cuando el motivo es 'Otro'."` | `"Especificá…"` |
| `:234` | `"Selecciona el refugio o red de rescate destinataria."` | `"Seleccioná…"` |
| `:236` | `"Adjunta al menos 2 archivos…"` | `"Adjuntá…"` |
| `:362` | `"Ingresa el token DIM-XXXX-XXXX…"` | `"Ingresá…"` |
| `:454` | `"Describe el animal. Se creara un registro…"` | `"Describí…"` — **also missing the accent on `creará`** |
| `:472` | `"— Selecciona —"` | `"— Seleccioná —"` |
| `:593` | `"— Selecciona un motivo —"` | `"— Seleccioná un motivo —"` |
| `:617` | `"Describe el motivo especifico del decomiso"` | `"Describí el motivo específico…"` — **also missing the accent** |
| `:713` | `"Escribe para filtrar…"` | `"Escribí para filtrar…"` |
| `:718` | `"…Contacta al administrador."` | `"…Contactá al administrador."` |

Plus three elsewhere:
- 🟠 `app/gob/vigilancia/investigaciones/nuevo/OpenInvestigationForm.tsx:83` — `"Describe la situación epidemiológica…"`
- 🟠 `src/modules/surveillance/application/outbreak-investigation.ts:484` — `"…registra primero un informe epidemiologico final (o ingresa el texto…)"`
- 🟠 `app/org/[orgToken]/intake/match/[matchedPetToken]/page.tsx:127` — `"Este chip ya esta registrado en miMAR. Confirma si es el mismo animal."`

**2 usted leaks in the same feature:**
- 🟠 `src/modules/decomiso/application/execute-decomiso.ts:117` — `"Debe seleccionar un refugio destinatario."`
- 🟠 `src/modules/decomiso/application/reassign-decomiso.ts:131` — `"Debe seleccionar un nuevo refugio destinatario."`

**The finding that matters is the combination.** One user — the health-authority operator filing a decomiso — meets **all three registers inside one workflow**: voseo (`DecomisoForm.tsx:650`), tuteo (the `validate()` block above), and usted (`execute-decomiso.ts:117`). The register is not "formal on government surfaces"; it is unset.

**Fix:** the decomiso feature is the fix. Normalising `DecomisoForm.tsx` + the two `src/modules/decomiso/**` error strings closes 15 of 18. Then decide and write down one rule — this audit's recommendation is **voseo everywhere**, since it is what 100% of citizen surfaces and the majority of operator surfaces already do.

*Zero hits* for literal `usted`, `ingrese`, `seleccione`, `complete`, `confirme`, `verifique`, `comuníquese`, `diríjase`, `sírvase`, and zero for `tú`/`tienes`/`puedes`/`quieres`/`debes`/`eres`.

---

## S6 🟠 30 orthography defects — and the existing accent linter cannot see most of them

**The linter already exists and is under-scoped.** `scripts/check-ui-invariants.ts` Rule 3 is an accent linter. It has two gaps that explain almost every finding below:

1. **It scans only `app/**` and `components/**` — never `src/**`.** The single worst file in this audit (`src/modules/surveillance/application/outbreak-investigation.ts`, 9 distinct defects) is invisible to it.
2. **Its wordlist has 13 entries** (`Ultimas`, `notificacion`, `pais`, `evaluan`, `duenos`, `accion`, `jurisdiccion`, `auditoria`, `administracion`, `todavia`, `aqui`, `ademas`, `despues`). Words like `proximamente`, `investigacion`, `epidemiologico`, `posicion`, `resolucion`, `aprobacion`, `asignacion`, `descripcion`, `condicion`, `maximo`, `vacio`, `dias`, `tamano`, `dueno`, `esta`/`está`, `tenes`/`tenés` are not in it.

**28 missing-accent instances + 2 missing-ñ**, across 16 files. Heaviest concentrations:

- 🔴 `app/gob/analytics/export/ExportFormClient.tsx:132` — `"Parquet — proximamente"`. Government surface, above-the-fold, one word. Highest visibility-to-effort ratio in the whole audit.
- 🟠 `src/modules/surveillance/application/outbreak-investigation.ts` — 9 distinct defects, several repeated at 2-3 call sites: `investigacion` → `investigación`, `jurisdiccion` → `jurisdicción`, `esta` → `está`, `epidemiologico/a` → `epidemiológico/a`, `tenes` → `tenés`. These strings surface in `InvestigationActions.tsx` and `app/gob/vigilancia/investigaciones/nuevo/page.tsx`.
- 🟠 `app/gob/decomisos/nuevo/_components/DecomisoForm.tsx` — `Descripción`, `condición`, `física`, `Máximo`, `días`, plus `creara`→`creará` (`:454`) and `especifico`→`específico` (`:617`), already listed in S5.
- 🟠 `app/gob/reglas/.../PppWeightThresholdForm.tsx` — `vacio`, `esta`, `condicion`, and **`tamano` → `tamaño`** (`:92`).
- 🟠 `app/gob/reglas/.../PppAttestationRegistriesForm.tsx:83` — **`dueno` → `dueño`**.
- 🟠 Disputes screens — `Resolucion` → `Resolución`, `Posicion` → `Posición`.
- 🟡 Approval buttons — `asignacion`, `aprobacion`, `Verificacion`, `revision`.
- 🟡 Stray `Ultimo` / `Proximo` in the outbox detail page and the libreta share manager.

**Inverted marks: zero defects.** Every Spanish question found already opens with `¿` (e.g. `components/landing/CrisisBand.tsx:85`; the `question:` fields in `lib/metrics/kpi-catalog.ts` are all correct). No `¡` defects either. This class is clean.

**Fix that closes the class and prevents recurrence:** extend `scripts/check-ui-invariants.ts` Rule 3 to (a) also scan `src/**` and `lib/**`, and (b) grow the wordlist to cover the `-ción` / `-sión` family, the `-ico/-ica` family, `dias`, `maximo`, `minimo`, `proximo`, `ultimo`, `esta`(→`está`), `tenes`(→`tenés`), `tamano`, `dueno`, `nino`, `senal`, `ano`. Roughly one config block; it closes all 30 and every future one.

---

## S7 🔴 Copy promises delivery channels that do not exist

This is the only class that actively misleads users, and it recurs.

### S7.1 🔴 Outbox retry promises 5 minutes; the job runs once a day at 04:00

**The copy** — `app/admin/outbox/[id]/page.tsx:317-318`:

> *"Este botón no entrega la notificación al instante. La vuelve a poner en cola para que el sistema la reintente en el próximo ciclo de envío (máximo 5 minutos)."*

**What actually happens** — three mutually-corroborating sources:

- `vercel.json` — the only crons declared are daily: `{"path": "/api/cron/daily", "schedule": "0 4 * * *"}`
- `lib/infra/cron-registry.ts:69` — `{ cronName: "drain_outbox", …, schedule: "0 4 * * *" }`
- `app/api/cron/drain-outbox/route.ts:10-11` — *"Schedule: runs DAILY, invoked in order by the single dispatcher (`/api/cron/daily`, vercel.json `0 4 * * *`)"*
- `lib/infra/cron-dispatcher.ts:15-23, 148-151` — explains why: the Vercel Hobby plan permits only daily schedules; 22 jobs were folded into one daily dispatcher. *"sub-daily cadence is impossible on Hobby regardless of cron count."*

A retry queued at 04:05 waits ~24 hours, not 5 minutes — the promise is off by roughly 288×. The codebase knows this; the operator-facing copy was never updated.

**Fix:** rewrite the string to state the real cadence and let the operator plan around it — e.g. *"…la reintenta en el próximo ciclo de envío (una vez por día, a las 04:00)."* One string.

### S7.2 🔴 Service-offering approval promises email; only an in-app row is written

- **Copy:** `app/org/[orgToken]/servicios/[offeringToken]/page.tsx:142` — *"La autoridad revisará tu solicitud y te notificaremos por email y en el panel."*
- **Reality:** `src/modules/service-offerings/application/approve-service-offering.ts:79-91` and `reject-service-offering.ts:88-100` do only `tx.insert(notifications).values(...)`. `lib/infra/notification-service.ts` — the canonical write path — inserts a DB row and fires web push. There is no email leg anywhere in it.
- The only real email sender in the repo is Resend, wired exclusively for the analytics CSV export (`app/gob/analytics/export/actions.ts:9, 234-235`, gated on `RESEND_API_KEY`). Nothing under `src/modules/service-offerings/**` imports it.

**Fix:** drop `"por email y"`. One string.

### S7.3 🔴 Adoption applications promise the shelter will email — the shelter is never shown the email

**Copy (5 sites, one class):**
- `src/modules/adoption/application/review-adoption-application.ts:109` — *"…Te van a contactar por email para coordinar los próximos pasos."* (the approval notification body itself)
- `app/(app)/mis-mascotas/postulaciones/page.tsx:249` — *"El refugio te contacta por email cuando avanza."*
- `app/(app)/mis-mascotas/postulaciones/page.tsx:256` — *"…te va a contactar por mail."*
- `app/(app)/mis-mascotas/postulaciones/page.tsx:358` — *"…respondé por email para que puedan avanzar."*
- `app/(app)/mis-mascotas/postulaciones/page.tsx:376` — *"Coordinan los próximos pasos por email."*

**Reality:** the org's own review screen never surfaces the applicant's email. `app/org/[orgToken]/adopciones/[appEventId]/page.tsx:164-173` renders only *Nombre* and *Teléfono* — no email field, no `mailto:`. `db/schema.ts:393-396` confirms `profiles` deliberately does not mirror email (it lives in Supabase `auth.users`, which this page never joins). No email sender exists under `src/modules/adoption/**`.

**This exact bug was found and fixed elsewhere in this repo — today.** `src/modules/organizations/application/submit-org-contact.ts:19-25` and `app/org/[orgToken]/mensajes/page.tsx:1-18` carry a post-mortem comment: *"mientras la UI prometía 'te contactan por email' (auditoría 2026-08-04)"*, describing the identical defect in the org-contact flow, fixed by adding a mensajes inbox with a working `mailto:` (`app/org/[orgToken]/mensajes/page.tsx:110-113`). **The adoption flow is the same bug with no fix applied.**

**Fix (smallest):** change the five strings to name the real channel (*"te avisamos en la app"*). **Fix (correct):** apply the mensajes-inbox pattern that already exists for org contact, then the copy becomes true.

### Backed promises — verified, no action

For the record, so the class boundary is clear: the *"al instante"* claims on sighting/found-pet owner notification (`app/(public)/perdidas/page.tsx:96, :110`, `app/(public)/p/[publicToken]/sighting/page.tsx:139`, `app/(public)/p/[publicToken]/encontre/page.tsx:296`) **are true** — `src/modules/pets/application/sighting/report-pet-sighting.ts:299-320` inserts the notification and calls `sendPushForNotifications` synchronously in the request, bypassing the daily outbox. Every `"Próximamente"` / `"(en desarrollo)"` label is on a genuinely disabled control, and `lib/infra/outbox-list.ts:67` plus `app/gob/vigilancia/page.tsx:659` even document a house rule against using "próximamente" for things that *are* running. `"Vamos a verificar tu matrícula y te avisamos"` (`request-vet-upgrade.ts:207`) is channel-agnostic and backed.

One 🟢: `app/(public)/sugerencias/page.tsx:28` — *"Muy pronto vas a poder enviarnos tus sugerencias"* — no suggestions feature exists. The page's own comment admits it is unlinked and exists only to avoid a 404, so impact is near zero.

---

## S8 🟡 Empty states: 89 of 101 shared-component usages pass no action

`components/ui/EmptyState.tsx` exports `LnEmptyState`, used at **101 call sites across 61 files**. Its `action` prop is **optional**, and 89 usages omit it. Many are legitimately search-empty states where the description substitutes for a button — but narrowing to usages with **neither `action` nor `description`** gives 11 true dead ends:

| Severity | file:line | String |
|---|---|---|
| 🟠 | `app/(public)/refugios/page.tsx:96` | `"No pudimos cargar el listado de refugios. Reintentá en unos segundos."` — **tells the user to retry with no retry control** |
| 🟠 | `app/(public)/refugios/page.tsx:146` | `"No hay refugios verificados registrados todavía."` — public page, full stop |
| 🟡 | `app/(app)/cuenta/solicitudes/page.tsx:204` | `"No mandaste solicitudes todavía."` |
| 🟡 | `app/org/[orgToken]/transitos/page.tsx:170` | `"Todavía no hay tránsitos finalizados."` — the **sibling tab at `:157-165` does it right**, with inline text + a "Buscar voluntarios" link |
| 🟡 | `app/org/[orgToken]/voluntarios/page.tsx:153` | `"No hay voluntarios que coincidan."` — filtered dead end, no "limpiar filtros" |
| 🟡 | `app/org/[orgToken]/voluntarios/propuestas/page.tsx:114` | `"No hay propuestas."` — filter chips above, no way back to "Todas" |
| 🟡 | `app/org/[orgToken]/transferencias/page.tsx:114` | `"Todavía no propusiste ninguna transferencia."` |
| 🟡 | `app/org/[orgToken]/maltrato/recibidos/page.tsx:218` | two title-only variants |
| 🟢 | `app/org/[orgToken]/transferencias/recibidas/page.tsx:202`, `components/casos/CaseDetailView.tsx:250`, `app/(app)/mis-turnos/page.tsx:100` | genuinely nothing to do, or the CTA lives in the page header |

**Second, competing convention.** 17 files bypass `LnEmptyState` entirely and pass an `emptyMessage=` string to a table/queue primitive (e.g. `components/ui/dashboard/CaseQueue.tsx:201` — `emptyMessage = "No hay casos en esta cola."`, reused by `DisputasScreen.tsx`, `app/admin/casos/page.tsx`, `app/org/[orgToken]/casos/page.tsx`). That prop has **no CTA slot at all**, so it structurally cannot invite an action.

**The team already knows the right pattern**, which is why this is 🟡 and not 🟠: `app/(public)/adoptar/page.tsx:67-90` distinguishes "no results for these filters" (shows "Limpiar filtros") from "no listings yet"; `app/(app)/mis-mascotas/page.tsx:317-326` has a real `action` button plus a description explaining what registering *gives* you. It is applied inconsistently, not unknown.

**Fix that closes the class:** give `CaseQueue`/table primitives an optional `emptyAction` slot so the two conventions converge, then work the 11 dead ends. Cheapest single win: `app/(public)/refugios/page.tsx:96` — the copy already says *"Reintentá"*; give it a button.

---

## S9 🟠 Dot-decimal leaks — 6 sites, in a file that documents the ban

`lib/utils/format.ts:1238-1241` states the rule outright: *"A bare template literal (`${x}%`) and `toFixed()` both emit a DOT decimal — the WRONG locale. Every KPI/metric display MUST route through these helpers."* Six sites don't.

| Severity | file:line | Renders | Note |
|---|---|---|---|
| 🟠 | `app/gob/adopciones/page.tsx:288, :404, :422, :481` | `"12.3%"` | `returnRatePct`/`conversionPct` computed at `:175,:177` as genuine 1-decimal floats. **`app/admin/adopciones/page.tsx` computes the identical metric (`:107`) and correctly calls `formatPercent` at `:199, :321, :338`** — the comma-safe path exists and this file didn't use it |
| 🟠 | `app/gob/vigilancia/page.tsx:305` | `"87.3%"` | `const pct = (v) => \`${v}%\``, fed `enoSla.onTimePct` (a 1-decimal float from `lib/analytics/surveillance-metrics.ts:192`) |
| 🟠 | `app/gob/sistema/page.tsx:141, :206` | `"87.3%"` | same value, same bare template |
| 🟠 | `components/panorama/DetailDrawer.tsx:527` | `"45.2%"` | reunification-rate map popup; `properties.count` ← `u.ratePct`, un-rounded (`src/modules/panorama/infrastructure/repository-by-unit.ts:1056, :1070`) |
| 🟠 | `lib/events/events.ts:129` and `app/api/mis-mascotas/[publicToken]/libreta-export/route.ts:69` | `"12.50 kg"` | pet weight in the event timeline **and the printable libreta sanitaria PDF**. `__tests__/event-payload-details.test.ts:58` and `__tests__/libreta-export-route.test.ts:149, :192` **assert the dot output as expected** — the tests currently encode the bug. Contrast `components/pet-profile/AsientoCard.tsx:57-58`, which comments on this exact risk and uses `formatRate` |
| 🟡 | `app/gob/decomisos/nuevo/_components/DecomisoForm.tsx:814` | `"2.5 MB"` | file-size decimal |

**Correctly excluded** (verified, not defects): `${Math.round(x)}%` sites (`PanoramaDataTable.tsx:439`, `panorama-informe.ts:240`, `RankedRowPreview.tsx:40`, `app/org/[orgToken]/page.tsx:159`, `app/gob/campanas/CampanasScreen.tsx:289, :430`, and others) are integer-safe; `toFixed` in SVG path coordinates (`WeightSparkline.tsx:42`); `lat/lng.toFixed(6)` geographic coordinates, which conventionally use a dot.

**Fix:** six call sites route through `formatPercent` / `formatRate`. The two weight sites also need their tests updated — right now the suite defends the defect.

**Locale coverage is otherwise excellent:** **zero** in-scope `toLocale*` / `Intl` calls are missing the `"es-AR"` locale. (`en-CA` at `lib/utils/format.ts:144` and `lib/analytics/org-dashboard.ts:68` is deliberate — it is used for its `YYYY-MM-DD` ordering to build ISO keys, not for display.)

---

## S10 🟡 The `"Error desconocido"` fallback, copy-pasted across 5 files

Identical pattern, five files, no operation named and no recovery step:

```ts
setError(err instanceof Error ? err.message : "Error desconocido")
```

- `app/(app)/cuenta/desactivar/GovtSelfDeactivateForm.tsx:48`
- `app/(app)/cuenta/editar/EditProfileForm.tsx:163`
- `app/(app)/cuenta/renunciar/VetSelfResignForm.tsx:40`
- `app/admin/admins/new/CreateAdminForm.tsx:52`
- `app/admin/govts/new/CreateGovtForm.tsx:87`

It fires on any non-`Error` throw — a network failure being the common case — so the user gets two words on a screen where they were trying to deactivate an account or create an operator.

**Context that keeps this at 🟡, not 🟠.** The dominant error convention in the codebase is genuinely good: 40+ call sites use `"No se pudo <verbo específico>: ${err.message ?? "error desconocido"}"` (`app/actions/decomiso.ts`, `src/modules/events/actions.ts`, `app/org/[orgToken]/atender/actions.ts`), which names the failed operation and surfaces the driver error. There, `"error desconocido"` is a *suffix* — acceptable. Only the five bare-fallback sites above lack the operation prefix.

**The apology ban holds absolutely.** Zero occurrences of `"Lo sentimos"`, `"Disculpá"`, `"Disculpas"`, `"Perdón"` anywhere in shipped code.

**Other error findings worth a line:**
- 🟡 `app/gob/analytics/export/actions.ts:183` — `"Error al verificar el bucket de Storage: …"` leaks infrastructure vocabulary to a government operator.
- 🟡 `lib/ui/use-layer-features.ts:87`, `components/panorama/DetailDrawer.tsx:723` — `"No se pudo cargar la capa."` / `"No se pudo cargar el historial."` name the failure but offer no retry.
- 🟢 `components/panorama/PanoramaDataTable.tsx:198-199` — *"No pudimos calcular el ranking / El cálculo falló en este momento. No es un resultado: no sabemos cómo está el alcance."* This is honest and well-written; it just has no retry affordance.
- ✅ `components/ErrorBoundary.tsx` says `"Algo salió mal"` but pairs it with a "Reintentar" button, a "Volver al inicio" link, and a copyable error code. For a genuinely unknown crash that is a defensible design, not a violation.

---

# Part 2 — Action naming

Seven write flows were traced end-to-end (button label → confirm dialog → success message → resulting status). **Four are consistent. Three drift.**

| Flow | Verdict | Drift |
|---|---|---|
| Registrar mascota | ✅ consistent | — |
| Avisar (avistaje / encontré) | ✅ consistent | — |
| Transferir custodia (cross-org handshake) | ✅ consistent | — |
| Resolver disputa | ✅ consistent | — |
| Reservar turno | ✅ consistent | — |
| Maltrato — gob triage side | ✅ consistent | — |
| **Marcar como perdida** | 🟠 **drifts** | `Marcar` → `Activamos` |
| **Denunciar maltrato (public submit)** | 🟠 **drifts** | `Enviar` → `registrada` |
| **Devolución (marcar recibida)** | 🟠 **drifts** | `Marcar` / `recibida` → `Confirmada` |

### 🟠 A1 — Marcar como perdida → "Activamos la búsqueda"

| Stage | file:line | String |
|---|---|---|
| Profile CTA | `components/pet-profile/PetActionRow.tsx:65` | `"Marcar como perdida"` |
| Sheet header | `app/(app)/mis-mascotas/[publicToken]/perdida/MarkLostWizard.tsx:206` | `"Marcar {petName} como perdida"` |
| Submit | `app/(app)/mis-mascotas/[publicToken]/perdida/MarkLostWizard.tsx:525` | `markLostActionLabel(petSex)` → `"Marcar como perdida/o"` |
| Success | `app/(app)/mis-mascotas/[publicToken]/perdida/MarkLostWizard.tsx:187` | **`"Activamos la búsqueda de {petName}"`** |

The verb the user clicked three times never reappears. *Fix:* `"{petName} está marcado/a como perdido/a — activamos la búsqueda"` keeps both the user's verb and the reassuring outcome.

### 🟠 A2 — Denunciar maltrato: "Enviar denuncia" → "fue registrada"

| Stage | file:line | String |
|---|---|---|
| Wizard submit | `app/(public)/denuncias/nueva/_components/Step5Contact.tsx:355` | `"Enviar denuncia →"` |
| Destination banner | `app/(public)/denuncias/codigo/[code]/page.tsx:223` | **`"Tu denuncia fue registrada."`** |

*Fix:* one of the two. `"Registrar denuncia"` → `"Tu denuncia fue registrada"` is the stronger pair, because "registrar" is what the system actually does and matches the event vocabulary.

**Note the contrast on the gob side of the same feature.** `app/gob/maltrato/[id]/TriageActions.tsx:76-95, 111, 115-121` is the best action-naming discipline in the codebase: each button (`Marcar revisada`, `Iniciar seguimiento`, `Cerrar con resolución`, `Sin sustento`, `Duplicada`) carries its own verb into `submitLabels`, with an explicit rule at `:111` — *"carries the verb of the act, never 'Confirmar'"*.

### 🟠 A3 — Devolución: "Marcar como recibida" → "Devolución confirmada"

| Stage | file:line | String |
|---|---|---|
| Submit | `app/(app)/mis-mascotas/[publicToken]/devolucion/ReturnAcceptanceCard.tsx:129` | `"Marcar como recibida"` |
| Success | `app/(app)/mis-mascotas/[publicToken]/devolucion/ReturnAcceptanceCard.tsx:53` | **`"Devolución confirmada. {petName} está de vuelta con vos."`** |

Soft sibling: `"Confirmar devolución de {petName}"` (`OwnerInitiateReturnForm.tsx:162`) → `"Devolución iniciada"` (`:61`). Arguably deliberate — it is not final until the org accepts — but it does swap the verb.

### 🟡 Generic labels where a specific verb is one line away

| file:line | Label | Suggested |
|---|---|---|
| `app/(app)/transferencias/[transferToken]/AcceptTransferActions.tsx:137` | bare `"Aceptar"` | `"Aceptar transferencia"` — **the same file's dialog says exactly that at `:147`** |
| `app/org/[orgToken]/transferencias/recibidas/IncomingTransferActions.tsx:105` | bare `"Aceptar"` | same, its own dialog at `:122` |
| `app/(public)/refugios/[orgToken]/sheets/SerVoluntarioSheet.tsx:138` | bare `"Enviar"` | `"Postularme"` |
| `app/(app)/mis-mascotas/[publicToken]/_emergencia/EmergencyContactSheet.tsx:74` | bare `"Guardar"` | `"Guardar contacto de emergencia"` |
| `app/org/[orgToken]/servicios/[offeringToken]/CapacityEditor.tsx:110` | bare `"Guardar"` | `"Guardar cupos"` — its own toast at `:69` already says `"Capacidad actualizada"` |

### 🟡 Generic success copy

| Severity | file:line | String |
|---|---|---|
| 🟡 | `lib/ui/action-feedback.ts:59` | `notifySaved(message = "Listo")` — **the app-wide toast default names nothing.** All ~35 live callers currently pass a specific message, so this is a latent landmine, not a firing bug. Making the parameter required would close it permanently. |
| 🟡 | `app/(app)/mis-mascotas/[publicToken]/_emergencia/EmergencyContactSheet.tsx:50` and `:70` | `notifySaved("Se guardó")` **and** inline `"Guardado."` — generic twice, neither names "contacto de emergencia" |
| 🟡 | `app/(app)/cuenta/editar/EditProfileForm.tsx:155` vs `:160` | banner says `"Tus datos fueron actualizados correctamente."`, toast two lines later says `"Perfil actualizado"` — **two different nouns for one save** |
| 🟢 | `components/ui/Sheet.tsx:109` | `ctaLabel` defaults to `"Guardar"`. All 27 current callers override it with a specific verb; latent risk only. |

**Two structural guards already prevent the worst of this class**, and they work: `components/ui/ConfirmDialog.tsx:44-55` makes `confirmLabel` mandatory so no dialog can ship a bare "Confirmar", enforced by `__tests__/confirm-label-grammar.guard.test.ts`. **Zero live violations.**

---

# Part 3 — One concept, one word

Ten synonym families were inventoried. Four are genuinely well-controlled; six drift.

| Family | Distinct terms | Dominant (rough count) | Recommendation | Why |
|---|---|---|---|---|
| **1. caso / expediente / denuncia / reporte** | 4 synonyms across 2 real entities | `denuncia` 404 · `caso` 85 · `expediente` 84 · `reporte` 18 | Keep `denuncia` **and** `caso` (they are legally distinct entities). **Drop `expediente` and `reporte`.** | The law says *denuncia* — `lib/domain/case-normatives.ts:74` (Ley 5325/1948 PBA): *"Denuncia obligatoria de enfermedades transmisibles"*. `expediente` appears in **no** legal digest; it is internal jargon that leaked into user-facing headers. The normative text itself reaches for *caso* when explaining the record (`case-normatives.ts:179`). |
| **2. mascota / animal** | 2 | `mascota` wins on **all four** surfaces (gob 140:29, owner 357:31, org 221:81, public 132:53) | `mascota` for the registered pet; `animal` only for the genuinely unregistered/stray case | The hypothesis "gob says animal" is **not supported**. The legal digest already models the split deliberately: `lib/reference/legal-knowledge-base.ts:64-68` — `whatItSays` says *"identificación electrónica animal"* (legal register) while `mimarObligation` says *"el identificador de tu mascota"* (product register). |
| **3. dueño / titular / propietario** | 3 (`tutor`, `guardián` unused) | roughly even — `titular` 27 · `dueño/a` 21 · `propietario` 12 | **`dueño/a`** | It anchors the canonical role label (`lib/utils/format.ts:465` `owner: "Dueño/a"`) and it is the word the law digest uses for the *person* — `lib/reference/legal-knowledge-base.ts:66, 82, 101, 116`, every `whoItAppliesTo` says *"Dueños que…"*. |
| **4. refugio / organización / entidad** | 3, but correctly tiered | `organización` (umbrella) with `refugio` as one *type* | Already sound; fold the single `entidad` | `app/org/page.tsx:25` — `ORG_TYPE_LABELS.shelter = "Refugio"`; this was a deliberate rename (`docs/superpowers/plans/2026-05-17-code-rename-refugio-to-org.md`). Only loose end: `app/gob/directorio/page.tsx:78` *"¿Esta entidad es legítima…?"* |
| **5. perdida / extraviada** | 2 (`desaparecida` unused) | `perdida` 156 : `extraviada` 9 | **`perdida`** | `extraviada` is confined to census/analytics denominator phrasing — one author's local habit, not a distinction. No legal anchor either way (`case-normatives.ts:99-105`: *lost_pet_episode* has "no specific framework"). |
| **6. turno / reserva / agenda** | 2 real overlaps | `turno` (routes, "Mis turnos", detail pages) | **`turno`**; `agenda` is a container, not a synonym | Only leak: `"Confirmar reserva"` at `app/(app)/turnos/buscar/[offeringToken]/reservar/[slotId]/BookingFormClient.tsx:73` and `.../page.tsx:97`. |
| **7. abierto / pendiente / en curso / en seguimiento / vigente** | legitimately 3+ concepts, **1 concrete drift** | — | Fix the drift, do **not** merge the rest | See S3. `Abierto` (case), `Pendiente` (request queue), `Vigente` (credential currency) are genuinely different. The drift is `in_progress` → `"En curso"` (canonical) vs `"En seguimiento"` (org screen). |
| **8. avistaje / avistamiento / hallazgo** | 3 | `avistaje` 9 : 1 : 1 | **`avistaje`** | One stray: `app/(public)/ayuda/page.tsx:88` *"reportar un avistamiento"*. |
| **9. custodia / tenencia / guarda** | 3 | `custodia` 187 : `tenencia` 3 : `guarda` 1 | **`custodia`** — the one case where the product term should beat the law's | The statute (Código Civil, digested at `lib/domain/case-normatives.ts:173`) says *"guarda"* and *"tenencia"*. `custodia` reads far clearer in an operational workflow ("assumes/transfers custody"), and it has already won 187:4. Keep `tenencia` only on `/leyes` where it paraphrases the statute (`app/(public)/leyes/page.tsx:123`). |
| **10. veterinario / profesional / matriculado** | not a collision | `Veterinario/a` | No action | These denote different things: the role (`components/pet-profile/AuthorChip.tsx:14`), the licence number (*matrícula*), and the permission tier (*profesional*). |

### 🟠 The same-screen collisions — cheapest and most embarrassing

- `app/admin/casos/page.tsx:149` title **"Casos"**, `:152` subtitle **"Expedientes abiertos en el sistema"**. Two words, one screen, one record.
- `app/admin/inteligencia/inteligencia-panels.tsx:271` — one KPI definition sentence: *"Registros activos sin ningún **titular** asociado y sin actividad del **propietario** en 12 meses."* Two words, one sentence, one person.
- `app/(public)/denuncias/page.tsx:108-110` — one paragraph says *"denuncias"* three times, then mid-sentence: *"tu **reporte** queda guardado"*. Same defect at `app/(app)/denuncias/[id]/page.tsx:238`.
- `app/org/[orgToken]/mascotas/page.tsx:226-232` — the H1 was already fixed to "Mascotas" (a code comment records the QA finding: *"sidebar said Mascotas, page said Animales en custodia"*), but the body copy at `:232` still says *"{n} animal bajo custodia activa"*.

---

# Part 4 — Remaining findings

### Gender agreement

| Severity | file:line | Finding |
|---|---|---|
| 🟠 | `app/gob/maltrato/_inspector/PetSubView.tsx:19-23, :35` | Hardcoded feminine `"Fallecida"` / `"Perdida"` while `pet.sex` renders on `:34`. A male pet reads "Fallecida" on a welfare-inspector card. `situationLabelForSex()` exists (`lib/utils/format.ts:734`) and is already used in three sibling views. |
| 🟡 | `app/(app)/mis-mascotas/nueva/MinimalNewPetForm.tsx:755-759` | `"Adoptado/a"`, `"Comprado/a"`, `"Encontrado/a en la calle"`, `"Regalado/a"`, `"Nacido/a en casa"` — the sex radio at `:393-417` is rendered *earlier in the same form* and stored in state at `:189`. |
| 🟡 | `components/PetForm.tsx:566-570` | Same five options. In edit mode `existingPet?.sex` is already a direct prop (`:319`). |

**The in-repo precedent is strong and should be the model.** `lib/utils/format.ts` holds 17 sex-aware helpers (`lostPosterHeadline`, `sterilizedLabel`, `lostLabel`, `registeredAdjective`, `foundParticiple`, `markLostActionLabel`, `situationLabelForSex`, `lastSeenHeadingLabel`, `sightingPhrase`, …), each with a comment recording the QA round that produced it. The public credential, cockpit, lost listing, poster and share sheet all route through them. The three sites above are the stragglers.

**Correctly left alone:** `Dueño/a`, `Veterinario/a`, `Administrador/a`, `Voluntario/a` — the app does not model a person's gender, only a pet's `sex`. Filter-chip category labels (`app/(public)/perdidas/page.tsx:288`, `LostFiltersBar.tsx:158`, `AdoptionFiltersBar.tsx:32,35,69,72`) are also correct: they filter across all pets, and the per-pet cards in the same files already call `lostLabel(item.sex)` / `sterilizedLabel(item.sex)` / `ageBucketLabel(item.adoptionAgeBucket, item.sex)`.

### Casing

🟢 `app/(app)/cuenta/upgrade/page.tsx:159` — `<LnCardHead title="Crear Organización" />`, Title Case, breaking the same file's convention 89 lines above (`:70` — `"Profesional veterinario"`). **This is the only Title Case defect in the codebase.** Sentence case is ~99% consistent across a sample of 250+ headings, card titles and buttons. ALL CAPS in production is always a CSS `uppercase` eyebrow treatment on a correctly-cased string, never a literal.

### Units

| Severity | Finding |
|---|---|
| 🟢 | **"h" spacing split two ways.** With space: `lib/infra/lost-listing.ts:55`, `components/pet-profile/LostScanFeed.tsx:311`, `app/admin/observaciones/page.tsx:71`, `lib/metrics/targets.ts:240, :248`, `app/gob/vigilancia/page.tsx:652`. Without: `app/gob/vigilancia/_components/OutbreakSignalRow.tsx:33`, `app/admin/sistema/crons/page.tsx:53, :55`, `src/modules/surveillance/application/process-eno-queue-batch.ts:152`, `app/gob/reglas/.../OpenInvestigationForm.tsx:66`. |
| 🟢 | **"kg" outlier.** `src/modules/foster/domain/matching-rules.ts:82, :88, :94` — `"({w}kg)"` against the otherwise universal `"N kg"`. |

`%` and count formatting are consistent. No spelled-out-vs-abbreviated mixing found.

### Accessibility of language

**This is the cleanest area of the audit.**

- **(a) Redundant `aria-label`s duplicating visible text: zero found** across ~50 inspected sites.
- **(b) `alt=""` on meaning-carrying images: zero.** Every `alt=""` found is genuinely decorative with an adjacent text equivalent — `IntentApplyBanner.tsx:83` (pet avatar beside the pet's name), `CredentialStreamedSections.tsx:247` (org logo, also `aria-hidden`, org name in text), `AdoptionListingCard.tsx:71` (pet photo in a card whose heading names the pet, with a code comment justifying it), `opengraph-image.tsx:122` (server-rendered OG meta, never in an accessibility tree). QR codes, evidence photos and document scans all carry real alt text.
- **(c) Appearance-over-purpose: 3, all mild.** 🟢 `app/(app)/mis-mascotas/[publicToken]/EventTimeline.tsx:213` (`alt="Foto adjunta"`), `components/pet-profile/LostScanFeed.tsx:198` and `:246`. Defensible — the app cannot know what a user-uploaded photo depicts — but purpose-bearing alt would be stronger (*"Foto de evidencia del avistaje del {fecha}"*).
- **(d) English `aria-label`s on the Spanish UI: zero.** The voseo voice is maintained in accessible names.

### Destructive confirmations

**Zero offenders.** All 24 `<ConfirmDialog>` call sites supply a `description` that names the consequence. `components/ui/ConfirmDialog.tsx:13-55` is a de-facto style guide (*"description must state the CONSEQUENCE… not just ask '¿Estás seguro?'"*) with `confirmLabel` deliberately having no default so omitting it is a compile error, backed by `__tests__/confirm-label-grammar.guard.test.ts`. There are **no** native `window.confirm` calls anywhere.

Exemplary rather than a finding: `app/gob/organizaciones/RevokeOrgActions.tsx:246-253` requires an uploaded evidence file, a typed motivo, and a checkbox reading *"Confirmo que quiero revocar la verificación de {org} — Esta acción genera un registro permanente en el audit log."*

Closest to weak, 🟢: `app/org/[orgToken]/miembros/RemoveMemberButton.tsx:58` — *"Esta acción eliminará al miembro de la organización."* restates the button's own verb rather than saying whether they can be re-invited.

---

# The catalogue fence — what it governs, and what it should

`pnpm verify` reports **"catalog-label imports clean"** from `scripts/check-metric-labels.ts:296`. What it actually governs:

- **Scope:** `{app,components}/**/*.tsx`, excluding `node_modules/`, `.design-sync/`, `__tests__/`, `*.test.tsx` (`scripts/check-metric-labels.ts:182-192`).
- **Rule:** a `.tsx` that renders a label already catalogued in `lib/metrics/kpi-catalog.ts` must **import** it rather than retype the string (`:212-257`). Inliners are grandfathered at a measured baseline (`INLINE_CATALOG_LABEL_BASELINE`, `:234`) and the ratchet only tightens.
- **Rationale, in its own words (`:222-223`):** *"An inline retype is exactly how the 42%/54% drift started: copy the string today, edit one copy tomorrow."*

**It governs KPI labels only.** None of this audit's systemic classes are inside it.

Sibling fences that already exist and prove the pattern generalises:

| Fence | Governs |
|---|---|
| `scripts/check-metric-labels.ts` | KPI catalogue labels (also detects two render sites diverging) |
| `scripts/check-pluralize-es.ts` | bans **new** ad-hoc `${n === 1 ? "" : "s"}` ternaries |
| `scripts/check-ui-invariants.ts` Rule 3 | accent linter — 13 words, `app/**` + `components/**` only |
| `__tests__/confirm-label-grammar.guard.test.ts` | bans a bare `"Confirmar"` confirm label |

**What these strings belong in.** Status labels are the strongest candidate: three canonical sources already exist (`CASE_STATUS_CONFIG`, `welfareReportStatusLabel`, `requestOutcomeLabel`) and 23 files retype around them — exactly the shape `check-metric-labels.ts` was built for. Extending its scan set from `KPI_CATALOG` labels to *"catalogued status labels"* reuses the whole machine, baseline included.

The three highest-value fence extensions, in order:

1. **Widen the accent linter** (`check-ui-invariants.ts` Rule 3) to `src/**` + `lib/**` and grow the wordlist. Closes S6's 30 defects and every future one.
2. **Add status labels to the catalogue fence** (`check-metric-labels.ts`). Closes S3's 23 dictionaries and prevents the 24th.
3. **Widen the pluralisation check** (`check-pluralize-es.ts`) from "ban new ternaries" to "flag `${expr} <plural-noun>` without `pluralizeEs`". Converts S4's 29-site sweep into a ratchet.

---

# Severity roll-up

| Severity | Count | What they are |
|---|---|---|
| 🔴 | **4** | `"proximamente"` on a government surface · outbox 5-min promise vs 04:00 cron · service-offering email promise · adoption-application email promise (5 strings, one class) |
| 🟠 | **31** | S1 12-hour leak · S2 hand-rolled formatters + lost timezone · S3 five-ways `open` + 23 dictionaries + welfare drift + `PetSubView` feminine · S4 13 high-visibility plural sites · S5 16 tuteo + 2 usted · S6 orthography clusters · S8 two public-surface dead ends · S9 six dot-decimal sites · A1/A2/A3 verb drift · four same-screen synonym collisions |
| 🟡 | **26** | S4 lower-visibility plural sites · S8 dead-end empty states · S10 error fallbacks · generic labels (5) · generic success copy (3) · gender `/a` options (2) · `capá al máximo` · `reserva`/`turno` · `entidad` |
| 🟢 | **12** | Title Case (1) · unit spacing (2 classes) · `alt="Foto adjunta"` (3) · `avistamiento` stray · `extraviada` in census · `sugerencias` page · `RemoveMemberButton` circular copy · census `aria-label` plurals |

**Systemic (10 classes) vs one-off:** ten systemic classes account for roughly 145 individual instances. The one-off findings number about 20. **The systemic classes are where the value is** — five of them are closed by extending a fence that already exists.

---

# The three changes with the best consistency-gained per line-touched

### 1. Widen the accent linter — ~30 lines of config, closes 30 defects and the class forever

`scripts/check-ui-invariants.ts` Rule 3 already exists, already runs in `pnpm verify`, and already knows how to fail a build on an unaccented word. It is simply pointed at the wrong scope with too small a wordlist.

- Add `src/**` and `lib/**` to its scan set — this alone makes the worst file in the audit (`src/modules/surveillance/application/outbreak-investigation.ts`, 9 defects) visible.
- Grow the wordlist from 13 to cover the `-ción`/`-sión` family, the `-ico`/`-ica` family, plus `dias`, `maximo`, `minimo`, `proximo`, `proximamente`, `ultimo`, `esta`→`está`, `tenes`→`tenés`, `tamano`, `dueno`, `nino`, `senal`, `ano`.

**Gained:** all 30 orthography defects, including the 🔴 `"proximamente"` on the government export screen — and no 31st can ever ship. **Touched:** one config block in one file.

### 2. `hourCycle: "h23"` — three lines, closes the hybrid clock on the flagship surface

- `lib/utils/format.ts:32-39` — one line on `SPANISH_DATETIME_FORMAT` fixes **every** `formatDateTime()` consumer at once.
- `components/panorama/PanoramaConsole.tsx:4623-4629` and `components/panorama/PanoramaKpiFooter.tsx:82-88` — one line each kills the confirmed `"05:39 p. m."` on the Panorama masthead and footer, the two most-looked-at timestamps on the government console.

The pattern to copy is 50 lines away in the same file (`format.ts:88-90`), comment included.

**Gained:** the single most-seen formatting defect, on the surface being shown to outside eyes. **Touched:** three lines.

### 3. One import in `app/org/[orgToken]/maltrato/recibidos/page.tsx` — closes two status drifts and sets the precedent

Delete the local `STATUS_LABELS` map at `:26-33` and import `welfareReportStatusLabel` from `src/modules/welfare/domain/types.ts:107`.

- Closes `"En seguimiento"` vs canonical `"En curso"`.
- Closes `"Triagueada"` vs canonical `"Revisada"`.
- Ends a state where two operators reading the same `welfare_reports` row see two different statuses.
- Enforces a rule the codebase has **already written down and is currently violating** — `app/gob/maltrato/MaltratoQueueScreen.tsx:455-460`: *"ONE status vocabulary… Never an inline synonym here."*

**Gained:** the clearest cross-surface contradiction in the product, plus the worked example for the other 22 dictionaries. **Touched:** one import, one deletion, ~8 lines.

---

*End of audit.*
