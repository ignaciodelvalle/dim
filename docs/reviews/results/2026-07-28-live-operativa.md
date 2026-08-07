# Live review — operator queues & surveillance (2026-07-28)

**Ground truth:** `integration/all-20260703` @ `796a583f`

```
$ git -C C:/dev/dim branch --show-current && git -C C:/dev/dim rev-parse --short HEAD
integration/all-20260703
796a583f
```

**Captured (role `govt` = `govt@dim.test`, plus `admin@dim.test` where noted):**
`/gob/cola`, `/gob/casos`, `/gob/casos?expediente=disputas`, `/gob/denuncias`,
`/gob/denuncias?etapa=moderacion`, `/gob/vigilancia`, `/gob/vigilancia/brotes`,
`/gob/vigilancia/zoonosis`, `/gob/padron`, `/gob/historial`, `/gob/perdidas`,
`/gob/maltrato`, `/gob/outbox`, `/gob/operativos`, `/gob/decomisos`, plus details
`/gob/casos/CAS-338W-R92E`, `/gob/casos/CAS-GPC7-C7JR`, `/gob/casos/CAS-5FXG-XXPG`,
`/gob/casos/CAS-S7QU-CRFU`, `/gob/casos/DEMO-DECOMISO-0001`,
`/gob/disputas/DIS-7RHN-JAQR`.

Artifacts live under `C:/Users/ignac/.claude/jobs/c64395a5/tmp/review/operativa/`.
No data was mutated: every dialog was opened and then cancelled/escaped.

---

## Findings

### P1-1 — The "Atrasadas" tab hides 3 of the 7 denuncias the app itself badges as VENCIDO, including a CRÍTICA one

**What I saw:** on `/gob/denuncias?etapa=triage&queue=all` (23 rows) exactly seven rows
carry a red overdue badge:

```
DEN-DGBD-HYXE      | CRÍTICA — PELIGRO INMEDIATO | SLA 1 DÍA · VENCIDO HACE 13 DÍAS
PERF-COV-DEN-0003  | CRÍTICA — PELIGRO INMEDIATO | SLA 1 DÍA · VENCIDO HACE 3 DÍAS
PERF-COV-DEN-0002  | ALTA — URGENTE              | SLA 3 DÍAS · VENCIDO HACE 1 DÍA
DEN-RMSU-PHKP      | MEDIA                       | SLA 7 DÍAS · VENCIDO HACE 26 DÍAS
DEN-QQHF-2QN9      | MEDIA                       | SLA 7 DÍAS · VENCIDO HACE 8 DÍAS
DEN-2Q26-PW2P      | MEDIA                       | SLA 7 DÍAS · VENCIDO HACE 0 DÍAS
DEN-7RAG-UKZ9      | BAJA                        | SLA 14 DÍAS · VENCIDO HACE 25 DÍAS
```

`?queue=overdue` ("Atrasadas") headlines **"Denuncias (5 en total)"** and lists:

```
DEN-DGBD-HYXE, DEN-RMSU-PHKP, DEN-QQHF-2QN9, DEN-2Q26-PW2P, DEN-8X2J-N2P2
```

Three genuinely breached rows are **missing** — `PERF-COV-DEN-0003` (crítica, 3 days past
a 1-day SLA), `PERF-COV-DEN-0002` (alta, 1 day past a 3-day SLA), `DEN-7RAG-UKZ9`
(25 days past a 14-day SLA). Meanwhile `DEN-8X2J-N2P2` *is* in the tab even though its
own badge reads **"HISTÓRICO · SIN SLA ACTIVO"**.
(screenshots: `queue_all.png`, `queue_overdue.png`; raw: `probe7.log.txt`)

**Why it's wrong:** the row badge and the tab that is supposed to *collect* those rows use
two different definitions of "atrasada". An official whose habit is "open Atrasadas, work
the list" never sees a crítica denuncia that is already past its response window. The
count "5" is also simply wrong against the seven badges rendered on the same data.

**Cause:** `lib/analytics/dashboards/welfare.ts:239-243`

```ts
case "overdue":
  // Status still open AND created more than 7 days ago without triage.
  conditions.push(eq(welfareReports.status, "open"));
  conditions.push(lt(welfareReports.createdAt, new Date(Date.now() - SEVEN_DAYS_MS)));
```

— a flat 7-day rule plus `status = 'open'`, while the badge uses the severity-tiered
`isSlaBreached` (1/3/7/14 days, any non-terminal status) in
`app/gob/maltrato/_lib/welfare-sla.ts:69-78`. `welfare-sla.ts:10-18` documents the
divergence in its own header and was never reconciled with the tab.

**Fact or opinion:** fact

---

### P1-2 — `/gob/perdidas` "Recuperadas" lists the whole padrón and calls it "Mascotas recuperadas (260)"

**What I saw:** the same screen, at the same instant, states both:

- KPI tile: **"RECUPERADOS (30D) 2"**, and **"TASA DE REUNIFICACIÓN 40,0% · meta 39% · 2 de 5 episodios (30d) · 4 pérdidas activas ahora"**
- List tab "Recuperadas" → heading **"Mascotas recuperadas (260)"**, 260 rows, every row
  badged **`ACTIVA`** (not "recuperada").

Totals across the tabs: `lost` 4 · `active` 260 · `deceased` 8 · `all` 272. The
"Recuperadas" tab is the whole living padrón minus the lost ones.
(screenshots: `perdidas_active.png`, `gob_perdidas.desktop.png`; raw: `probe9.log.txt`)

**Why it's wrong:** an official reading "Mascotas recuperadas (260)" concludes 260 animals
were reunited. The truthful figure on the same page is 2. This is the single worst number
I found: it is off by two orders of magnitude and it is the headline of a list.

**Cause:** `app/gob/perdidas/page.tsx:53-58` maps the tab to `status=active` —

```ts
{ value: "active", label: "Recuperadas" },
```

— and `app/gob/perdidas/page.tsx:450` prints `{tab.value === "active" && "Mascotas recuperadas"}`.
`pets.status='active'` means "not lost and not deceased", which includes every pet that was
never lost at all.

**Fact or opinion:** fact

---

### P1-3 — "Paso 3 · Caso — Denuncias escaladas a un caso regulatorio: ABIERTOS 28". Zero denuncias have escalated.

**What I saw:** bottom of `/gob/denuncias`:

> **Paso 3 · Caso**
> Denuncias escaladas a un caso regulatorio, con seguimiento formal.
> **ABIERTOS 28** · Ver casos →

(screenshot: `gob_denuncias.desktop.png`)

Filtering the case queue by the corresponding kind, at every status:

```
/gob/casos?kind=welfare_denuncia                → 0 rows — "No hay casos abiertos en tu jurisdicción."
/gob/casos?kind=welfare_denuncia&status=all     → 0 rows — "Sin casos en tu jurisdicción por ahora."
/gob/casos?kind=welfare_denuncia&status=closed  → 0 rows — "No hay casos cerrados en tu jurisdicción."
```

The 28 are: 13 `custody_episode` + 11 `custody_dispute` + 4 `lost_pet_episode`. None is a
welfare denuncia. (raw: `probe1.log.txt`, `probe5.log.txt`)

**Why it's wrong:** the number is presented as the yield of the denuncia pipeline the
operator is standing in. It is actually "every open case of any kind in my jurisdiction" —
mostly custody paperwork that has nothing to do with Ley 14.346. It tells an official the
escalation path is working when it has produced nothing.

**Cause:** `app/gob/denuncias/page.tsx:95-98` — the count carries no kind filter:

```ts
profile.role === "admin"
  ? countCasesForAdmin({ status: "open" })
  : countCasesForGovt(jurisdictions, { status: "open" }),
```

rendered at `app/gob/denuncias/page.tsx:169-179` directly under the copy
`"Denuncias escaladas a un caso regulatorio, con seguimiento formal."`.

**Fact or opinion:** fact

---

### P1-4 — Case detail is read-only for every kind. An official cannot act on any row of the Casos queue.

**What I saw:** I opened five case details spanning four kinds. The complete set of
interactive controls on each page, excluding the app shell:

```
/gob/casos/CAS-338W-R92E     (custody_dispute, 650 días abierto) → ["Activar mapa interactivo"]
/gob/casos/CAS-GPC7-C7JR     (custody_dispute, Bruno)            → []
/gob/casos/CAS-5FXG-XXPG     (custody_episode, 650 días)         → ["Activar mapa interactivo"]
/gob/casos/CAS-S7QU-CRFU     (lost_pet_episode, hoy)             → []
/gob/casos/DEMO-DECOMISO-0001(custody_episode / decomiso)        → []
```

(screenshot: `caso_detalle.png`; raw: `probe5.log.txt`)

`CAS-338W-R92E` is the **top row of the queue under the default "Urgencia" sort** — the
single most urgent expediente the screen can show an operator. It opens to a page with
cards for Partes, Jurisdicción, Normativa aplicable, Motivo de apertura, Ubicación, and
nothing to press.

**Why it's wrong:** this is the rubric's second P1 condition verbatim — the official cannot
act on a case. The Casos queue's own hub copy promises "Casos regulatorios y disputas de
custodia comparten la misma gramática de expediente — **abrir, sumar partes, resolver**".
The detail offers none of the three verbs.

**Fact or opinion:** fact

---

### P1-5 — "Urgencia" sorts the fetched page, not the queue (plan unit SC-6)

**What I saw:** `/gob/casos` defaults to `Ordenar por: [Urgencia] Recientes` with Urgencia
active. As `admin` (universal scope, 3 063 cases, 50 per page) I walked the keyset pages
and recomputed each row's urgency exactly as the app does (`age_days × kind severity
weight`, weights from `src/modules/cases/domain/case-kinds.ts:79-92`):

```
PAGE  1  url=/gob/casos                      maxScore= 76  oldestAgeDays=38
PAGE  2  url=/gob/casos?cursor=…ZmU0Y2M0Ni…  maxScore= 76  oldestAgeDays=38
…
PAGE 11  url=/gob/casos?cursor=…MjFiMTg1OWE…  maxScore= 76  oldestAgeDays=38
PAGE 12  url=/gob/casos?cursor=…MDc5ZjFlYTg…  maxScore=184  oldestAgeDays=92
         top row: CAS-KN4H-A5S3 Custodia temporal 27 de abril de 2026 age=92 score=184
```

Header on page 1: **"Mostrando los 50 más recientes de 3.063"**. In the govt operator's own
scope the oldest open expedientes are `CAS-338W-R92E` / `CAS-5FXG-XXPG` at
**650 días** — urgency score 1 300, i.e. **17× the highest score reachable on page 1**.
(raw: `probe3.log.txt`)

**Why it's wrong:** the fetch is `ORDER BY openedAt DESC LIMIT 50` and the urgency sort is a
client-side `useMemo` over that array. Urgency = *age* × weight, so the ranking is inverted
against the fetch: the 50 rows the server hands you are precisely the 50 *least* aged, and
the truly urgent long tail is unreachable from the top of the queue. The queue is lying
about what matters most, exactly as the plan unit predicted.

A second, sharper symptom of the same formula: on page 1 the **bottom three rows are open
`Mascota perdida` cases opened today** (`CAS-S7QU-CRFU`, `CAS-QSA5-7QDC`, `CAS-J6RR-T857`),
age 0 → score 0. Under `status=all` they rank **below 15 closed expedientes**, because a
closed case also scores 0 and the tie-break is oldest-first. A lost-pet report filed an
hour ago — the most time-critical thing in a reunification window — sits under resolved
paperwork in the "Urgencia" ordering.

**Cause:** `components/ui/dashboard/CaseQueue.tsx:204-213` sorts only the `rows` prop;
`app/gob/casos/CasosScreen.tsx:132-147` fetches `GOVT_CASOS_PAGE_LIMIT + 1 = 51` rows and
`lib/infra/case-queries.ts:706` / `:782` order by `desc(cases.openedAt), desc(cases.id)`.
`caseUrgencyScore` (`CaseQueue.tsx:66-71`) is never expressed in SQL.

**Fact or opinion:** fact

---

### P1-6 — Custody disputes are double-booked: 11 in the "Casos" tab, 1 in the "Disputas" tab, same dispute under two codes, and only one of the two can be resolved

**What I saw:** two tabs of the *same* hub, `/gob/casos`:

| Tab | Header count | "Disputa de custodia" rows |
|---|---|---|
| Casos (`?expediente=casos`) | `28 casos` | **11** |
| Disputas (`?expediente=disputas`) | `1 caso` | **1** |

The single Disputas row and one of the eleven Casos rows are visibly the same real dispute:

```
Casos    : CAS-GPC7-C7JR | Disputa de custodia | ABIERTO | Bruno | Palermo, CABA | 26 de julio de 2026
Disputas : DIS-7RHN-JAQR | Disputa de custodia | ABIERTO | Bruno | Palermo, CABA | 26 de julio de 2026
```

Opening both:

- `/gob/casos/CAS-GPC7-C7JR` → chip **`ABIERTO`**, "PARTES: Abrió: Graciela Saavedra",
  **zero actions**.
- `/gob/disputas/DIS-7RHN-JAQR` → chip **`ABIERTA`**, both parties (Graciela Saavedra ·
  Reclamante / Noelí Assandri · Dueño actual), `+ Sumar parte`, a full **"Resolver disputa"**
  form and **"Escalar a vía judicial"**.

(screenshots: `gob_casos_expediente_disputas.desktop.png`, `disputa_detalle.png`; raw:
`probe5.log.txt`)

**Why it's wrong:** three failures stacked. (a) The count is wrong whichever way you read
it — an official who opens "Disputas" concludes there is one custody dispute in their
jurisdiction while the sibling tab lists eleven. (b) The same dispute carries two public
codes; quoting `CAS-GPC7-C7JR` to a citizen or a court references a record whose sibling
page holds the actual parties and resolution. (c) Route matters for capability: arriving via
the tab that shows *eleven* disputes lands you on a page where you cannot resolve anything;
only the tab that shows *one* reaches the working screen.

**Cause:** two independent stores rendered through one component.
`app/gob/disputas/DisputasScreen.tsx:66-89` reads the `custody_disputes` table and maps
`publicCode: dispute.publicToken` (`DIS-…`, detail `/gob/disputas/[token]`), while
`app/gob/casos/CasosScreen.tsx:132-187` reads `cases` where `case_kind='custody_dispute'`
(`CAS-…`, detail `/gob/casos/[code]`). Nothing reconciles them, and the hub subtitle
("Casos regulatorios y disputas de custodia comparten la misma gramática de expediente")
asserts they do.

**Fact or opinion:** fact

---

### P2-1 — The surveillance map paints custody paperwork as epidemiological geography

**What I saw:** `/gob/vigilancia`, titled **"Mapa de vigilancia — Señales de zoonosis y
enfermedades reportables detectadas en tu cobertura"**. Every epidemiological indicator on
the page is zero or empty:

```
BROTES ACTIVOS 0 · RÁBICAS ACTIVAS 0 · CASOS BAJO INVESTIGACIÓN ACTIVA 0 · DENSIDAD ATM/AMR 0
CUMPLIMIENTO OBSERVACIÓN 10D —  ·  SLA NOTIFICACIÓN ENO —
"Señales recientes: Sin señales registradas en miMAR"
"Señales por enfermedad (últimos 30 días): Sin señales registradas en miMAR"
```

…and the only map on the screen is captioned **"Casos abiertos por jurisdicción"** with the
legend `< 3,8 · 3,8–<6,6 · 6,6–<9,4 · 9,4–<12 · ≥ 12`.
(screenshot: `gob_vigilancia.desktop.png`, text: `gob_vigilancia.txt`)

**Why it's wrong:** that choropleth is fed by `fetchCasesPerLocality`, whose only predicate
is `eq(cases.status, "open")` — every open case of every kind. For this operator that is 24
custody episodes/disputes and 4 lost pets, zero of them epidemiological. On a screen whose
purpose is outbreak geography, and whose every honest signal reads 0, the map is the one
element with colour on it. I stopped short of P1 because the number is arithmetically
correct for the phrase "casos abiertos"; it becomes P1 the moment an operator reads the map
as risk, which is the only reason a map is on this page.

**Cause:** `lib/analytics/dashboards/surveillance.ts:449-476` (`fetchCasesPerLocality`,
`const conditions = [eq(cases.status, "open")]`), wired at
`app/gob/vigilancia/page.tsx:155` and labelled at `:255-260` / `:781`.

**Fact or opinion:** fact (the wiring); opinion (that "Casos abiertos" is the wrong layer for
this screen)

---

### P2-2 — "BRECHA DE ESCALAMIENTO" displays the bite count, not a gap

**What I saw:** `/gob/vigilancia` tile

> **BRECHA DE ESCALAMIENTO (MORDEDURAS VS. OBSERVACIONES)**
> **4**
> vs 0 observaciones rábicas abiertas — la ausencia de escalamiento no implica ausencia de riesgo

**Why it's wrong:** the big number is `escalationGap.bites12m` — bites reported in 12
months — displayed under a label that names a *gap*. Here 4 bites − 0 observations = 4, so
the two coincide and nothing looks off; with 4 bites and 3 open observations the tile would
still read **4** while the gap is **1**. The catalog entry knows this
(`lib/metrics/kpi-catalog.ts:1246`: *"Not a ratio: the two counts measure different
populations … shown side by side, not divided"*) — the label on screen does not.

Corroborating oddity: `/gob/casos?kind=bite_incident` returns **0 rows at every status**, so
none of those 4 bites exists as an actionable expediente anywhere in the operator's queues.

**Cause:** `app/gob/vigilancia/page.tsx:413` — `value={formatCount(escalationGap.bites12m)}`
under the catalog label `bite_escalation_gap` (`lib/metrics/kpi-catalog.ts:1240-1242`).

**Fact or opinion:** fact

---

### P2-3 — "SLA 7 DÍAS · VENCIDO HACE 0 DÍAS"

**What I saw:** `DEN-2Q26-PW2P` on `/gob/denuncias` renders a **red/danger** pill reading
exactly `SLA 7 DÍAS · VENCIDO HACE 0 DÍAS`. (raw: `probe7.log.txt`, `gob_denuncias.txt:215`)

**Why it's wrong:** a danger-toned badge that says the breach is zero days old is
self-contradictory; a reader parses it as "not actually overdue" and deprioritises a row the
system has flagged. The honest string is "vence hoy" or "vencido hoy".

**Cause:** `components/ui/dashboard/SlaBadge.tsx:70-78`. The *breach test* is millisecond
math (`ageMs > tierDays * DAY_MS`, `welfare-sla.ts:76-77`) while the *overdue count* is
calendar-day math (`calendarDaysAgoInAr`) floored at zero:

```ts
const ageDays = calendarDaysAgoInAr(createdAt, now);
const overdueDays = Math.max(ageDays - tierDays, 0);
```

Any report between 7.0 and 7.99 days old is `breached === true` with `overdueDays === 0`.

**Fact or opinion:** fact

---

### P2-4 — A raw database column name is rendered to the official as applicable law

**What I saw:** on every custody-dispute case detail, the "NORMATIVA APLICABLE" card:

> **Proceeding judicial específico**
> Detalle en \`external_proceeding_reference\` del dispute. Cada caso tiene su propia carátula y juzgado

(screenshot: `caso_detalle.png`)

**Why it's wrong:** the operator is being told the legal basis for a custody dispute and is
handed a Postgres column name in backticks plus a half-translated heading ("Proceeding
judicial específico"). It is the one card on the page that is supposed to be quotable in a
formal context. Violates the es-AR-UI / English-code split.

**Cause:** `lib/domain/case-normatives.ts:177-179`.

**Fact or opinion:** fact

---

### P2-5 — A case contradicts its own timeline by three days

**What I saw:** `/gob/casos/CAS-GPC7-C7JR` header says
**"Abierto el 26 de julio de 2026 a las 10:54 a. m."**; the page's single timeline entry
says **"Disputa de custodia iniciada — 23 de julio de 2026 a las 09:00 a. m."**. The queue's
Apertura column for the same row says `26 de julio de 2026`, and the twin record
`/gob/disputas/DIS-7RHN-JAQR` shows the same split (parties "Sumada el 26 de jul de 2026",
timeline "23 de jul de 2026"). (raw: `probe4.log.txt`, `probe5.log.txt`)

**Why it's wrong:** in an expediente, the opening date is the clock everything else is
measured against — SLA, prescription, the urgency score on the queue. Two dates for it on
one screen means neither can be quoted.

**Fact or opinion:** fact (the discrepancy). I did not trace which of the two is canonical.

---

### P2-6 — The Casos queue hides the animal on 21 of 28 open rows, including disputes whose sibling view knows the name

**What I saw:** `/gob/casos`, column **MASCOTA**, is `—` on 21 of 28 open rows — all 13
`Custodia temporal` and 10 of 11 `Disputa de custodia`. The Disputas tab renders `Bruno` for
its row, and `/gob/disputas/DIS-7RHN-JAQR` shows `Bruno · Perro · Beagle`.
(text: `gob_casos.txt:102-205`)

**Why it's wrong:** the column exists precisely so an operator can scan for the animal.
`CaseQueue.tsx:87` documents that dispute rows "always join a pet — petId is NOT NULL there",
so at least for the 10 blank disputes the data exists and the Casos path is not fetching it.

**Fact or opinion:** fact (the blanks); opinion (that the data is retrievable on the Casos
path — I verified it only for the one dispute that appears in both views)

---

### P2-7 — Two labels for the same act, side by side (`Tomar` / `Asignármela`)

**What I saw:** on `/gob/denuncias` with the inspector open, the list row offers **`Tomar`**
and the inspector panel three centimetres to the right offers **`Asignármela`** under the
heading "Asignación". Both self-assign the same denuncia; both are on screen simultaneously.
The row's action reads **`Marcar revisada →`**, the inspector's button reads
**`Marcar revisada`**, and the panel it opens is titled **`Marcar como revisada`** — three
spellings of one verb within one viewport.
(screenshot: `denuncia_confirm_panel.png`)

**Why it's wrong:** an operator learning the surface has to discover that two differently
named buttons do the same thing, and that a fourth phrase is the same act again.

**Cause:** `app/gob/maltrato/_components/TomarButton.tsx:56-58` vs the inspector's own
assignment control; `TriageActions.tsx:76` / `:104`.

**Fact or opinion:** fact

---

### P2-8 — `Tomar` mutates on one click with no confirmation and no undo affordance

**What I saw:** the `Tomar` button on every triage row assigns the denuncia to the current
operator immediately (`{pending ? "Tomando..." : "Tomar"}`), then hard-reloads the page.
There is no dialog, no toast with an undo, and no visible "soltar/desasignar" on the row
afterwards. I did **not** press it (that would mutate seeded data), so this is read from
`app/gob/maltrato/_components/TomarButton.tsx:29-58`.

**Why it's wrong:** taking ownership of a Ley 14.346 case is an assignment of institutional
responsibility, and it is one misclick away on a dense list where the adjacent button
(`Marcar revisada →`) is a *navigation*, not a mutation. Two buttons of identical size,
adjacent, one navigates and one commits.

**Fact or opinion:** fact (no confirmation); opinion (that it warrants one)

---

### P3-1 — Missing accents in a live operator dialog

**What I saw:** the Reasignar dialog on `/gob/decomisos` (screenshot `dlg_reasignar.png`):

- field label **"Motivo de reasignacion (opcional)"** → *reasignación*
- placeholder **"Por ej: el refugio anterior rechazo por falta de espacio."** → *rechazó*

**Cause:** `app/gob/decomisos/_components/ReasignarButton.tsx:130` and `:137`.
**Fact or opinion:** fact

---

### P3-2 — Raw role key `owner` shown in the dispute timeline

**What I saw:** `/gob/disputas/DIS-7RHN-JAQR` → "Historia de custodia":
`Disputa de custodia iniciada  23 de jul de 2026 · owner` and
`Mascota registrada  26 de jul de 2025 · owner`. (screenshot: `disputa_detalle.png`)

An untranslated internal actor key in the audit-facing section of a legal expediente.
**Fact or opinion:** fact

---

### P3-3 — Four date formats for the same field family

`hace 14 días` (denuncias) · `16 de octubre de 2024` (casos queue) ·
`16 de octubre de 2024 a las 07:00 a. m.` (case detail, monospace) ·
`16 de jul de 2026` (aprobaciones, disputa detail) · `21 de julio de 2026` + a standing
`7 días` counter (decomisos). **Fact or opinion:** fact

---

### P3-4 — Free-text minimums differ 20× across the same operator's day

`Resolver disputa` demands **100** characters; welfare triage/close demands **10**;
approval rejection and "pedir más información" demand **5**; the bulk bar has its own
`minReason`. Nothing on screen explains why resolving a dispute needs twenty times the
justification of rejecting a matrícula.
Sources: `app/gob/disputas/[disputeToken]` ("Resumen de la resolución (mínimo 100
caracteres)"), `TriageActions.tsx:137`, `ReviewActions.tsx:162,192`.
**Fact or opinion:** fact (the numbers); opinion (that the spread is unjustified)

---

## Tray chip anatomy comparison (plan unit D.4)

Six queue surfaces. **Five distinct row anatomies** — Casos and Disputas share the
`CaseQueue` component but diverge in the chrome wrapped around it.

| Queue | Row shape | Left of the row | Right of the row | Count placement | State style | Date format | Row actions |
|---|---|---|---|---|---|---|---|
| **Denuncias · Triage** `/gob/denuncias` | card (`<li>`) | tipo as title → severity pill → SLA pill → `Palermo, CABA · hace 14 días` → code badge + `SIN ASIGNAR` | two stacked buttons (`Tomar`, `Marcar revisada →`) | in card head, parenthetical: **"Denuncias (15 en total)"** + a tab badge `Triage 15` | uppercase mono pill top-right, amber — `ABIERTA` / `REVISADA` | **relative** — `hace 14 días` | yes, 2 |
| **Casos** `/gob/casos` | table row | `CÓDIGO` cell (blue mono badge) | `APERTURA` cell | standalone line above the table: **"28 casos"** / **"Mostrando los 50 más recientes de 3.063"** | uppercase pill in its own `ESTADO` column — `ABIERTO` / `CERRADO` | **absolute, full month** — `16 de octubre de 2024`, plus a `650 DÍAS` pill only when age ≥ 14 | none |
| **Disputas** `/gob/casos?expediente=disputas` | table row (same component) | same | same | **"1 caso"** — the word *caso* for a *disputa*; plus a `Todos / Abiertos / Cerrados` chip strip the Casos tab suppresses | `ABIERTO` in the queue — but `ABIERTA` on the detail | same | none |
| **Decomisos** `/gob/decomisos` | card | **code** as title → `Greta (Perro)` → pet token `DIM-DEMO-0002` → state pill → `Abierto el 21 de julio de 2026` → `Sin refugio asignado` | large numeral `7` over the word `días`, then `Ver caso` / `Reasignar` / `Devolver al dueño` | **none for the list** — only a KPI `DECOMISOS DEL PERÍODO 0` that disagrees with the 2 rows (explicitly caveated) | long descriptive uppercase pill — `EN CUSTODIA OFICIAL (SIN REFUGIO ASIGNADO)` | **absolute, full month + a standing day counter** | yes, 2–3 |
| **Pérdidas** `/gob/perdidas` | card | pet **name** as title → `PERRO` pill + `PERDIDA` pill → `Palermo, CABA` | relative age only | in card head: **"Mascotas perdidas (4)"** | two uppercase pills, species then state, both left-aligned inline | **relative** — `hace 9 h`, `hace 2 meses` | none, and **no code at all** |
| **Aprobaciones** `/gob/cola` | card with a selection checkbox | checkbox → request type as title → `Dra. Carla Pérez · Recoleta, CABA` → `APR-8RFB-E924 · 16 de jul de 2026` | (detail link) | **prose sentence**: "1 solicitud pendiente." | **no state chip at all** | **absolute, abbreviated month** — `16 de jul de 2026` | none on the row |

**How many distinct anatomies: five.** Counted per axis the divergence is worse:
**4 count placements** (card-head parenthetical / standalone line / prose sentence / none),
**4 date formats** (relative / absolute-full / absolute-abbreviated / absolute + standing
counter), **4 state treatments** (mono pill top-right / pill in a table column / long
descriptive pill / none), and **4 code placements** (bottom-left after the location / first
table column / card title / trailing the applicant). No two queues put the identifier, the
state and the date in the same three places.

Concrete cost, same record two ways: `DEMO-DECOMISO-0001` shows a prominent `7 días` in
Decomisos and **no age at all** in Casos (the pill only appears at ≥ 14 days,
`CaseQueue.tsx:428-429`). The operator has to know which screen they are on to know whether
the absence of an age badge means "young" or "this queue doesn't show age".

Screenshots: `gob_denuncias.desktop.png`, `gob_casos.desktop.png`,
`gob_casos_expediente_disputas.desktop.png`, `gob_decomisos.desktop.png`,
`gob_perdidas.desktop.png`, `admin/gob_cola.desktop.png`.

---

## Confirmation grammar inventory (plan unit D.3)

Every dialog below was **opened and then cancelled/escaped**. Nothing was confirmed.

| Action | Surface | Chrome | Title | Confirm label | Cancel label | Verb in the confirm? |
|---|---|---|---|---|---|---|
| Devolver al dueño | `/gob/decomisos` | native `<dialog>` modal | `Devolver al dueño — DEMO-DECOMISO-0002` | **Confirmar devolución** | Cancelar | ✅ |
| Reasignar | `/gob/decomisos` | native `<dialog>` modal | `Reasignar decomiso — DEMO-DECOMISO-0001` | **Confirmar reasignación** | Cancelar | ✅ |
| Generar export fiscal MPF | denuncia inspector | native `<dialog>` modal | `Generar export fiscal MPF` | **Generar PDF** | Cancelar | ✅ (but not "Confirmar…") |
| Aprobar | `/gob/cola/[token]` | inline panel, no modal | *(none — a "Verificación obligatoria" fieldset)* | **Confirmar aprobación** | Cancelar | ✅ |
| Rechazar | `/gob/cola/[token]` | inline panel, no modal | *(none)* | **Confirmar rechazo** | Cancelar | ✅ |
| Pedir más información | `/gob/cola/[token]` | inline panel, no modal | *(none)* | **Enviar pedido** | Cancelar | ✅ |
| Marcar revisada · Iniciar seguimiento · Cerrar con resolución · Sin sustento · Duplicada | `/gob/denuncias` inspector, `/gob/maltrato/[id]` | inline panel, no modal | `Marcar como revisada`, `Cerrar con resolución`, `Cerrar por falta de sustento`, `Marcar como duplicada`, `Iniciar seguimiento` | **Confirmar** (generic, all five) | Cancelar | ❌ |
| Any bulk action | `OpBulkBar` | native `<dialog>` modal | = the action's own label | **Confirmar** (hardcoded) | Cancelar | ❌ |
| Resolver disputa | `/gob/disputas/[token]` | **no confirmation** — inline form, direct submit | — | **Resolver disputa** | *(no cancel)* | ✅ |
| Escalar a vía judicial | `/gob/disputas/[token]` | (under "Otras acciones") | — | `Escalar a vía judicial` | — | — |
| Tomar | `/gob/denuncias` row | **no confirmation** — one click, immediate mutation | — | — | — | — |

**How many grammars: six**, plus two paths with no confirmation at all.

1. Modal + `Confirmar <sustantivo del acto>` — decomisos.
2. Modal + a different verb entirely (`Generar PDF`) — MPF export.
3. Inline panel + `Confirmar <sustantivo>` — aprobaciones.
4. Inline panel + generic `Confirmar` — **the entire welfare triage queue**, i.e. the
   highest-traffic destructive surface in the app.
5. Modal + hardcoded generic `Confirmar` regardless of the action — `OpBulkBar.tsx:158`.
6. No confirmation, direct submit — `Resolver disputa`, `Tomar`.

The asymmetry is upside-down: reassigning one decomiso (reversible, one animal) gets a modal
plus a named confirm; **closing a Ley 14.346 denuncia — terminal, append-only, unappealable
from the UI — gets an inline `Confirmar`** with no modal and no "esta acción no se puede
deshacer". Only the decomiso dialogs carry that sentence at all.

`ConfirmDialog` itself is sound: native `<dialog>` + `showModal()`, `aria-modal`,
`aria-labelledby`, focus restore via `triggerRef` (`components/ui/ConfirmDialog.tsx:156-159`).
The problem is that only 4 of the 11 consequential actions use it.

---

## Gendered state chips (plan unit D.2)

Only unambiguous disagreements are listed. Where a chip legitimately agrees with an implied
masculine noun ("el caso", "el expediente") I have said so rather than padding the list.

| # | String on screen | Noun it describes | Problem | Where | Type |
|---|---|---|---|---|---|
| 1 | **`ABIERTO`** (queue) vs **`ABIERTA`** (detail) | *la disputa* `DIS-7RHN-JAQR` | The same record, same field, both genders, two clicks apart. One of them is wrong by construction. | `/gob/casos?expediente=disputas` vs `/gob/disputas/DIS-7RHN-JAQR` | fact |
| 2 | KPI **`RECUPERADOS (30D)`** vs tab **`Recuperadas`** vs heading **`Mascotas recuperadas`** | *las mascotas* | Masculine and feminine for one concept, on one screen, ~200 px apart. `Recuperados` disagrees with the noun. | `/gob/perdidas` (`page.tsx:326` vs `:55` / `:450`) | fact |
| 3 | **`Dueño actual`** next to *Noelí Assandri* | a named party | The app's own house style elsewhere is `dueño/a` — e.g. the search box on this very operator's `/gob/perdidas` reads "Buscar por nombre de mascota o **dueño/a**". Two conventions in one console. | `/gob/disputas/[token]` | fact (the inconsistency) |
| 4 | `Estado: ABIERTO / CERRADO` on rows whose `Tipo` is feminine (`Disputa de custodia`, `Custodia temporal`, `Mascota perdida`, `Denuncia de bienestar`, `Investigación de brote`) | *el caso* / *el expediente* | Defensible in isolation — the chip is about the case, not the type. Listed because it is what makes #1 possible: the shared chip has no idea what noun it is agreeing with. | `/gob/casos` | opinion |

**Clean:** the denuncias queue (`ABIERTA` / `REVISADA` / `CERRADA` / `DUPLICADA` — all
agree with *la denuncia*) and the pérdidas rows (`PERDIDA` / `ACTIVA` / `FALLECIDA` — all
agree with *la mascota*, including on male animals, which is correct). I pressed on both
and found nothing.

---

## Counters checked

Everything below was verified by comparing the displayed number against the rows actually
rendered in the same DOM.

**Disagreed (findings above):**

| Counter | Says | Reality |
|---|---|---|
| `/gob/denuncias` → `Atrasadas` | 5 | 7 rows carry a `VENCIDO` badge; 3 of them are absent, 1 present row says "sin SLA activo" — **P1-1** |
| `/gob/perdidas` → `Mascotas recuperadas` | 260 | 2 recovered (page's own KPI); 260 = the whole active padrón — **P1-2** |
| `/gob/denuncias` → `Paso 3 · Caso · ABIERTOS` | 28 | 0 escalated denuncias — **P1-3** |
| `/gob/casos` Disputas tab | `1 caso` | 11 custody disputes in the sibling tab — **P1-6** |
| `/gob/vigilancia` `BRECHA DE ESCALAMIENTO` | 4 | that is the bite count, not a gap — **P2-2** |

**Agreed (I checked, they held):**

| Counter | Value | Rows rendered |
|---|---|---|
| `/gob/denuncias` tab badge `Triage` | 15 | 15 |
| `/gob/denuncias` tab badge `Moderación` | 0 | empty state |
| KPI `SIN ASIGNAR` ↔ `Sin asignar` tab | 15 ↔ 15 | 15 |
| Workqueue `Urgentes` / `Sin asignar` / `Mías` / `Todas` | 4 / 15 / 0 / 23 | 4 / 15 / 0 / 23 |
| `/gob/casos` default | `28 casos` | 28 |
| `/gob/casos?status=all` | `43 casos` | 43 |
| `/gob/casos?status=closed` | `15 casos` | 15 |
| `/gob/casos` by kind: dispute + episode + lost | 11 + 13 + 4 = 28 | matches the unfiltered 28 |
| `/gob/casos` as admin | `Mostrando los 50 más recientes de 3.063` | 50 |
| `/gob/perdidas` `PÉRDIDAS ACTIVAS` ↔ list | 4 ↔ `Mascotas perdidas (4)` | 4 |
| `/gob/perdidas` tabs sum | 4 + 260 + 8 = 272 | `Todas las mascotas (272)` |
| `/gob/perdidas` `TASA DE REUNIFICACIÓN` | 40,0% = 2/5 | consistent with its own sub-line |
| `/gob/perdidas` `ANTIGÜEDAD MEDIA (DÍAS)` | 21 | consistent with 3 same-day losses + one ~84-day loss rendered as "hace 2 meses" — I suspected this one and it held |
| `/gob/cola` as admin | `1 solicitud pendiente.` | 1 |
| `/gob/historial` | `32 entradas` | one collapsed group `×32` |
| `/gob/padron` balance | +264 − 10 = +254 | matches `ALTAS NETAS REGISTRADAS +254` |
| `/gob/decomisos` `DECOMISOS DEL PERÍODO 0` vs 2 rows | — | **not a finding**: the page prints "El período seleccionado no filtra este listado: sólo afecta los indicadores de arriba." That is the right way to handle it. |

---

## What I pressed and it held

- **Keyset pagination on `/gob/casos`.** Walked 12 pages as admin reading the `href` of
  "Ver más antiguos →" rather than clicking; every cursor was distinct and monotonic, no
  loops, no skipped rows. (An earlier click-driven pass appeared to repeat a page; that was
  a hydration race in my own script, not the app. Not reported.)
- **Filter persistence across pagination.** `status=all` and `kind=` survive a page turn —
  the `casoEstado !== "open"` guard at `CasosScreen.tsx:157` does what its comment claims.
- **Jurisdiction fencing.** The govt operator's queues never showed a row outside CABA /
  Santa Cruz / Tierra del Fuego across 15 routes and ~400 rows.
- **`ConfirmDialog` accessibility.** Native `<dialog>` + `showModal()`, `aria-modal="true"`,
  `aria-labelledby`, focus restored to the trigger, Escape closes without firing the action.
  I tried to break it with Escape mid-dialog on both decomiso actions; it cancelled cleanly.
- **Console and network.** Zero console errors on all 15 captured routes. The only failed
  requests were `?_rsc=` prefetch aborts (excluded per the noise rule).
- **Denuncias state-chip gender.** Went looking for `ABIERTO` on *la denuncia* and did not
  find it — that queue is consistent.
- **`/gob/perdidas` "Antigüedad media"** — looked wrong against 4 visible rows (3 of them
  hours old); recomputed against the coarse "hace 2 meses" formatter and it reconciles.
  Not a finding.
- **Empty states.** `/gob/vigilancia/brotes` ("Sin señales registradas en miMAR — la
  ausencia de señales no implica ausencia de enfermedad") and `/gob/outbox` state what the
  absence of data does *not* prove. That posture is right, and it is what makes P2-1 stand
  out: the same screen that refuses to overclaim in prose paints a map from the wrong table.

---

## Method notes

Captures via `e2e/demo/_capture-live.ts` (own chromium, `MSYS_NO_PATHCONV=1`). Interaction
probes were throwaway Playwright scripts written **outside** the repo, under
`C:/Users/ignac/.claude/jobs/c64395a5/tmp/opq-probe{1..9}.ts`, reusing
`e2e/demo/_helpers.ts`'s `loginAs`. Logs: `probe{1,2,3,4,5,6,7,8,9}.log.txt` in the artifact
directory. No `pnpm build`, no `pnpm verify`, no `pnpm test`, no git mutation, no data
mutation; this file is the only thing written inside `C:/dev/dim`.
